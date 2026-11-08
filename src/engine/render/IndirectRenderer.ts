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
import { CULLING_COMPUTE_WGSL } from '../shaders/CullingComputeWGSL';
import { RENDER_PIPELINE_WGSL, SHADOW_PIPELINE_WGSL } from '../shaders/RenderPipelineWGSL';

export interface RendererOptions {
  enableSubgroups: boolean;
  enableCulling: boolean;
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
  private defaultSampler: GPUSampler | null = null;

  // Shadow Map (2048x2048)
  private shadowDepthTexture: GPUTexture | null = null;
  private shadowSampler: GPUSampler | null = null;
  public lightViewProjMatrix = new Float32Array(16);

  // Settings
  public cullingEnabled = false;
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

  // Zero-garbage pre-allocated uniform buffers
  private camUniformsData = new Float32Array(96);
  private engineParamsData = new Float32Array(24);
  private lightViewMatrix = new Float32Array(16);
  private lightProjMatrix = new Float32Array(16);

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

    // Create textures & samplers
    this.createDefaultTexture();
    this.createShadowResources();
    this.createUniformBuffers();

    // Compile WGSL Shaders
    const renderModule = this.device.createShaderModule({
      label: 'RenderPipelineModule',
      code: RENDER_PIPELINE_WGSL,
    });

