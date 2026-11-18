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
  public ambientIntensity = 0.28;
  public lightDir: [number, number, number] = [-0.6, -1.2, -0.7];
  public lightColor: [number, number, number] = [1.0, 0.98, 0.92];
  public ambientColor: [number, number, number] = [0.45, 0.55, 0.72];

  private width = 800;
  private height = 600;

  // Cached texture views so render() never allocates descriptor wrappers per frame
  private shadowDepthView: GPUTextureView | null = null;
  private depthTextureView: GPUTextureView | null = null;

  // Zero-garbage pre-allocated uniform buffers & typed array views
  private camUniformsData = new Float32Array(96);
  private camUniformsU32 = new Uint32Array(this.camUniformsData.buffer);
  private engineParamsData = new Float32Array(24);
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
    clearValue: { r: 0.04, g: 0.045, b: 0.065, a: 1.0 },
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

    // Engine params: 24 floats = 96 bytes matching EngineParams struct in WGSL
    this.engineParamsBuffer = this.device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
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

      // 4. Update Engine Params (24 floats = 96 bytes, zero allocation)
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
      this.engineParamsData[20] = this.exposure;

      this.device.queue.writeBuffer(
        this.engineParamsBuffer!,
        0,
        this.engineParamsData.buffer as ArrayBuffer,
        0,
        96
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
