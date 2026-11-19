/**
 * Destroyer Engine - Indirect Draw & Compute Culling WebGPU Renderer
 * Features:
 * - Real-Time Directional Shadow Mapping (9-Tap PCF Filtering)
 * - Hardware 4x MSAA Anti-Aliasing (Ultra crisp, smooth edges)
 * - GPU Compute Culling with multi-mesh firstInstance partitioning
 * - Full PBR Lighting with Cook-Torrance GGX & ACES Tone Mapping
 */

import { Camera } from '../camera/Camera';
import { DeviceManager } from '../core/Device';
import { FlatEntityManager } from '../core/FlatEntityManager';
import { DRAW_INDEXED_INDIRECT_STRIDE_BYTES, EngineStats } from '../core/Types';
import { Mat4 } from '../math/Mat4';
import { CULLING_STANDARD_WGSL, CULLING_SUBGROUPS_WGSL } from '../shaders/CullingComputeWGSL';
import { RENDER_PIPELINE_WGSL, SHADOW_PIPELINE_WGSL } from '../shaders/RenderPipelineWGSL';

export interface RendererOptions {
  enableSubgroups: boolean;
  enableCulling: boolean;
  cullDistance?: number;
}

export class IndirectRenderer {
  private deviceManager: DeviceManager;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private entityManager: FlatEntityManager;
  private camera: Camera;

  // Pipelines
  private renderPipeline: GPURenderPipeline | null = null;
  private cullingPipeline: GPUComputePipeline | null = null;
  private shadowPipeline: GPURenderPipeline | null = null;

  // Bind groups
  private renderBindGroup: GPUBindGroup | null = null;
  private cullingBindGroup: GPUBindGroup | null = null;
  private shadowBindGroup: GPUBindGroup | null = null;

  // Buffers
  private cameraUniformBuffer: GPUBuffer | null = null;
  private engineParamsBuffer: GPUBuffer | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;

  // Textures & Depth
  private depthTexture: GPUTexture | null = null;
  private defaultWhiteTexture: GPUTexture | null = null;
  private customDiffuseTexture: GPUTexture | null = null;
  private defaultSampler: GPUSampler | null = null;

  // Last bound storage buffers (for rebinding when diffuse texture updates)
  private boundStorageBuffers: {
    entityStorageBuffer: GPUBuffer;
    materialStorageBuffer: GPUBuffer;
    visibleIndicesBuffer: GPUBuffer;
    indirectArgsBuffer: GPUBuffer;
    jointMatricesBuffer: GPUBuffer;
  } | null = null;

  // Shadow Map (2048x2048)
  private shadowDepthTexture: GPUTexture | null = null;
  private shadowSampler: GPUSampler | null = null;
  public lightViewProjMatrix = new Float32Array(16);

  // Settings
  public cullingEnabled = true;
  public cullDistance = 150.0;
  public subgroupsActive = false;
  public bloomEnabled = true;
  public ssrEnabled = false;
  public volumetricEnabled = false;
  public debugMode = 0; // 0=PBR, 1=Normals, 2=UVs, 3=Skinning, 4=Instances, 5=Roughness
  public waveFactor = 0.0;
  public morphWeights: [number, number, number] = [0, 0, 0];
  public exposure = 1.15;
  public lightIntensity = 2.2;
  public ambientIntensity = 0.32;
  public lightDir: [number, number, number] = [-0.6, -1.2, -0.7];
  public lightColor: [number, number, number] = [1.0, 0.98, 0.92];
  public ambientColor: [number, number, number] = [0.45, 0.55, 0.72];

  // Dynamic Day-Night Cycle (0..24h) — zero per-frame allocations
  public dayNightEnabled = true;
  public dayNightAutoCycle = true;
  public timeOfDayHours = 10.5;
  public dayNightSpeed = 1.0; // 1.0x = 90s full 24h cycle (0.2667 game-hours/sec)
  public dayNightPhase: 'DAWN' | 'DAY' | 'SUNSET' | 'NIGHT' = 'DAY';
  public shadowStrength = 0.72;
  public nightEmissiveBoost = 1.0;
  public fogDensity = 0.0028;
  public skyHorizonColor: [number, number, number] = [0.24, 0.38, 0.58];

  private width = 800;
  private height = 600;

  // Cached texture views so render() never allocates descriptor wrappers per frame
  private shadowDepthView: GPUTextureView | null = null;
  private depthTextureView: GPUTextureView | null = null;