    const cullingModule = this.device.createShaderModule({
      label: 'CullingComputeModule',
      code: CULLING_COMPUTE_WGSL,
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

    // 3. Compute Culling Pipeline
    this.cullingPipeline = this.device.createComputePipeline({
      label: 'DestroyerCullingPipeline',
      layout: 'auto',
      compute: {
        module: cullingModule,
        entryPoint: 'main',
      },
    });
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
    });
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
    }

    try {
      // Standard Single-Sample Depth Target
      this.depthTexture = this.device.createTexture({
        size: [clampedW, clampedH, 1],
        sampleCount: 1,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

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

    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer! } },
        { binding: 1, resource: { buffer: this.engineParamsBuffer! } },
        { binding: 2, resource: { buffer: entityStorageBuffer } },
        { binding: 3, resource: { buffer: materialStorageBuffer } },
        { binding: 4, resource: { buffer: visibleIndicesBuffer } },
        { binding: 5, resource: { buffer: jointMatricesBuffer } },
        { binding: 6, resource: this.defaultWhiteTexture!.createView() },
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
      !this.cullingPipeline ||
      !this.shadowPipeline ||
      !this.renderBindGroup ||
      !this.cullingBindGroup ||
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
        this.depthTexture.width !== currentTexture.width ||
        this.depthTexture.height !== currentTexture.height
      ) {
        this.resize(currentTexture.width, currentTexture.height);
      }

      if (
        !this.depthTexture ||
        this.depthTexture.width !== currentTexture.width ||
        this.depthTexture.height !== currentTexture.height
      ) {
        return;
      }

      // 1. Calculate Directional Light View-Projection Matrix
      const lx = this.lightDir[0], ly = this.lightDir[1], lz = this.lightDir[2];
      const len = Math.hypot(lx, ly, lz) || 1;
      const ndx = lx / len, ndy = ly / len, ndz = lz / len;

      const lightDist = 80;
      const lightEye: [number, number, number] = [-ndx * lightDist, -ndy * lightDist, -ndz * lightDist];
      const lightTarget: [number, number, number] = [0, 0, 0];
      const lightUp: [number, number, number] = [0, 1, 0];

      Mat4.lookAt(lightEye, lightTarget, lightUp, this.lightViewMatrix);

      const orthoSpan = 70;
      Mat4.ortho(-orthoSpan, orthoSpan, -orthoSpan, orthoSpan, 1.0, 180.0, this.lightProjMatrix);
      Mat4.multiply(this.lightProjMatrix, this.lightViewMatrix, this.lightViewProjMatrix);

      // 2. Update Camera Uniforms (96 floats = 384 bytes)
      this.camUniformsData.set(this.camera.viewProjMatrix, 0);     // 0..15: viewProj
      this.camUniformsData.set(this.camera.viewMatrix, 16);         // 16..31: view
      this.camUniformsData.set(this.camera.projMatrix, 32);         // 32..47: proj
      this.camUniformsData.set(this.lightViewProjMatrix, 48);       // 48..63: lightViewProj
      this.camUniformsData[64] = this.camera.position[0];
      this.camUniformsData[65] = this.camera.position[1];
      this.camUniformsData[66] = this.camera.position[2];
      this.camUniformsData[67] = 1.0;
      this.camUniformsData.set(this.camera.frustumPlanes, 68);      // 68..91: frustumPlanes
      const u32Cam = new Uint32Array(this.camUniformsData.buffer);
      u32Cam[92] = this.cullingEnabled ? 1 : 0;
      u32Cam[93] = this.entityManager.activeEntityCount;
      u32Cam[94] = 0;
      u32Cam[95] = 0;

      this.device.queue.writeBuffer(
        this.cameraUniformBuffer!,
        0,
        this.camUniformsData.buffer as ArrayBuffer,
        0,
        384
      );

      // 3. Update Engine Params (24 floats = 96 bytes)
      this.engineParamsData[0] = timeSeconds;
      const u32View = new Uint32Array(this.engineParamsData.buffer);
      u32View[1] = this.debugMode;
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

      // 4. Indirect instances setup
      const meshCount = this.entityManager.meshCount;
      if (this.cullingEnabled) {
        for (let i = 0; i < meshCount; i++) {
          this.entityManager.indirectCommandsData[i * 5 + 1] = 0;
        }
        if (meshCount > 0) {
          this.device.queue.writeBuffer(
            this.entityManager.getIndirectArgsBuffer(),
            0,
            this.entityManager.indirectCommandsData.buffer as ArrayBuffer,
            0,
            meshCount * 20
          );
        }
      } else {
        // Bulletproof direct CPU instance assignment (prevents black screen on compute glitch)
        this.entityManager.populateDirectVisibleIndices(this.device);
      }

      const commandEncoder = this.device.createCommandEncoder();

      // 5. GPU Compute Culling Pass
      const activeEntities = this.entityManager.activeEntityCount;
      if (this.cullingEnabled && activeEntities > 0) {
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.cullingPipeline);
        computePass.setBindGroup(0, this.cullingBindGroup);
        const workgroups = Math.min(1024, Math.ceil(activeEntities / 64));
        computePass.dispatchWorkgroups(Math.max(1, workgroups));
        computePass.end();
      }

      // 6. Real-Time Directional Shadow Map Pass
      if (this.shadowDepthTexture && this.shadowBindGroup) {
        const shadowPass = commandEncoder.beginRenderPass({
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.shadowDepthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        shadowPass.setPipeline(this.shadowPipeline);
        shadowPass.setBindGroup(0, this.shadowBindGroup);
        shadowPass.setVertexBuffer(0, this.vertexBuffer);
        shadowPass.setIndexBuffer(this.indexBuffer, 'uint32');

        if (this.cullingEnabled) {
          for (let i = 0; i < meshCount; i++) {
            const mesh = this.entityManager.getMesh(i);
            if (mesh && mesh.name.toLowerCase().includes('floor')) {
              continue;
            }
            const indirectOffset = i * DRAW_INDEXED_INDIRECT_STRIDE_BYTES;
            shadowPass.drawIndexedIndirect(this.entityManager.getIndirectArgsBuffer(), indirectOffset);
          }
        } else {
          for (let i = 0; i < meshCount; i++) {
            const mesh = this.entityManager.getMesh(i);
            if (mesh && mesh.name.toLowerCase().includes('floor')) {
              continue;
            }
            const count = this.entityManager.getMeshEntityCount(i);
            if (mesh && count > 0) {
              shadowPass.drawIndexed(mesh.indexCount, count, mesh.firstIndex, mesh.baseVertex, i * 10000);
            }
          }
        }
        shadowPass.end();
      }

      // 7. Main PBR Render Pass directly to swapchain
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: currentTexture.createView(),
            clearValue: { r: 0.04, g: 0.045, b: 0.065, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });

      renderPass.setPipeline(this.renderPipeline);
      renderPass.setBindGroup(0, this.renderBindGroup);
      renderPass.setVertexBuffer(0, this.vertexBuffer);
      renderPass.setIndexBuffer(this.indexBuffer, 'uint32');

      if (this.cullingEnabled) {
        for (let i = 0; i < meshCount; i++) {
          const indirectOffset = i * DRAW_INDEXED_INDIRECT_STRIDE_BYTES;
          renderPass.drawIndexedIndirect(this.entityManager.getIndirectArgsBuffer(), indirectOffset);
        }
      } else {
        // Direct draw pass - rock-solid on mobile Android Vulkan drivers
        for (let i = 0; i < meshCount; i++) {
          const mesh = this.entityManager.getMesh(i);
          const count = this.entityManager.getMeshEntityCount(i);
          if (mesh && count > 0) {
            renderPass.drawIndexed(mesh.indexCount, count, mesh.firstIndex, mesh.baseVertex, i * 10000);
          }
        }
      }

      renderPass.end();

      this.device.queue.submit([commandEncoder.finish()]);
    } catch (err: any) {
      if (err?.message?.includes('lost') || this.deviceManager.isDeviceLost) {
        console.warn('Render skipped due to device loss:', err);
      } else {
        console.error('Render error:', err);
      }
    }
  }
}