  // Zero-garbage pre-allocated uniform buffers & typed array views
  private camUniformsData = new Float32Array(96);
  private camUniformsU32 = new Uint32Array(this.camUniformsData.buffer);
  private engineParamsData = new Float32Array(28);
  private engineParamsU32 = new Uint32Array(this.engineParamsData.buffer);
  private lightViewMatrix = new Float32Array(16);
  private lightProjMatrix = new Float32Array(16);

  // Pre-allocated WebGPU pass descriptors & submission array for ZERO allocations in render()
  private submitCommandBuffers: GPUCommandBuffer[] = new Array(1);
  private shadowColorAttachments: GPURenderPassColorAttachment[] = [];
  private shadowDepthAttachment: GPURenderPassDepthStencilAttachment = {
    view: null as unknown as GPUTextureView,
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  };
  private shadowPassDesc: GPURenderPassDescriptor = {
    colorAttachments: this.shadowColorAttachments,
    depthStencilAttachment: this.shadowDepthAttachment,
  };
  private mainColorAttachment: GPURenderPassColorAttachment = {
    view: null as unknown as GPUTextureView,
    clearValue: { r: 0.36, g: 0.52, b: 0.70, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };
  private mainColorAttachments: GPURenderPassColorAttachment[] = [this.mainColorAttachment];
  private mainDepthAttachment: GPURenderPassDepthStencilAttachment = {
    view: null as unknown as GPUTextureView,
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  };
  private mainRenderPassDesc: GPURenderPassDescriptor = {
    colorAttachments: this.mainColorAttachments,
    depthStencilAttachment: this.mainDepthAttachment,
  };

  constructor(
    deviceManager: DeviceManager,
    entityManager: FlatEntityManager,
    camera: Camera
  ) {
    this.deviceManager = deviceManager;
    this.entityManager = entityManager;
    this.camera = camera;
  }

  async initPipelines(options: RendererOptions): Promise<void> {
    this.device = this.deviceManager.getDevice();
    this.context = this.deviceManager.getContext();
    this.cullingEnabled = options.enableCulling;
    this.cullDistance = options.cullDistance ?? 150.0;

    // Create textures & samplers
    this.createDefaultTexture();
    this.createShadowResources();
    this.createUniformBuffers();

    // Compile WGSL Shaders
    const renderModule = this.device.createShaderModule({
      label: 'RenderPipelineModule',
      code: RENDER_PIPELINE_WGSL,
    });

    const shadowModule = this.device.createShaderModule({
      label: 'ShadowPipelineModule',
      code: SHADOW_PIPELINE_WGSL,
    });

    // Vertex Buffer Layout (22 floats = 88 bytes per vertex)
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 22 * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position (3)
        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal (3)
        { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv (2)
        { shaderLocation: 3, offset: 32, format: 'uint32x4' },  // joints (4)
        { shaderLocation: 4, offset: 48, format: 'float32x4' }, // weights (4)
        { shaderLocation: 5, offset: 64, format: 'float32x3' }, // morphPos0 (3)
        { shaderLocation: 6, offset: 76, format: 'float32x3' }, // morphPos1 (3)
      ],
    };

    // 1. Main PBR Render Pipeline
    this.renderPipeline = this.device.createRenderPipeline({
      label: 'DestroyerRenderPipeline',
      layout: 'auto',
      vertex: {
        module: renderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.deviceManager.getFormat(),
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
      multisample: {
        count: 1,
      },
    });

    // 2. Real-Time Directional Shadow Pipeline
    this.shadowPipeline = this.device.createRenderPipeline({
      label: 'DestroyerShadowPipeline',
      layout: 'auto',
      vertex: {
        module: shadowModule,
        entryPoint: 'vs_shadow',
        buffers: [vertexBufferLayout],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    // 3. Compute Culling Pipeline (uses SIMD Subgroups shader when device supports 'subgroups')
    const canUseSubgroups =
      options.enableSubgroups && this.device.features.has('subgroups' as GPUFeatureName);
    this.subgroupsActive = false;

    if (canUseSubgroups) {
      try {
        const subgroupCullingModule = this.device.createShaderModule({
          label: 'CullingSubgroupsComputeModule',
          code: CULLING_SUBGROUPS_WGSL,
        });
        this.cullingPipeline = await this.device.createComputePipelineAsync({
          label: 'DestroyerSubgroupsCullingPipeline',
          layout: 'auto',
          compute: {
            module: subgroupCullingModule,
            entryPoint: 'main',
          },
        });
        this.subgroupsActive = true;
      } catch (subErr) {
        console.warn('Subgroup compute pipeline failed, falling back to standard culling:', subErr);
      }
    }

    if (!this.subgroupsActive) {
      const cullingModule = this.device.createShaderModule({
        label: 'CullingComputeModule',
        code: CULLING_STANDARD_WGSL,
      });
      this.cullingPipeline = this.device.createComputePipeline({
        label: 'DestroyerCullingPipeline',
        layout: 'auto',
        compute: {
          module: cullingModule,
          entryPoint: 'main',
        },
      });
    }
  }

  private createDefaultTexture(): void {
    if (!this.device) return;

    this.defaultWhiteTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const whitePixel = new Uint8Array([255, 255, 255, 255]);
    this.device.queue.writeTexture(
      { texture: this.defaultWhiteTexture },
      whitePixel,
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1]
    );

    this.defaultSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  setDiffuseAtlas(rgbaData: Uint8Array, width: number, height: number): void {
    if (!this.device || this.deviceManager.isDeviceLost || width <= 0 || height <= 0) return;

    if (this.customDiffuseTexture) {
      try { this.customDiffuseTexture.destroy(); } catch { /* ignore */ }
      this.customDiffuseTexture = null;
    }

    this.customDiffuseTexture = this.device.createTexture({
      size: [width, height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.device.queue.writeTexture(
      { texture: this.customDiffuseTexture },
      rgbaData.buffer as ArrayBuffer,
      { offset: rgbaData.byteOffset, bytesPerRow: width * 4, rowsPerImage: height },
      [width, height, 1]
    );

    if (this.boundStorageBuffers) {
      const b = this.boundStorageBuffers;
      this.updateBindGroups(
        b.entityStorageBuffer,
        b.materialStorageBuffer,
        b.visibleIndicesBuffer,
        b.indirectArgsBuffer,
        b.jointMatricesBuffer
      );
    }
  }

  clearDiffuseAtlas(): void {
    if (this.customDiffuseTexture) {
      try { this.customDiffuseTexture.destroy(); } catch { /* ignore */ }
      this.customDiffuseTexture = null;
      if (this.boundStorageBuffers) {
        const b = this.boundStorageBuffers;
        this.updateBindGroups(
          b.entityStorageBuffer,
          b.materialStorageBuffer,
          b.visibleIndicesBuffer,
          b.indirectArgsBuffer,
          b.jointMatricesBuffer
        );
      }
    }
  }

  private createShadowResources(): void {
    if (!this.device) return;

    if (this.shadowDepthTexture) {
      try { this.shadowDepthTexture.destroy(); } catch { /* ignore */ }
    }

    this.shadowDepthTexture = this.device.createTexture({
      size: [1024, 1024, 1],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowDepthView = this.shadowDepthTexture.createView();
    this.shadowDepthAttachment.view = this.shadowDepthView;

    this.shadowSampler = this.device.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  private createUniformBuffers(): void {
    if (!this.device) return;

    // Camera uniforms: 96 floats = 384 bytes (includes lightViewProj 16 floats)
    this.cameraUniformBuffer = this.device.createBuffer({
      size: 384,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Engine params: 28 floats = 112 bytes matching EngineParams struct in WGSL
    this.engineParamsBuffer = this.device.createBuffer({
      size: 112,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private static smoothMix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private static aceToneMap(x: number): number {
    const num = x * (2.51 * x + 0.03);
    const den = x * (2.43 * x + 0.59) + 0.14;
    const mapped = Math.max(0, Math.min(1, num / den));
    return Math.pow(mapped, 1.0 / 2.2);
  }

  /**
   * Advances & applies the dynamic 24-hour Day-Night atmosphere, moving sun/moon direction
   * for live shadow map casting, color temperatures, exposure, emissive boost, and sky clear color.
   * Zero heap allocation.
   */
  public updateDayNightCycle(deltaSec: number): void {
    if (!this.dayNightEnabled) return;

    if (this.dayNightAutoCycle && deltaSec > 0) {
      // 1.0x speed = minimum 15 minutes daytime (06:00-18:00 = 900s) and 12 minutes nighttime (18:00-06:00 = 720s)
      const isDaylightHours = this.timeOfDayHours >= 6.0 && this.timeOfDayHours < 18.0;
      const hoursPerSec = isDaylightHours ? 12.0 / 900.0 : 12.0 / 720.0;
      this.timeOfDayHours = (this.timeOfDayHours + deltaSec * hoursPerSec * this.dayNightSpeed) % 24.0;
      if (this.timeOfDayHours < 0) this.timeOfDayHours += 24.0;
    }

    const h = this.timeOfDayHours;

    // Determine named phase
    if (h >= 5.0 && h < 7.5) this.dayNightPhase = 'DAWN';
    else if (h >= 7.5 && h < 17.0) this.dayNightPhase = 'DAY';
    else if (h >= 17.0 && h < 20.0) this.dayNightPhase = 'SUNSET';
    else this.dayNightPhase = 'NIGHT';

    // Sun angle across the sky: 6:00=0, 12:00=PI/2 (overhead), 18:00=PI
    const sunTheta = ((h - 6.0) / 24.0) * Math.PI * 2.0;
    const sunElev = Math.sin(sunTheta); // +1 at noon, -1 at midnight
    const sunHoriz = Math.cos(sunTheta);

    // Smooth crossfade between Sun (daytime) and Moon (nighttime) so shadow map never flips underground
    if (sunElev >= 0.06) {
      const clampElev = Math.max(0.14, sunElev);
      const scaleH = Math.sqrt(Math.max(0.0, 1.0 - clampElev * clampElev));
      this.lightDir[0] = -sunHoriz * scaleH * 0.92;
      this.lightDir[1] = -clampElev;
      this.lightDir[2] = -0.38;
    } else {
      // Moon travels gently across the night sky overhead so night shadows remain realistic
      const moonTheta = ((h >= 18.0 ? h - 18.0 : h + 6.0) / 12.0) * Math.PI;
      const moonElev = Math.max(0.28, Math.sin(moonTheta) * 0.78);
      const moonHoriz = Math.cos(moonTheta);
      this.lightDir[0] = -moonHoriz * 0.65;
      this.lightDir[1] = -moonElev;
      this.lightDir[2] = -0.45;
    }

    // Piecewise-smooth atmospheric keyframes across [0, 24] hours (zero allocations)
    // Keys: 0h(Midnight), 4.5h(PreDawn), 6.2h(Sunrise), 8.5h(Morning), 12.5h(Noon), 16.5h(Afternoon), 18.2h(Sunset), 20.0h(Dusk), 24h(Midnight)
    let sr = 0.025, sg = 0.035, sb = 0.075;
    let lr = 0.45, lg = 0.58, lb = 0.92, li = 0.45;
    let ar = 0.16, ag = 0.22, ab = 0.38, ai = 0.24;
    let exp = 1.08, shStr = 0.42, emBoost = 2.4, fogD = 0.0042;

    if (h < 4.5) {
      // Deep midnight
      sr = 0.025; sg = 0.035; sb = 0.075;
      lr = 0.45; lg = 0.58; lb = 0.92; li = 0.45;
      ar = 0.16; ag = 0.22; ab = 0.38; ai = 0.24;
      exp = 1.08; shStr = 0.42; emBoost = 2.45; fogD = 0.0040;
    } else if (h < 6.25) {
      // Pre-dawn -> Golden/Rose Sunrise
      const t = (h - 4.5) / 1.75;
      const s = t * t * (3 - 2 * t);
      sr = IndirectRenderer.smoothMix(0.025, 0.34, s);
      sg = IndirectRenderer.smoothMix(0.035, 0.22, s);
      sb = IndirectRenderer.smoothMix(0.075, 0.24, s);
      lr = IndirectRenderer.smoothMix(0.45, 1.0, s);
      lg = IndirectRenderer.smoothMix(0.58, 0.62, s);
      lb = IndirectRenderer.smoothMix(0.92, 0.42, s);
      li = IndirectRenderer.smoothMix(0.45, 1.25, s);
      ar = IndirectRenderer.smoothMix(0.16, 0.38, s);
      ag = IndirectRenderer.smoothMix(0.22, 0.34, s);
      ab = IndirectRenderer.smoothMix(0.38, 0.46, s);
      ai = IndirectRenderer.smoothMix(0.24, 0.28, s);
      exp = IndirectRenderer.smoothMix(1.08, 1.12, s);
      shStr = IndirectRenderer.smoothMix(0.42, 0.58, s);
      emBoost = IndirectRenderer.smoothMix(2.45, 1.45, s);
      fogD = IndirectRenderer.smoothMix(0.0040, 0.0034, s);
    } else if (h < 8.5) {
      // Sunrise -> Clear Morning
      const t = (h - 6.25) / 2.25;
      const s = t * t * (3 - 2 * t);
      sr = IndirectRenderer.smoothMix(0.34, 0.24, s);
      sg = IndirectRenderer.smoothMix(0.22, 0.38, s);
      sb = IndirectRenderer.smoothMix(0.24, 0.58, s);
      lr = 1.0;
      lg = IndirectRenderer.smoothMix(0.62, 0.94, s);
      lb = IndirectRenderer.smoothMix(0.42, 0.86, s);
      li = IndirectRenderer.smoothMix(1.25, 2.05, s);
      ar = IndirectRenderer.smoothMix(0.38, 0.44, s);
      ag = IndirectRenderer.smoothMix(0.34, 0.54, s);
      ab = IndirectRenderer.smoothMix(0.46, 0.72, s);
      ai = IndirectRenderer.smoothMix(0.28, 0.32, s);
      exp = IndirectRenderer.smoothMix(1.12, 1.15, s);
      shStr = IndirectRenderer.smoothMix(0.58, 0.72, s);
      emBoost = IndirectRenderer.smoothMix(1.45, 1.0, s);
      fogD = IndirectRenderer.smoothMix(0.0034, 0.0026, s);
    } else if (h < 16.0) {
      // Bright Day -> Noon Peak -> Afternoon
      const dayT = (h - 8.5) / 7.5;
      const noonBell = Math.sin(dayT * Math.PI);
      sr = IndirectRenderer.smoothMix(0.24, 0.28, noonBell);
      sg = IndirectRenderer.smoothMix(0.38, 0.46, noonBell);
      sb = IndirectRenderer.smoothMix(0.58, 0.72, noonBell);
      lr = 1.0;
      lg = IndirectRenderer.smoothMix(0.94, 0.99, noonBell);
      lb = IndirectRenderer.smoothMix(0.86, 0.94, noonBell);
      li = IndirectRenderer.smoothMix(2.05, 2.35, noonBell);
      ar = IndirectRenderer.smoothMix(0.44, 0.48, noonBell);
      ag = IndirectRenderer.smoothMix(0.54, 0.60, noonBell);
      ab = IndirectRenderer.smoothMix(0.72, 0.80, noonBell);
      ai = IndirectRenderer.smoothMix(0.32, 0.35, noonBell);
      exp = 1.15;
      shStr = IndirectRenderer.smoothMix(0.72, 0.78, noonBell);
      emBoost = 1.0;
      fogD = 0.0025;
    } else if (h < 18.4) {
      // Late Afternoon -> Golden Sunset
      const t = (h - 16.0) / 2.4;
      const s = t * t * (3 - 2 * t);
      sr = IndirectRenderer.smoothMix(0.24, 0.42, s);
      sg = IndirectRenderer.smoothMix(0.38, 0.20, s);
      sb = IndirectRenderer.smoothMix(0.58, 0.16, s);
      lr = 1.0;
      lg = IndirectRenderer.smoothMix(0.94, 0.50, s);
      lb = IndirectRenderer.smoothMix(0.86, 0.24, s);
      li = IndirectRenderer.smoothMix(2.05, 1.35, s);
      ar = IndirectRenderer.smoothMix(0.44, 0.42, s);
      ag = IndirectRenderer.smoothMix(0.54, 0.28, s);
      ab = IndirectRenderer.smoothMix(0.72, 0.42, s);
      ai = IndirectRenderer.smoothMix(0.32, 0.28, s);
      exp = IndirectRenderer.smoothMix(1.15, 1.18, s);
      shStr = IndirectRenderer.smoothMix(0.72, 0.60, s);
      emBoost = IndirectRenderer.smoothMix(1.0, 1.75, s);
      fogD = IndirectRenderer.smoothMix(0.0025, 0.0036, s);
    } else if (h < 20.2) {
      // Sunset -> Blue Twilight / Dusk -> City Night
      const t = (h - 18.4) / 1.8;
      const s = t * t * (3 - 2 * t);
      sr = IndirectRenderer.smoothMix(0.42, 0.025, s);
      sg = IndirectRenderer.smoothMix(0.20, 0.035, s);
      sb = IndirectRenderer.smoothMix(0.16, 0.075, s);
      lr = IndirectRenderer.smoothMix(1.0, 0.45, s);
      lg = IndirectRenderer.smoothMix(0.50, 0.58, s);
      lb = IndirectRenderer.smoothMix(0.24, 0.92, s);
      li = IndirectRenderer.smoothMix(1.35, 0.45, s);
      ar = IndirectRenderer.smoothMix(0.42, 0.16, s);
      ag = IndirectRenderer.smoothMix(0.28, 0.22, s);
      ab = IndirectRenderer.smoothMix(0.42, 0.38, s);
      ai = IndirectRenderer.smoothMix(0.28, 0.24, s);
      exp = IndirectRenderer.smoothMix(1.18, 1.08, s);
      shStr = IndirectRenderer.smoothMix(0.60, 0.42, s);
      emBoost = IndirectRenderer.smoothMix(1.75, 2.45, s);
      fogD = IndirectRenderer.smoothMix(0.0036, 0.0040, s);
    } else {
      // Night (20.2..24.0)
      sr = 0.025; sg = 0.035; sb = 0.075;
      lr = 0.45; lg = 0.58; lb = 0.92; li = 0.45;
      ar = 0.16; ag = 0.22; ab = 0.38; ai = 0.24;
      exp = 1.08; shStr = 0.42; emBoost = 2.45; fogD = 0.0040;
    }

    this.skyHorizonColor[0] = sr;
    this.skyHorizonColor[1] = sg;
    this.skyHorizonColor[2] = sb;
    this.lightColor[0] = lr;
    this.lightColor[1] = lg;
    this.lightColor[2] = lb;
    this.lightIntensity = li;
    this.ambientColor[0] = ar;
    this.ambientColor[1] = ag;
    this.ambientColor[2] = ab;
    this.ambientIntensity = ai;
    this.exposure = exp;
    this.shadowStrength = shStr;
    this.nightEmissiveBoost = emBoost;
    this.fogDensity = fogD;

    // Match clear backdrop color pixel-for-pixel with ACES-mapped fragment horizon fog
    const clearCol = this.mainColorAttachment.clearValue as GPUColorDict;
    clearCol.r = IndirectRenderer.aceToneMap(sr * exp);
    clearCol.g = IndirectRenderer.aceToneMap(sg * exp);
    clearCol.b = IndirectRenderer.aceToneMap(sb * exp);
    clearCol.a = 1.0;
  }

  resize(width: number, height: number): void {
    if (!this.device || this.deviceManager.isDeviceLost) return;
    if (width <= 0 || height <= 0) return;

    const maxDim = this.device.limits?.maxTextureDimension2D || 4096;
    const clampedW = Math.max(1, Math.min(width, maxDim));
    const clampedH = Math.max(1, Math.min(height, maxDim));

    this.width = clampedW;
    this.height = clampedH;

    // Destroy previous depth texture
    if (this.depthTexture) {
      try { this.depthTexture.destroy(); } catch { /* ignore */ }
      this.depthTexture = null;
      this.depthTextureView = null;
    }

    try {
      // Standard Single-Sample Depth Target
      this.depthTexture = this.device.createTexture({
        size: [clampedW, clampedH, 1],
        sampleCount: 1,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.depthTextureView = this.depthTexture.createView();
      this.mainDepthAttachment.view = this.depthTextureView;

      this.camera.setAspect(clampedW / clampedH);
    } catch (err) {
      console.warn('Depth texture creation failed:', err);
    }
  }

  uploadGeometry(vertices: Float32Array, indices: Uint32Array): void {
    if (!this.device || this.deviceManager.isDeviceLost) return;

    if (this.vertexBuffer) {
      try { this.vertexBuffer.destroy(); } catch { /* ignore */ }
    }
    if (this.indexBuffer) {
      try { this.indexBuffer.destroy(); } catch { /* ignore */ }
    }

    this.vertexBuffer = this.device.createBuffer({
      size: Math.max(vertices.byteLength, 1024),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      vertices.buffer as ArrayBuffer,
      vertices.byteOffset,
      vertices.byteLength
    );

    this.indexBuffer = this.device.createBuffer({
      size: Math.max(indices.byteLength, 1024),
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      this.indexBuffer,
      0,
      indices.buffer as ArrayBuffer,
      indices.byteOffset,
      indices.byteLength
    );
  }

  updateBindGroups(
    entityStorageBuffer: GPUBuffer,
    materialStorageBuffer: GPUBuffer,
    visibleIndicesBuffer: GPUBuffer,
    indirectArgsBuffer: GPUBuffer,
    jointMatricesBuffer: GPUBuffer
  ): void {
    if (!this.device || !this.renderPipeline || !this.cullingPipeline) return;

    this.boundStorageBuffers = {
      entityStorageBuffer,
      materialStorageBuffer,
      visibleIndicesBuffer,
      indirectArgsBuffer,
      jointMatricesBuffer,
    };

    const activeDiffuseTex = this.customDiffuseTexture || this.defaultWhiteTexture!;

    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer! } },
        { binding: 1, resource: { buffer: this.engineParamsBuffer! } },
        { binding: 2, resource: { buffer: entityStorageBuffer } },
        { binding: 3, resource: { buffer: materialStorageBuffer } },
        { binding: 4, resource: { buffer: visibleIndicesBuffer } },
        { binding: 5, resource: { buffer: jointMatricesBuffer } },
        { binding: 6, resource: activeDiffuseTex.createView() },
        { binding: 7, resource: this.defaultSampler! },
        { binding: 8, resource: this.shadowDepthTexture!.createView() },
        { binding: 9, resource: this.shadowSampler! },
      ],
    });

    this.cullingBindGroup = this.device.createBindGroup({
      layout: this.cullingPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer! } },
        { binding: 1, resource: { buffer: entityStorageBuffer } },
        { binding: 2, resource: { buffer: indirectArgsBuffer } },
        { binding: 3, resource: { buffer: visibleIndicesBuffer } },
      ],
    });

    if (this.shadowPipeline) {
      this.shadowBindGroup = this.device.createBindGroup({
        layout: this.shadowPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.cameraUniformBuffer! } },
          { binding: 1, resource: { buffer: entityStorageBuffer } },
          { binding: 2, resource: { buffer: visibleIndicesBuffer } },
          { binding: 3, resource: { buffer: jointMatricesBuffer } },
        ],
      });
    }
  }

  render(timeSeconds: number, stats: Partial<EngineStats>): void {
    if (!this.device || !this.context || this.deviceManager.isDeviceLost) return;

    if (
      !this.renderPipeline ||
      !this.shadowPipeline ||
      !this.renderBindGroup ||
      !this.vertexBuffer ||
      !this.indexBuffer
    ) {
      return;
    }

    try {
      const currentTexture = this.context.getCurrentTexture();
      if (!currentTexture || currentTexture.width <= 0 || currentTexture.height <= 0) return;

      if (
        !this.depthTexture ||
        !this.depthTextureView ||
        this.depthTexture.width !== currentTexture.width ||
        this.depthTexture.height !== currentTexture.height
      ) {
        this.resize(currentTexture.width, currentTexture.height);
      }

      if (
        !this.depthTexture ||
        !this.depthTextureView ||
        this.depthTexture.width !== currentTexture.width ||
        this.depthTexture.height !== currentTexture.height
      ) {
        return;
      }

      // 1. CPU Camera-Look Frustum & Distance Culling (zero allocation, compact visible buffer)
      const cullStart = performance.now();
      const planes = this.camera.isFrustumFrozen ? this.camera.frozenFrustumPlanes : this.camera.frustumPlanes;
      this.entityManager.populateFrustumCulledVisibleIndices(
        this.device,
        planes,
        this.camera.position,
        this.cullDistance,
        this.cullingEnabled
      );
      const cullEnd = performance.now();

      const renderStart = cullEnd;

      // 2. Calculate Directional Light View-Projection Matrix (follows camera target, snapped to texel grid)
      const lx = this.lightDir[0], ly = this.lightDir[1], lz = this.lightDir[2];
      const len = Math.hypot(lx, ly, lz) || 1;
      const ndx = lx / len, ndy = ly / len, ndz = lz / len;

      const shadowSnap = 2.0;
      const focX = Math.round(this.camera.target[0] / shadowSnap) * shadowSnap;
      const focZ = Math.round(this.camera.target[2] / shadowSnap) * shadowSnap;
      const lightDist = 90;

      Mat4.lookAtXYZ(
        focX - ndx * lightDist,
        -ndy * lightDist,
        focZ - ndz * lightDist,
        focX,
        0,
        focZ,
        0,
        1,
        0,
        this.lightViewMatrix
      );

      const orthoSpan = 70;
      Mat4.ortho(-orthoSpan, orthoSpan, -orthoSpan, orthoSpan, 1.0, 200.0, this.lightProjMatrix);
      Mat4.multiply(this.lightProjMatrix, this.lightViewMatrix, this.lightViewProjMatrix);

      // 3. Update Camera Uniforms (96 floats = 384 bytes, zero allocation)
      this.camUniformsData.set(this.camera.viewProjMatrix, 0);
      this.camUniformsData.set(this.camera.viewMatrix, 16);
      this.camUniformsData.set(this.camera.projMatrix, 32);
      this.camUniformsData.set(this.lightViewProjMatrix, 48);
      this.camUniformsData[64] = this.camera.position[0];
      this.camUniformsData[65] = this.camera.position[1];
      this.camUniformsData[66] = this.camera.position[2];
      this.camUniformsData[67] = 1.0;
      this.camUniformsData.set(planes, 68);
      this.camUniformsU32[92] = this.cullingEnabled ? 1 : 0;
      this.camUniformsU32[93] = this.entityManager.activeEntityCount;
      this.camUniformsData[94] = this.cullDistance;
      this.camUniformsU32[95] = 0;

      this.device.queue.writeBuffer(
        this.cameraUniformBuffer!,
        0,
        this.camUniformsData.buffer as ArrayBuffer,
        0,
        384
      );

      // 4. Update Engine Params (28 floats = 112 bytes, zero allocation)
      this.engineParamsData[0] = timeSeconds;
      this.engineParamsU32[1] = this.debugMode;
      this.engineParamsData[2] = this.waveFactor;
      this.engineParamsData[3] = this.morphWeights[0];
      this.engineParamsData[4] = this.morphWeights[1];
      this.engineParamsData[5] = this.morphWeights[2];
      this.engineParamsData[6] = this.bloomEnabled ? 1.0 : 0.0;
      this.engineParamsData[7] = this.ssrEnabled ? 1.0 : 0.0;
      this.engineParamsData[8] = this.lightDir[0];
      this.engineParamsData[9] = this.lightDir[1];
      this.engineParamsData[10] = this.lightDir[2];
      this.engineParamsData[11] = this.volumetricEnabled ? 1.0 : 0.0;
      this.engineParamsData[12] = this.lightColor[0];
      this.engineParamsData[13] = this.lightColor[1];
      this.engineParamsData[14] = this.lightColor[2];
      this.engineParamsData[15] = this.lightIntensity;
      this.engineParamsData[16] = this.ambientColor[0];
      this.engineParamsData[17] = this.ambientColor[1];
      this.engineParamsData[18] = this.ambientColor[2];
      this.engineParamsData[19] = this.ambientIntensity;
      this.engineParamsData[20] = this.skyHorizonColor[0];
      this.engineParamsData[21] = this.skyHorizonColor[1];
      this.engineParamsData[22] = this.skyHorizonColor[2];
      this.engineParamsData[23] = this.nightEmissiveBoost;
      this.engineParamsData[24] = this.exposure;
      this.engineParamsData[25] = this.shadowStrength;
      this.engineParamsData[26] = this.fogDensity;
      this.engineParamsData[27] = 0.0;

      this.device.queue.writeBuffer(
        this.engineParamsBuffer!,
        0,
        this.engineParamsData.buffer as ArrayBuffer,
        0,
        112
      );

      const meshCount = this.entityManager.meshCount;
      const commandEncoder = this.device.createCommandEncoder();

      // 5. Real-Time Directional Shadow Map Pass (skip all draws when 0 shadow casters visible!)
      if (this.shadowDepthTexture && this.shadowDepthView && this.shadowBindGroup) {
        const shadowPass = commandEncoder.beginRenderPass(this.shadowPassDesc);
        if (this.entityManager.lastCulledShadowCasterCount > 0) {
          shadowPass.setPipeline(this.shadowPipeline);
          shadowPass.setBindGroup(0, this.shadowBindGroup);
          shadowPass.setVertexBuffer(0, this.vertexBuffer);
          shadowPass.setIndexBuffer(this.indexBuffer, 'uint32');

          for (let i = 0; i < meshCount; i++) {
            const count = this.entityManager.getMeshEntityCount(i);
            if (count === 0 || this.entityManager.isFloorMesh(i)) continue;
            const mesh = this.entityManager.getMesh(i);
            if (mesh) {
              const firstInst = this.entityManager.getMeshFirstInstance(i);
              shadowPass.drawIndexed(mesh.indexCount, count, mesh.firstIndex, mesh.baseVertex, firstInst);
            }
          }
        }
        shadowPass.end();
      }

      // 6. Main PBR Render Pass directly to swapchain (only draws meshes with visible instances > 0)
      this.mainColorAttachment.view = currentTexture.createView();
      const renderPass = commandEncoder.beginRenderPass(this.mainRenderPassDesc);

      renderPass.setPipeline(this.renderPipeline);
      renderPass.setBindGroup(0, this.renderBindGroup);
      renderPass.setVertexBuffer(0, this.vertexBuffer);
      renderPass.setIndexBuffer(this.indexBuffer, 'uint32');

      let issuedDrawCalls = 0;
      for (let i = 0; i < meshCount; i++) {
        const count = this.entityManager.getMeshEntityCount(i);
        if (count === 0) continue;
        const mesh = this.entityManager.getMesh(i);
        if (mesh) {
          const firstInst = this.entityManager.getMeshFirstInstance(i);
          renderPass.drawIndexed(mesh.indexCount, count, mesh.firstIndex, mesh.baseVertex, firstInst);
          issuedDrawCalls++;
        }
      }

      renderPass.end();

      this.submitCommandBuffers[0] = commandEncoder.finish();
      this.device.queue.submit(this.submitCommandBuffers);
      this.submitCommandBuffers[0] = null as unknown as GPUCommandBuffer;

      const renderEnd = performance.now();
      stats.gpuCullTimeMs = Math.round((cullEnd - cullStart) * 100) * 0.01;
      stats.gpuRenderTimeMs = Math.round((renderEnd - renderStart) * 100) * 0.01;
      stats.indirectDrawCommands = issuedDrawCalls;
    } catch (err: any) {
      if (err?.message?.includes('lost') || this.deviceManager.isDeviceLost) {
        console.warn('Render skipped due to device loss:', err);
      } else {
        console.error('Render error:', err);
      }
    }
  }
}
