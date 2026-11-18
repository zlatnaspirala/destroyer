/**
 * Destroyer Engine - Complete High-Performance WebGPU Game Engine
 * Features:
 * - Mobile-resilient device acquisition and auto-scaled workloads
 * - Device-lost recovery and graceful loop shutdown
 * - Indirect Draw Instancing & GPU Compute Frustum Culling
 */

import { VertexAnimationController } from './animation/VertexAnimation';
import { MixamoAnimations } from './animation/MixamoAnimations';
import { Camera } from './camera/Camera';
import { PlayerController } from './controls/PlayerController';
import { DeviceManager } from './core/Device';
import { FlatEntityManager } from './core/FlatEntityManager';
import { DestroyerConfig, EngineStats, FlatMaterial } from './core/Types';
import { GLBLoader, GLBTextureImage, ParsedGLBPrimitive } from './loaders/GLBLoader';
import { ProceduralModels } from './loaders/ProceduralModels';
import { Mat4 } from './math/Mat4';
import { IndirectRenderer } from './render/IndirectRenderer';
import { FBXLoader } from './loaders/FBXLoader';

export const isMobileBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.innerWidth < 768)
  );
};

import { JoltPhysics } from './physics/JoltPhysics';

export class DestroyerEngine {
  public deviceManager: DeviceManager;
  public entityManager: FlatEntityManager;
  public camera: Camera;
  public renderer: IndirectRenderer;
  public animController: VertexAnimationController;
  public playerController: PlayerController;
  public physics: JoltPhysics;

  private doorLeftEntityId = -1;
  private doorRightEntityId = -1;
  private elevatorEntityId = -1;
  private elevatorBtnUpEntityId = -1;
  private elevatorBtnDownEntityId = -1;

  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 60;
  private currentFrameTime = 16.6;

  public isDeviceLost = false;
  public onDeviceLost?: (info: GPUDeviceLostInfo) => void;

  public stats: EngineStats = {
    fps: 60,
    frameTimeMs: 16.6,
    gpuCullTimeMs: 0.2,
    gpuRenderTimeMs: 1.4,
    totalInstances: 0,
    visibleInstances: 0,
    culledInstances: 0,
    subgroupsSupported: false,
    subgroupsActive: false,
    subgroupMinSize: 4,
    subgroupMaxSize: 64,
    totalVertices: 0,
    totalTriangles: 0,
    indirectDrawCommands: 0,
    bufferMemoryBytes: 0,
    smartCullingEnabled: true,
    smartCullMode: 'EXTERIOR',
    smartCullBuilding: -1,
    smartCullFloor: -1,
    smartCullMinFloor: 0,
    smartCullMaxFloor: 10,
    smartCulledCount: 0,
  };

  private currentCanvas: HTMLCanvasElement | null = null;
  private currentSubgroupsPreference = true;
  private currentCullingPreference = true;

  public smartCullingEnabled = true;
  private buildingFloorEntities: { buildingIndex: 0 | 1; floor: number; entityIds: number[] }[] = [];
  private buildingBannerEntityIds: [number, number] = [-1, -1];
  private groundSlabEntityId = -1;
  private playerEntityIds: number[] = [];

  private customPlayerGLB: { buffer: ArrayBuffer; name: string } | null = null;
  private isCustomPlayerRig = false;
  private playerWalkClipName = 'Human_Walk_Cycle';
  private playerIdleClipName: string | null = 'BVH_Idle_Mocap';
  private playerJumpClipName: string | null = 'BVH_Jump_Mocap';
  private playerPunchClipName: string | null = 'BVH_Punch_Mocap';
  private anarchyCrateMeshId = -1;
  private anarchyCrateMatId = -1;
  private tempPropMat = Mat4.create();
  private userLockedClip = false;
  public activePlayerSourceLabel = 'Procedural Humanoid';

  constructor() {
    this.deviceManager = new DeviceManager();
    // Allocate capacity: 50,000 entities on desktop, 10,000 on mobile
    const entityCap = isMobileBrowser() ? 10000 : 50000;
    this.entityManager = new FlatEntityManager(entityCap, 256, 2048);
    this.camera = new Camera();
    this.renderer = new IndirectRenderer(this.deviceManager, this.entityManager, this.camera);
    this.animController = new VertexAnimationController(this.entityManager);
    this.physics = new JoltPhysics();
    this.playerController = new PlayerController(this);

    // Listen to device loss
    this.deviceManager.onDeviceLost((info) => {
      this.isDeviceLost = true;
      this.stop();
      if (this.onDeviceLost) {
        this.onDeviceLost(info);
      }
    });
  }

  async init(config: DestroyerConfig): Promise<{ success: boolean; error?: string }> {
    this.currentCanvas = config.canvas;
    this.currentSubgroupsPreference = config.enableSubgroups ?? true;
    this.currentCullingPreference = config.enableCulling ?? true;
    this.isDeviceLost = false;

    try {
      const res = await this.deviceManager.init(this.currentSubgroupsPreference);
      if (!res.device) {
        return { success: false, error: 'WebGPU device acquisition failed.' };
      }

      // Resize canvas to match screen DPR before initial configure
      const rect = config.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const w = Math.max(1, Math.floor((rect.width || window.innerWidth || 800) * dpr));
      const h = Math.max(1, Math.floor((rect.height || window.innerHeight || 600) * dpr));
      config.canvas.width = w;
      config.canvas.height = h;

      this.deviceManager.configureCanvas(config.canvas);
      this.entityManager.initGPU(this.deviceManager.getDevice());

      await this.renderer.initPipelines({
        enableSubgroups: res.hasSubgroups,
        enableCulling: this.currentCullingPreference,
      });

      this.renderer.updateBindGroups(
        this.entityManager.getEntityBuffer(),
        this.entityManager.getMaterialBuffer(),
        this.entityManager.getVisibleIndicesBuffer(),
        this.entityManager.getIndirectArgsBuffer(),
        this.entityManager.getJointMatricesBuffer()
      );

      this.renderer.resize(w, h);

      // Update initial stats
      this.stats.subgroupsSupported = res.hasSubgroups;
      this.stats.subgroupsActive = this.renderer.subgroupsActive;
      this.stats.subgroupMinSize = res.subgroupMinSize;
      this.stats.subgroupMaxSize = res.subgroupMaxSize;

      // Load Anarchy game world
      await this.loadAnarchyWorld();

      return { success: true };
    } catch (err: any) {
      console.error('[DestroyerEngine Init Error]:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  start(): void {
    if (this.isRunning || this.isDeviceLost) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    this.loop(this.lastTime);
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  async restoreDevice(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentCanvas) {
      return { success: false, error: 'No canvas associated with engine.' };
    }
    this.stop();
    this.deviceManager.dispose();

    // Settle delay allows mobile OS and GPU driver to release previous context
    await new Promise((resolve) => setTimeout(resolve, 250));

    this.deviceManager = new DeviceManager();
    this.renderer = new IndirectRenderer(this.deviceManager, this.entityManager, this.camera);
    this.deviceManager.onDeviceLost((info) => {
      this.isDeviceLost = true;
      this.stop();
      if (this.onDeviceLost) {
        this.onDeviceLost(info);
      }
    });

    const res = await this.init({
      canvas: this.currentCanvas,
      enableSubgroups: this.currentSubgroupsPreference,
      enableCulling: this.currentCullingPreference,
    });

    if (res.success) {
      this.isDeviceLost = false;
      this.start();
    }
    return res;
  }

  resize(width: number, height: number): void {
    if (this.isDeviceLost) return;
    if (this.currentCanvas) {
      if (this.currentCanvas.width !== width || this.currentCanvas.height !== height) {
        this.currentCanvas.width = width;
        this.currentCanvas.height = height;
      }
    }
    this.renderer.resize(width, height);
  }

  private loop = (currentTime: number) => {
    if (!this.isRunning || this.isDeviceLost) return;

    try {
      // Ensure canvas dimensions match DOM layout
      if (this.currentCanvas) {
        const clientW = this.currentCanvas.clientWidth;
        const clientH = this.currentCanvas.clientHeight;
        if (clientW > 0 && clientH > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
          const targetW = Math.max(1, Math.floor(clientW * dpr));
          const targetH = Math.max(1, Math.floor(clientH * dpr));
          if (this.currentCanvas.width !== targetW || this.currentCanvas.height !== targetH) {
            this.currentCanvas.width = targetW;
            this.currentCanvas.height = targetH;
            this.renderer.resize(targetW, targetH);
          }
        }
      }

      const deltaMs = currentTime - this.lastTime;
      const deltaSec = Math.min(deltaMs / 1000, 0.1);
      this.lastTime = currentTime;

      // FPS calculation
      this.frameCount++;
      if (currentTime - this.lastFpsUpdate >= 500) {
        this.currentFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
        this.currentFrameTime = deltaMs;
        this.frameCount = 0;
        this.lastFpsUpdate = currentTime;
      }

      // Update dynamic physics objects (automatic sliding door, elevator, moveable props)
      if (this.physics) {
        const { elevatorDeltaY } = this.physics.updateDynamicPhysics(deltaSec, this.playerController.position);

        // Update Left Sliding Door Matrix
        if (this.doorLeftEntityId >= 0) {
          const leftDoorMat = Mat4.create();
          const doorX = -2.0 - this.physics.doorOpenFactor * 3.5;
          Mat4.fromTranslation([doorX, 1.2, 20.0], leftDoorMat);
          this.entityManager.updateEntityMatrix(this.doorLeftEntityId, leftDoorMat, [doorX, 1.2, 20.0], 4.0);
        }

        // Update Right Sliding Door Matrix
        if (this.doorRightEntityId >= 0) {
          const rightDoorMat = Mat4.create();
          const doorX = 2.0 + this.physics.doorOpenFactor * 3.5;
          Mat4.fromTranslation([doorX, 1.2, 20.0], rightDoorMat);
          this.entityManager.updateEntityMatrix(this.doorRightEntityId, rightDoorMat, [doorX, 1.2, 20.0], 4.0);
        }

        // Update Moving Elevator Platform Matrix
        if (this.elevatorEntityId >= 0) {
          const eleMat = Mat4.create();
          Mat4.fromTranslation([14.0, this.physics.elevatorY, 10.0], eleMat);
          this.entityManager.updateEntityMatrix(this.elevatorEntityId, eleMat, [14.0, this.physics.elevatorY, 10.0], 5.0);
        }

        // Update Elevator Cab Buttons
        if (this.elevatorBtnUpEntityId >= 0) {
          const btnUpMat = Mat4.create();
          const btnUpPos: [number, number, number] = [14.0 - 1.98, this.physics.elevatorY + 1.7, 10.0 + 0.8];
          Mat4.fromTranslation(btnUpPos, btnUpMat);
          this.entityManager.updateEntityMatrix(this.elevatorBtnUpEntityId, btnUpMat, btnUpPos, 1.0);
        }

        if (this.elevatorBtnDownEntityId >= 0) {
          const btnDownMat = Mat4.create();
          const btnDownPos: [number, number, number] = [14.0 - 1.98, this.physics.elevatorY + 1.3, 10.0 + 0.8];
          Mat4.fromTranslation(btnDownPos, btnDownMat);
          this.entityManager.updateEntityMatrix(this.elevatorBtnDownEntityId, btnDownMat, btnDownPos, 1.0);
        }

        // If player is standing on elevator platform, ride elevator
        const playerOnElevator =
          Math.hypot(this.playerController.position[0] - 14.0, this.playerController.position[2] - 10.0) < 2.1 &&
          Math.abs(this.playerController.position[1] - (this.physics.elevatorY + 0.15)) < 0.35;
        if (playerOnElevator && elevatorDeltaY !== 0) {
          this.playerController.position[1] += elevatorDeltaY;
        }

        // Update moveable crates & barrels physics and sync entity matrices
        this.physics.updateMoveableObjects(deltaSec);
        for (let i = 0; i < this.physics.moveableObjects.length; i++) {
          const obj = this.physics.moveableObjects[i];
          if (obj.entityId < 0) continue;
          const cx = Math.cos(obj.tiltX * 0.5), sx = Math.sin(obj.tiltX * 0.5);
          const cy = Math.cos(obj.rotationY * 0.5), sy = Math.sin(obj.rotationY * 0.5);
          const cz = Math.cos(obj.tiltZ * 0.5), sz = Math.sin(obj.tiltZ * 0.5);
          const qw = cy * cx * cz + sy * sx * sz;
          const qx = cy * sx * cz + sy * cx * sz;
          const qy = sy * cx * cz - cy * sx * sz;
          const qz = cy * cx * sz - sy * sx * cz;
          Mat4.fromTranslationRotationScale(obj.position, [qx, qy, qz, qw], [1, 1, 1], this.tempPropMat);
          const rad = Math.max(1.2, Math.hypot(obj.halfExtents[0], obj.halfExtents[1], obj.halfExtents[2]) + 0.3);
          this.entityManager.updateEntityMatrix(obj.entityId, this.tempPropMat, obj.position, rad);
        }
      }

      // Camera update
      this.camera.update(deltaSec);

      // Player controller update (3rd Person controls & camera follow)
      this.playerController.update(deltaSec);

      // Vertex animation update (supports both procedural 5-bone rig and custom GLB Mixamo rigs)
      if (this.userLockedClip) {
        this.animController.update(deltaSec);
      } else if (!this.isCustomPlayerRig) {
        if (this.playerController.isPunching) {
          this.animController.evaluateClipAtTime('BVH_Punch_Mocap', this.playerController.punchTime);
        } else if (!this.playerController.isGrounded) {
          const jumpTime = Math.min(0.82, this.playerController.jumpTime);
          this.animController.evaluateClipAtTime('BVH_Jump_Mocap', jumpTime);
        } else if (this.playerController.landingImpactTimer > 0) {
          this.animController.evaluateClipAtTime('BVH_Jump_Mocap', 0.80);
        } else if (this.playerController.isMoving) {
          const currentClip = this.animController.getCurrentClipName();
          if (currentClip !== 'Human_Walk_Cycle') {
            this.animController.playClipByName('Human_Walk_Cycle', true);
          }
          const speedFactor = this.playerController.isRunning ? 1.6 : 1.0;
          this.animController.update(deltaSec * speedFactor);
        } else {
          const currentClip = this.animController.getCurrentClipName();
          if (currentClip !== 'BVH_Idle_Mocap') {
            this.animController.playClipByName('BVH_Idle_Mocap', true);
          }
          this.animController.update(deltaSec);
        }
      } else {
        // Custom rigged GLB (e.g. Mixamo Remy / standard-walk.glb)
        if (this.playerController.isPunching && this.playerPunchClipName) {
          this.animController.evaluateClipAtTime(this.playerPunchClipName, this.playerController.punchTime);
        } else if (!this.playerController.isGrounded && this.playerJumpClipName) {
          this.animController.evaluateClipAtTime(this.playerJumpClipName, this.playerController.jumpTime);
        } else if (this.playerController.isMoving && this.playerWalkClipName) {
          const currentClip = this.animController.getCurrentClipName();
          if (currentClip !== this.playerWalkClipName) {
            this.animController.playClipByName(this.playerWalkClipName, true);
          }
          const speedFactor = this.playerController.isRunning ? 1.5 : 1.0;
          this.animController.update(deltaSec * speedFactor);
        } else if (this.playerIdleClipName) {
          const currentClip = this.animController.getCurrentClipName();
          if (currentClip !== this.playerIdleClipName) {
            this.animController.playClipByName(this.playerIdleClipName, true);
          }
          this.animController.update(deltaSec);
        } else if (this.playerWalkClipName) {
          this.animController.evaluateClipAtTime(this.playerWalkClipName, 0);
        }
      }

      // Update Smart Floor/Interior Culling before uploading entity flags to GPU
      this.updateSmartCulling();

      // Upload dynamic entities & joint matrices to GPU
      if (!this.deviceManager.isDeviceLost) {
        const device = this.deviceManager.getDevice();
        this.entityManager.uploadToGPU(device);

        // Render pass
        const timeSec = currentTime * 0.001;
        this.renderer.render(timeSec, this.stats);
      }

      // Update telemetry stats
      this.stats.fps = this.currentFps;
      this.stats.frameTimeMs = Number(this.currentFrameTime.toFixed(1));
      this.stats.totalInstances = this.entityManager.activeEntityCount;
      const activeVisibleCount = this.entityManager.getVisibleFlagEntityCount();
      this.stats.visibleInstances = activeVisibleCount;
      this.stats.culledInstances = Math.max(0, this.stats.totalInstances - activeVisibleCount);
      this.stats.totalVertices = this.entityManager.getTotalVertices();
      this.stats.totalTriangles = this.entityManager.getTotalTriangles();
      this.stats.indirectDrawCommands = this.entityManager.meshCount;
    } catch (err) {
      console.warn('Loop frame error:', err);
    }

    if (this.isRunning && !this.isDeviceLost) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  };

  uploadGeometries(geometries: ParsedGLBPrimitive[]): void {
    let totalVerts = 0;
    let totalIndices = 0;
    const stride = 22;

    for (const g of geometries) {
      totalVerts += Math.floor(g.positions.length / 3);
      totalIndices += g.indices.length;
    }

    const combinedVerts = new Float32Array(totalVerts * stride);
    const combinedIndices = new Uint32Array(totalIndices);

    let vOffsetFloats = 0;
    let iOffset = 0;

    for (const g of geometries) {
      const interleaved = GLBLoader.interleavePrimitive(g);
      combinedVerts.set(interleaved, vOffsetFloats);
      vOffsetFloats += interleaved.length;

      combinedIndices.set(g.indices, iOffset);
      iOffset += g.indices.length;
    }

    this.renderer.uploadGeometry(combinedVerts, combinedIndices);
  }

  private async tryFetchGLB(url: string): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 12) return null;
      const dv = new DataView(buf);
      // Verify binary GLB magic header ('glTF' = 0x46546c67) to ignore Vite SPA HTML fallbacks
      if (dv.getUint32(0, true) !== 0x46546c67) return null;
      return buf;
    } catch {
      return null;
    }
  }

  private async buildTextureAtlasFromGLB(
    textures: GLBTextureImage[],
    primitives?: ParsedGLBPrimitive[]
  ): Promise<Map<number, [number, number, number]>> {
    const rectMap = new Map<number, [number, number, number]>();
    let targetTextures = textures;
    if (primitives && primitives.length > 0) {
      const usedSet = new Set<number>();
      for (const p of primitives) {
        if (p.textureImageIndex !== undefined && p.textureImageIndex !== null) {
          usedSet.add(p.textureImageIndex);
        }
      }
      targetTextures = textures.filter((t) => usedSet.has(t.index));
    }

    if (targetTextures.length === 0 || typeof document === 'undefined') {
      this.renderer.clearDiffuseAtlas();
      return rectMap;
    }

    const decoded: { index: number; bitmap: ImageBitmap }[] = [];
    for (const tex of targetTextures) {
      try {
        const copy = new Uint8Array(tex.bytes);
        const blob = new Blob([copy], { type: tex.mimeType || 'image/png' });
        const bitmap = await createImageBitmap(blob);
        decoded.push({ index: tex.index, bitmap });
      } catch (err) {
        console.warn('[GLB Texture Decode] Skipping image', tex.index, err);
      }
    }

    if (decoded.length === 0) {
      this.renderer.clearDiffuseAtlas();
      return rectMap;
    }

    const cols = Math.ceil(Math.sqrt(decoded.length));
    const tileSize = cols <= 4 ? 512 : 256;
    const atlasSize = cols * tileSize;

    const canvas = document.createElement('canvas');
    canvas.width = atlasSize;
    canvas.height = atlasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      for (const d of decoded) d.bitmap.close();
      return rectMap;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, atlasSize, atlasSize);

    for (let i = 0; i < decoded.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * tileSize;
      const y = row * tileSize;
      ctx.drawImage(decoded[i].bitmap, x, y, tileSize, tileSize);
      decoded[i].bitmap.close();

      rectMap.set(decoded[i].index, [
        (x + 0.5) / atlasSize,
        (y + 0.5) / atlasSize,
        (tileSize - 1.0) / atlasSize,
      ]);
    }

    const imgData = ctx.getImageData(0, 0, atlasSize, atlasSize);
    this.renderer.setDiffuseAtlas(new Uint8Array(imgData.data.buffer), atlasSize, atlasSize);
    return rectMap;
  }

  private async resolveAnarchyPlayer(): Promise<{
    primitives: ParsedGLBPrimitive[];
    joints: import('./core/Types').SkeletonJoint[];
    clips: import('./core/Types').AnimationClip[];
    atlasRects: Map<number, [number, number, number]>;
    isCustomRig: boolean;
    sourceLabel: string;
  }> {
    this.renderer.clearDiffuseAtlas();

    // 1. Check in-memory uploaded GLB first
    let glbBuffer: ArrayBuffer | null = this.customPlayerGLB?.buffer ?? null;
    let glbName = this.customPlayerGLB?.name ?? '';

    // 2. Check server-persisted GLB uploads (/api/assets, sorted newest-first)
    if (!glbBuffer) {
      try {
        const res = await fetch('/api/assets', { cache: 'no-store' });
        if (res.ok) {
          const assets: { name: string; url: string }[] = await res.json();
          const glbAssets = assets.filter((a) => /\.glb$/i.test(a.name));
          if (glbAssets.length > 0) {
            const preferred = glbAssets[0];
            glbBuffer = await this.tryFetchGLB(preferred.url);
            if (glbBuffer) glbName = preferred.name;
          }
        }
      } catch {
        // Server asset lookup optional
      }
    }

    // 3. Check Vite-discovered workspace assets & standard workspace paths
    if (!glbBuffer) {
      const globUrls = Object.values(
        import.meta.glob('/src/assets/**/*.glb', { query: '?url', eager: true, import: 'default' })
      ) as string[];

      const candidatePaths = [
        ...globUrls,
        '/src/assets/animations/character-remy/remy.glb',
        '/src/assets/animations/character-remy/Remy.glb',
        '/src/assets/animations/character-remy/standard-walk.glb',
        '/assets/animations/character-remy/remy.glb',
        '/assets/animations/character-remy/standard-walk.glb',
        '/assets/remy.glb',
        '/assets/standard-walk.glb',
        '/remy.glb',
        '/standard-walk.glb',
      ];
      for (const candidate of candidatePaths) {
        if (!candidate) continue;
        const buf = await this.tryFetchGLB(candidate);
        if (buf) {
          glbBuffer = buf;
          glbName = candidate.split('/').pop()?.split('?')[0] || 'player.glb';
          break;
        }
      }
    }

    if (glbBuffer) {
      try {
        const parsed = GLBLoader.parse(glbBuffer, { normalizeToHeight: 1.75 });
        if (parsed.primitives.length > 0) {
          const atlasRects = await this.buildTextureAtlasFromGLB(parsed.textures, parsed.primitives);

          let finalClips = [...parsed.clips];
          if (parsed.hasSkinning && MixamoAnimations.isMixamoSkeleton(parsed.joints)) {
            const generated = MixamoAnimations.generateStandardClips(parsed.joints);
            if (finalClips.length === 0) {
              finalClips = generated;
            } else {
              // Fill in Idle / Jump / Punch if only a walk clip was embedded
              const hasIdle = finalClips.some((c) => /idle|stand|breath/i.test(c.name));
              const hasJump = finalClips.some((c) => /jump|air/i.test(c.name));
              const hasPunch = finalClips.some((c) => /punch|jab|hit|attack/i.test(c.name));
              for (const g of generated) {
                if (!hasIdle && g.name === 'Mixamo_Idle_Cycle') finalClips.push(g);
                if (!hasJump && g.name === 'Mixamo_Jump_Cycle') finalClips.push(g);
                if (!hasPunch && g.name === 'Mixamo_Punch_Cycle') finalClips.push(g);
              }
            }
          }

          return {
            primitives: parsed.primitives,
            joints: parsed.joints,
            clips: finalClips,
            atlasRects,
            isCustomRig: parsed.hasSkinning && parsed.joints.length > 0,
            sourceLabel: `GLB: ${glbName}`,
          };
        }
      } catch (err) {
        console.warn('[Player GLB Parse Error] Falling back:', err);
      }
    }

    // 4. Optional FBX workspace check (verifies binary/non-HTML before passing to Three FBXLoader)
    try {
      const fbxPath = '/src/assets/animations/character-remy/standard-walk.fbx';
      const fbxHead = await fetch(fbxPath, { cache: 'no-store' });
      const contentType = fbxHead.headers.get('content-type') || '';
      if (fbxHead.ok && !contentType.includes('text/html')) {
        const fbxResult = await FBXLoader.load(fbxPath);
        if (fbxResult.primitives.length > 0) {
          const sanitizedPrims = fbxResult.primitives.map((p) => ({
            ...p,
            joints: undefined,
            weights: undefined,
          }));
          return {
            primitives: sanitizedPrims,
            joints: [],
            clips: [],
            atlasRects: new Map(),
            isCustomRig: false,
            sourceLabel: 'FBX Mesh (Static)',
          };
        }
      }
    } catch {
      // Fall through cleanly to procedural humanoid
    }

    // 5. Default procedural humanoid fallback
    const proc = ProceduralModels.createSimpleHumanoidPlayer();
    return {
      primitives: [proc.primitive],
      joints: proc.joints,
      clips: proc.allClips,
      atlasRects: new Map(),
      isCustomRig: false,
      sourceLabel: 'Procedural Humanoid',
    };
  }

  async loadPlayerGLB(arrayBuffer: ArrayBuffer, fileName = 'player.glb'): Promise<void> {
    if (this.isDeviceLost) return;
    const hasExistingPlayer = this.playerController.entityId >= 0;
    const savedPos: [number, number, number] = [...this.playerController.position];
    const savedTheta = this.playerController.cameraTheta;
    const savedPhi = this.playerController.cameraPhi;
    const savedDist = this.playerController.cameraDistance;
    const savedEnergy = this.playerController.energy;

    this.customPlayerGLB = { buffer: arrayBuffer, name: fileName };
    this.userLockedClip = false;
    await this.loadAnarchyWorld();

    if (hasExistingPlayer) {
      this.playerController.position = savedPos;
      this.playerController.cameraTheta = savedTheta;
      this.playerController.cameraPhi = savedPhi;
      this.playerController.rotationY = savedTheta + Math.PI;
      this.playerController.cameraDistance = savedDist;
      this.playerController.energy = savedEnergy;
    }
  }

  async loadAnarchyWorld(): Promise<void> {
    if (this.isDeviceLost) return;

    this.entityManager.clear();
    this.animController.clear();
    this.renderer.clearDiffuseAtlas();
    this.renderer.waveFactor = 0.0;
    this.playerController.extraEntityIds = [];
    this.anarchyCrateMeshId = -1;
    this.anarchyCrateMatId = -1;
    this.userLockedClip = false;
    this.buildingFloorEntities = [];
    this.buildingBannerEntityIds = [-1, -1];
    this.groundSlabEntityId = -1;
    this.playerEntityIds = [];

    const device = this.deviceManager.getDevice();

    // Single 10-story business building with opening door, interior stairs, elevator & punchable props
    {
      this.physics.setupDefaultBuildingPhysics();

      const buildingData = ProceduralModels.createSingleBuildingWithStairsAndElevator();
      const resolvedPlayer = await this.resolveAnarchyPlayer();
      this.isCustomPlayerRig = resolvedPlayer.isCustomRig;
      this.activePlayerSourceLabel = resolvedPlayer.sourceLabel;

      if (this.isCustomPlayerRig) {
        const clips = resolvedPlayer.clips;
        this.playerWalkClipName =
          clips.find((c) => /walk|run|move/i.test(c.name))?.name ||
          clips.find((c) => /mixamo|armature/i.test(c.name))?.name ||
          clips[0]?.name ||
          '';
        this.playerIdleClipName =
          clips.find((c) => /idle|stand|breath/i.test(c.name))?.name || null;
        this.playerJumpClipName =
          clips.find((c) => /jump|air/i.test(c.name))?.name || null;
        this.playerPunchClipName =
          clips.find((c) => /punch|jab|hit|attack/i.test(c.name))?.name || null;
      } else {
        this.playerWalkClipName = 'Human_Walk_Cycle';
        this.playerIdleClipName = 'BVH_Idle_Mocap';
        this.playerJumpClipName = 'BVH_Jump_Mocap';
        this.playerPunchClipName = 'BVH_Punch_Mocap';
      }

      const concreteMatId = this.entityManager.registerMaterial({
        baseColor: [0.24, 0.28, 0.35, 1.0], // Dark Slate Concrete
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.70,
        metallic: 0.20,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const glassMatId = this.entityManager.registerMaterial({
        baseColor: [0.12, 0.30, 0.42, 1.0], // Architectural Curtain Glass
        emissiveColor: [0.04, 0.14, 0.22, 0.45],
        roughness: 0.06,
        metallic: 0.92,
        ao: 1.0,
        alphaCutoff: 0.1,
      });

      const metalTrimMatId = this.entityManager.registerMaterial({
        baseColor: [0.13, 0.15, 0.20, 1.0], // Brushed Gunmetal Trim & Mullions
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.36,
        metallic: 0.86,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const interiorAccentMatId = this.entityManager.registerMaterial({
        baseColor: [0.64, 0.66, 0.70, 1.0], // Light Architectural Stone / Trim
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.78,
        metallic: 0.06,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const ceilingLightMatId = this.entityManager.registerMaterial({
        baseColor: [0.92, 0.96, 1.0, 1.0], // Linear LED Fixture
        emissiveColor: [0.65, 0.78, 0.92, 1.0],
        roughness: 0.20,
        metallic: 0.05,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const furnitureMatId = this.entityManager.registerMaterial({
        baseColor: [0.45, 0.35, 0.25, 1.0], // Office Wood
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.55,
        metallic: 0.05,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const doorMatId = this.entityManager.registerMaterial({
        baseColor: [0.15, 0.70, 0.90, 0.9], // Tinted Glass Cyan
        emissiveColor: [0.05, 0.20, 0.30, 0.5],
        roughness: 0.25,
        metallic: 0.85,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const elevatorMatId = this.entityManager.registerMaterial({
        baseColor: [0.90, 0.55, 0.15, 1.0], // Glowing Amber Platform
        emissiveColor: [0.35, 0.18, 0.05, 0.6],
        roughness: 0.35,
        metallic: 0.60,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      // Register per-primitive materials for the player character
      const defaultPlayerMatId = this.entityManager.registerMaterial({
        baseColor: [0.20, 0.38, 0.60, 1.0],
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.52,
        metallic: 0.12,
        ao: 1.0,
        alphaCutoff: 0.5,
        flags: 0,
      });

      const playerPrimMatIds: number[] = resolvedPlayer.primitives.map((prim) => {
        if (!prim.material && (prim.textureImageIndex === undefined || prim.textureImageIndex === null)) {
          return defaultPlayerMatId;
        }
        const m = prim.material || {
          baseColor: [0.85, 0.85, 0.88, 1.0] as [number, number, number, number],
          emissiveColor: [0, 0, 0, 0] as [number, number, number, number],
          roughness: 0.55,
          metallic: 0.1,
          ao: 1.0,
          alphaCutoff: 0.5,
        };
        const texRect =
          prim.textureImageIndex !== undefined && prim.textureImageIndex !== null
            ? resolvedPlayer.atlasRects.get(prim.textureImageIndex)
            : undefined;
        return this.entityManager.registerMaterial({
          ...m,
          flags: texRect ? 2 : 0,
          atlasRect: texRect,
        });
      });

      const textMatId = this.entityManager.registerMaterial({
        baseColor: [0.95, 0.75, 0.15, 1.0], // Glowing Gold 3D Text
        emissiveColor: [0.45, 0.30, 0.05, 0.8],
        roughness: 0.25,
        metallic: 0.85,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const btnUpMatId = this.entityManager.registerMaterial({
        baseColor: [0.1, 0.9, 0.4, 1.0], // Emerald Green Up
        emissiveColor: [0.05, 0.4, 0.15, 0.8],
        roughness: 0.2,
        metallic: 0.8,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      const btnDownMatId = this.entityManager.registerMaterial({
        baseColor: [0.9, 0.1, 0.2, 1.0], // Ruby Red Down / Call
        emissiveColor: [0.4, 0.05, 0.1, 0.8],
        roughness: 0.2,
        metallic: 0.8,
        ao: 1.0,
        alphaCutoff: 0.5,
      });

      // Generate 3D Text Primitive for Floor Labels
      const floorLabelMeshes: ParsedGLBPrimitive[] = [];
      for (let k = 0; k <= 10; k++) {
        floorLabelMeshes.push(
          ProceduralModels.create3DTextMesh(`FLOOR ${k}`, 0.45, 0.08, `3D_Text_Floor_${k}`)
        );
      }

      // Generate Moveable Physics Crates & Barrels
      const cratePrim = ProceduralModels.createPhysicsCrate(0.9);
      const barrelPrim = ProceduralModels.createPhysicsBarrel(0.38, 1.05, 12);
      const crateMatId = this.entityManager.registerMaterial(
        cratePrim.material ?? {
          baseColor: [0.76, 0.48, 0.20, 1.0],
          emissiveColor: [0.06, 0.03, 0.0, 0.2],
          roughness: 0.62,
          metallic: 0.18,
          ao: 1.0,
          alphaCutoff: 0.5,
        }
      );
      const barrelMatId = this.entityManager.registerMaterial(
        barrelPrim.material ?? {
          baseColor: [0.16, 0.62, 0.82, 1.0],
          emissiveColor: [0.02, 0.08, 0.14, 0.3],
          roughness: 0.34,
          metallic: 0.72,
          ao: 1.0,
          alphaCutoff: 0.5,
        }
      );
      this.anarchyCrateMatId = crateMatId;

      // Register Skeleton & Clips
      const jointOffset = this.animController.registerSkeleton(resolvedPlayer.joints);
      for (const clip of resolvedPlayer.clips) {
        this.animController.addClip(clip);
      }
      if (this.animController.clips.length > 0) {
        if (this.playerWalkClipName) {
          this.animController.playClipByName(this.playerWalkClipName, true);
        } else {
          this.animController.playClip(0, true);
        }
      }

      // Queue ALL Geometries & Register Meshes in exact synchronized order
      const pendingMeshes: { prim: ParsedGLBPrimitive; name: string; boundingRadius: number; hasSkinning?: boolean }[] = [];
      const queueMesh = (prim: ParsedGLBPrimitive, name: string, boundingRadius: number, hasSkinning = false): number => {
        const idx = pendingMeshes.length;
        pendingMeshes.push({ prim, name, boundingRadius, hasSkinning });
        return idx;
      };

      const groundMeshId = queueMesh(buildingData.groundSlabMesh, 'Massive_Ground_Mesh', 5000.0);

      // Per-floor skyscraper meshes (0..9 stories + 10 rooftop)
      const floorMeshSpecs = buildingData.floors.map((fl) => ({
        floor: fl.floor,
        buildingMeshId: fl.buildingMesh ? queueMesh(fl.buildingMesh, `Skyscraper_S${fl.floor}_Building`, 32.0) : -1,
        metalTrimMeshId: fl.metalTrimMesh ? queueMesh(fl.metalTrimMesh, `Skyscraper_S${fl.floor}_MetalTrim`, 32.0) : -1,
        interiorAccentMeshId: fl.interiorAccentMesh
          ? queueMesh(fl.interiorAccentMesh, `Skyscraper_S${fl.floor}_InteriorAccent`, 32.0)
          : -1,
        ceilingLightMeshId: fl.ceilingLightMesh
          ? queueMesh(fl.ceilingLightMesh, `Skyscraper_S${fl.floor}_CeilingLights`, 32.0)
          : -1,
        officeMeshId: fl.officeMesh ? queueMesh(fl.officeMesh, `Skyscraper_S${fl.floor}_Office`, 32.0) : -1,
        windowMeshId: fl.windowMesh ? queueMesh(fl.windowMesh, `Skyscraper_S${fl.floor}_Windows`, 32.0) : -1,
      }));

      const floorButtonMeshId = queueMesh(buildingData.floorButtonMesh, 'Floor_Call_Button_Mesh', 0.5);
      const doorLeftMeshId = queueMesh(buildingData.doorLeftMesh, 'Door_Left_Mesh', 5.0);
      const doorRightMeshId = queueMesh(buildingData.doorRightMesh, 'Door_Right_Mesh', 5.0);
      const elevatorMeshId = queueMesh(buildingData.elevatorMesh, 'Elevator_Cab_Mesh', 5.0);
      const btnUpMeshId = queueMesh(buildingData.btnUpMesh, 'Elevator_Btn_UP_Mesh', 1.0);
      const btnDownMeshId = queueMesh(buildingData.btnDownMesh, 'Elevator_Btn_DOWN_Mesh', 1.0);
      const bannerMeshId = queueMesh(buildingData.bannerMesh, 'Banner_Text_Mesh', 10.0);

      const playerMeshIds: number[] = resolvedPlayer.primitives.map((p, pIdx) =>
        queueMesh(
          p,
          p.name || `Player_Part_${pIdx}`,
          p.boundingRadius || 2.0,
          resolvedPlayer.isCustomRig || !!(p.joints && p.joints.length > 0)
        )
      );

      const floorLabelMeshIds: number[] = floorLabelMeshes.map((prim, k) =>
        queueMesh(prim, `3D_Text_Floor_${k}`, 5.0)
      );

      const crateMeshId = queueMesh(cratePrim, 'Moveable_Physics_Crate', cratePrim.boundingRadius || 0.9);
      this.anarchyCrateMeshId = crateMeshId;
      const barrelMeshId = queueMesh(barrelPrim, 'Moveable_Physics_Barrel', barrelPrim.boundingRadius || 0.7);

      this.uploadGeometries(pendingMeshes.map((m) => m.prim));

      let vOffset = 0;
      let iOffset = 0;
      for (const m of pendingMeshes) {
        const vCount = Math.floor(m.prim.positions.length / 3);
        this.entityManager.registerMesh({
          name: m.name,
          firstIndex: iOffset,
          indexCount: m.prim.indices.length,
          baseVertex: vOffset,
          vertexCount: vCount,
          boundingRadius: m.boundingRadius,
          hasSkinning: !!m.hasSkinning,
          hasMorphTargets: false,
          morphTargetCount: 0,
        });
        vOffset += vCount;
        iOffset += m.prim.indices.length;
      }

      // Add Entities
      const groundMat = Mat4.create();
      Mat4.fromTranslation([0, 0, 0], groundMat);
      this.groundSlabEntityId = this.entityManager.addEntity({
        meshId: groundMeshId,
        materialId: concreteMatId,
        worldMatrix: groundMat,
        sphereCenter: [0, 0, 0, 5000.0],
        flags: 1,
        name: 'Massive_Ground_Slab',
      });

      // Buildings (Main at [0,0,0], Secondary at [60,0,0]) partitioned per floor (0..10)
      const offsets: [number, number, number][] = [[0, 0, 0], [60, 0, 0]];
      offsets.forEach((off, idx) => {
        const buildingIndex = idx as 0 | 1;
        const nameSuffix = idx === 0 ? 'Main' : 'Secondary';
        const mat = Mat4.create();
        Mat4.fromTranslation(off, mat);

        const floorMap = new Map<number, number[]>();
        for (let k = 0; k <= 10; k++) floorMap.set(k, []);

        for (const fl of floorMeshSpecs) {
          const list = floorMap.get(fl.floor)!;
          const localCenter: [number, number, number, number] = [0, fl.floor * 4.0 + 2.0, 0, 32.0];

          if (fl.buildingMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.buildingMeshId,
                materialId: concreteMatId,
                worldMatrix: mat,
                sphereCenter: localCenter,
                flags: 1,
                name: `${nameSuffix}_F${fl.floor}_Building`,
              })
            );
          }
          if (fl.metalTrimMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.metalTrimMeshId,
                materialId: metalTrimMatId,
                worldMatrix: mat,
                sphereCenter: localCenter,
                flags: 1,
                name: `${nameSuffix}_F${fl.floor}_MetalTrim`,
              })
            );
          }
          if (fl.interiorAccentMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.interiorAccentMeshId,
                materialId: interiorAccentMatId,
                worldMatrix: mat,
                sphereCenter: localCenter,
                flags: 1,
                name: `${nameSuffix}_F${fl.floor}_InteriorAccent`,
              })
            );
          }
          if (fl.ceilingLightMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.ceilingLightMeshId,
                materialId: ceilingLightMatId,
                worldMatrix: mat,
                sphereCenter: localCenter,
                flags: 1,
                name: `${nameSuffix}_F${fl.floor}_CeilingLights`,
              })
            );
          }
          if (fl.windowMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.windowMeshId,
                materialId: glassMatId,
                worldMatrix: mat,
                sphereCenter: localCenter,
                flags: 1,
                name: `${nameSuffix}_F${fl.floor}_Windows`,
              })
            );
          }
          if (fl.officeMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.officeMeshId,
                materialId: furnitureMatId,
                worldMatrix: mat,
                sphereCenter: localCenter,
                flags: 1,
                name: `${nameSuffix}_F${fl.floor}_Office`,
              })
            );
          }
        }

        // Banner (above front entrance at Y=4.4)
        const bannerMat = Mat4.create();
        Mat4.fromTranslation([off[0], 4.4, off[2] + 20.25], bannerMat);
        this.buildingBannerEntityIds[buildingIndex] = this.entityManager.addEntity({
          meshId: bannerMeshId,
          materialId: textMatId,
          worldMatrix: bannerMat,
          sphereCenter: [0, 0, 0, 12.0],
          flags: 1,
          name: `${nameSuffix}_Banner`,
        });

        // Main building floor call buttons (0..9) & 3D Text Floor Labels (0..10)
        if (buildingIndex === 0) {
          for (let k = 0; k < 10; k++) {
            const btnMat = Mat4.create();
            Mat4.fromTranslation([11.32, k * 4.0 + 1.6, 9.0], btnMat);
            const btnId = this.entityManager.addEntity({
              meshId: floorButtonMeshId,
              materialId: btnDownMatId,
              worldMatrix: btnMat,
              sphereCenter: [0, 0, 0, 0.5],
              flags: 1,
              name: `Floor_Call_Button_F${k}`,
            });
            floorMap.get(k)!.push(btnId);
          }

          for (let k = 0; k <= 10; k++) {
            const labelMat = Mat4.create();
            const labelPos: [number, number, number] = [0, k * 4.0 + 2.6, -19.6];
            Mat4.fromTranslation(labelPos, labelMat);
            const labelId = this.entityManager.addEntity({
              meshId: floorLabelMeshIds[k],
              materialId: textMatId,
              worldMatrix: labelMat,
              sphereCenter: [0, 0, 0, 8.0],
              flags: 1,
              name: `3D_Label_Main_Floor_${k}`,
            });
            floorMap.get(k)!.push(labelId);
          }
        }

        for (let k = 0; k <= 10; k++) {
          this.buildingFloorEntities.push({
            buildingIndex,
            floor: k,
            entityIds: floorMap.get(k)!,
          });
        }
      });

      // Left Door Entity
      const doorLeftMat = Mat4.create();
      Mat4.fromTranslation([-2.0, 1.2, 20.0], doorLeftMat);
      this.doorLeftEntityId = this.entityManager.addEntity({
        meshId: doorLeftMeshId,
        materialId: doorMatId,
        worldMatrix: doorLeftMat,
        sphereCenter: [-2.0, 1.2, 20.0, 4.0],
        flags: 1,
        animOffset: 0,
        name: 'Sliding_Door_Left',
      });

      // Right Door Entity
      const doorRightMat = Mat4.create();
      Mat4.fromTranslation([2.0, 1.2, 20.0], doorRightMat);
      this.doorRightEntityId = this.entityManager.addEntity({
        meshId: doorRightMeshId,
        materialId: doorMatId,
        worldMatrix: doorRightMat,
        sphereCenter: [2.0, 1.2, 20.0, 4.0],
        flags: 1,
        animOffset: 0,
        name: 'Sliding_Door_Right',
      });

      // Elevator Entity
      const eleMat = Mat4.create();
      Mat4.fromTranslation([14.0, 0.15, 10.0], eleMat);
      this.elevatorEntityId = this.entityManager.addEntity({
        meshId: elevatorMeshId,
        materialId: elevatorMatId,
        worldMatrix: eleMat,
        sphereCenter: [14.0, 0.15, 10.0, 5.0],
        flags: 1,
        animOffset: 0,
        name: 'Elevator_Cab_Structure',
      });

      // Elevator Cab Buttons
      const btnUpMat = Mat4.create();
      Mat4.fromTranslation([14.0 - 1.98, 0.15 + 1.7, 10.0 + 0.8], btnUpMat);
      this.elevatorBtnUpEntityId = this.entityManager.addEntity({
        meshId: btnUpMeshId,
        materialId: btnUpMatId,
        worldMatrix: btnUpMat,
        sphereCenter: [12.0, 1.85, 10.8, 1.0],
        flags: 1,
        animOffset: 0,
        name: 'Elevator_Btn_UP',
      });

      const btnDownMat = Mat4.create();
      Mat4.fromTranslation([14.0 - 1.98, 0.15 + 1.3, 10.0 + 0.8], btnDownMat);
      this.elevatorBtnDownEntityId = this.entityManager.addEntity({
        meshId: btnDownMeshId,
        materialId: btnDownMatId,
        worldMatrix: btnDownMat,
        sphereCenter: [12.0, 1.45, 10.8, 1.0],
        flags: 1,
        animOffset: 0,
        name: 'Elevator_Btn_DOWN',
      });

      // Player Entities (1 per primitive, sharing the same skeleton & animOffset)
      const startPos: [number, number, number] = [0, 0, 25.0];
      const playerMat = Mat4.create();
      Mat4.fromTranslation(startPos, playerMat);

      const playerEntityIds: number[] = [];
      for (let pIdx = 0; pIdx < playerMeshIds.length; pIdx++) {
        const entId = this.entityManager.addEntity({
          meshId: playerMeshIds[pIdx],
          materialId: playerPrimMatIds[pIdx] ?? defaultPlayerMatId,
          worldMatrix: playerMat,
          sphereCenter: [0, 1.0, 25.0, 2.5],
          flags: 1,
          animOffset: jointOffset,
          name: pIdx === 0 ? 'Player_Character' : `Player_Part_${pIdx}`,
        });
        playerEntityIds.push(entId);
      }
      this.playerEntityIds = playerEntityIds;

      // Moveable Punchable Crates & Barrels in courtyard & ground lobby
      const propSpawns: {
        kind: 'crate' | 'barrel';
        name: string;
        pos: [number, number, number];
        mass: number;
        restitution: number;
      }[] = [
        // Front courtyard flanking walkway (immediately visible & punchable at spawn)
        { kind: 'crate', name: 'Courtyard_Crate_01', pos: [-2.4, 0.53, 22.8], mass: 1.0, restitution: 0.35 },
        { kind: 'crate', name: 'Courtyard_Crate_02', pos: [2.4, 0.53, 22.8], mass: 1.0, restitution: 0.35 },
        { kind: 'crate', name: 'Courtyard_Crate_03', pos: [-3.8, 0.53, 22.1], mass: 1.1, restitution: 0.35 },
        { kind: 'crate', name: 'Courtyard_Crate_Stack', pos: [-3.8, 1.44, 22.1], mass: 0.9, restitution: 0.38 },
        { kind: 'crate', name: 'Courtyard_Crate_04', pos: [3.6, 0.45, 24.0], mass: 1.0, restitution: 0.35 },
        { kind: 'barrel', name: 'Courtyard_Barrel_01', pos: [-2.2, 0.525, 24.1], mass: 1.25, restitution: 0.42 },
        { kind: 'barrel', name: 'Courtyard_Barrel_02', pos: [2.3, 0.525, 24.2], mass: 1.25, restitution: 0.42 },
        { kind: 'barrel', name: 'Courtyard_Barrel_03', pos: [3.9, 0.605, 21.8], mass: 1.25, restitution: 0.42 },
        // Inside ground lobby
        { kind: 'crate', name: 'Lobby_Crate_01', pos: [-6.5, 0.45, 11.2], mass: 1.0, restitution: 0.35 },
        { kind: 'crate', name: 'Lobby_Crate_02', pos: [-5.5, 0.45, 11.2], mass: 1.0, restitution: 0.35 },
        { kind: 'crate', name: 'Lobby_Crate_Stack', pos: [-6.0, 1.35, 11.2], mass: 0.9, restitution: 0.38 },
        { kind: 'barrel', name: 'Lobby_Barrel_01', pos: [-4.2, 0.525, 9.6], mass: 1.25, restitution: 0.42 },
      ];

      for (let i = 0; i < propSpawns.length; i++) {
        const sp = propSpawns[i];
        const isCrate = sp.kind === 'crate';
        const halfExt: [number, number, number] = isCrate ? [0.45, 0.45, 0.45] : [0.38, 0.525, 0.38];
        const propMat = Mat4.create();
        Mat4.fromTranslation(sp.pos, propMat);
        const propEntityId = this.entityManager.addEntity({
          meshId: isCrate ? crateMeshId : barrelMeshId,
          materialId: isCrate ? crateMatId : barrelMatId,
          worldMatrix: propMat,
          sphereCenter: [sp.pos[0], sp.pos[1], sp.pos[2], 1.2],
          flags: 1,
          animOffset: 0,
          name: sp.name,
        });
        this.physics.addMoveableObject({
          id: `prop_${i}_${sp.name}`,
          entityId: propEntityId,
          name: sp.name,
          position: sp.pos,
          halfExtents: halfExt,
          mass: sp.mass,
          restitution: sp.restitution,
        });
      }

      // Configure Player Controller
      this.playerController.position = [0, 0, 25.0];
      this.playerController.cameraTheta = 0.0;
      this.playerController.cameraPhi = 1.25;
      this.playerController.rotationY = Math.PI;
      this.playerController.entityId = playerEntityIds[0] ?? -1;
      this.playerController.extraEntityIds = playerEntityIds.slice(1);

      // Position 3rd Person Camera cleanly behind player looking toward building
      this.camera.target = [0, 1.4, 25.0];
      this.camera.radius = 7.5;
      this.camera.theta = 0.0;
      this.camera.phi = 1.25;
      this.camera.updatePositionFromSpherical();
    }

    this.updateSmartCulling();
    this.entityManager.uploadToGPU(device);
  }

  /**
   * Smart Floor / Interior Culling System:
   * - Exterior: renders all buildings (floors 0..10), banners, doors, elevator, and props.
   * - Interior (inside Main or Secondary building): renders ONLY currentFloor - 1 .. currentFloor + 1
   *   (clamped to [0, 10]) of the occupied building, culls the unentered building completely,
   *   and culls out-of-range doors, elevator cab, banners, and moveable props.
   */
  public updateSmartCulling(): void {
    const totalCount = this.entityManager.activeEntityCount;
    if (!this.smartCullingEnabled) {
      for (let i = 0; i < totalCount; i++) {
        this.entityManager.setEntityVisible(i, true);
      }
      this.stats.smartCullingEnabled = false;
      this.stats.smartCullMode = 'EXTERIOR';
      this.stats.smartCullBuilding = -1;
      this.stats.smartCullFloor = -1;
      this.stats.smartCullMinFloor = 0;
      this.stats.smartCullMaxFloor = 10;
      this.stats.smartCulledCount = 0;
      return;
    }

    const [px, py, pz] = this.playerController.position;
    let activeBuilding: -1 | 0 | 1 = -1;

    if (py >= -0.5 && py < 43.8 && Math.abs(pz) <= 19.6) {
      if (Math.abs(px) <= 19.6) {
        activeBuilding = 0;
      } else if (Math.abs(px - 60.0) <= 19.6) {
        activeBuilding = 1;
      }
    }

    if (activeBuilding === -1) {
      for (let i = 0; i < totalCount; i++) {
        this.entityManager.setEntityVisible(i, true);
      }
      this.stats.smartCullingEnabled = true;
      this.stats.smartCullMode = 'EXTERIOR';
      this.stats.smartCullBuilding = -1;
      this.stats.smartCullFloor = -1;
      this.stats.smartCullMinFloor = 0;
      this.stats.smartCullMaxFloor = 10;
      this.stats.smartCulledCount = 0;
      return;
    }

    const currentFloor = Math.max(0, Math.min(10, Math.floor((py + 0.35) / 4.0)));
    const minFloor = Math.max(0, currentFloor - 1);
    const maxFloor = Math.min(10, currentFloor + 1);

    if (this.groundSlabEntityId >= 0) {
      this.entityManager.setEntityVisible(this.groundSlabEntityId, true);
    }

    for (let i = 0; i < this.playerEntityIds.length; i++) {
      this.entityManager.setEntityVisible(this.playerEntityIds[i], true);
    }

    for (let i = 0; i < this.buildingFloorEntities.length; i++) {
      const entry = this.buildingFloorEntities[i];
      const show =
        entry.buildingIndex === activeBuilding &&
        entry.floor >= minFloor &&
        entry.floor <= maxFloor;
      for (let j = 0; j < entry.entityIds.length; j++) {
        this.entityManager.setEntityVisible(entry.entityIds[j], show);
      }
    }

    for (let bIdx = 0; bIdx < 2; bIdx++) {
      const bId = this.buildingBannerEntityIds[bIdx];
      if (bId >= 0) {
        this.entityManager.setEntityVisible(bId, bIdx === activeBuilding && minFloor <= 1);
      }
    }

    const showDoors = activeBuilding === 0 && minFloor <= 1;
    if (this.doorLeftEntityId >= 0) this.entityManager.setEntityVisible(this.doorLeftEntityId, showDoors);
    if (this.doorRightEntityId >= 0) this.entityManager.setEntityVisible(this.doorRightEntityId, showDoors);

    const bandMinY = minFloor * 4.0 - 1.0;
    const bandMaxY = (maxFloor + 1) * 4.0 + 1.0;
    const eleY = this.physics.elevatorY;
    const elevatorInBand =
      activeBuilding === 0 &&
      eleY + 2.8 >= bandMinY &&
      eleY <= bandMaxY;
    if (this.elevatorEntityId >= 0) this.entityManager.setEntityVisible(this.elevatorEntityId, elevatorInBand);
    if (this.elevatorBtnUpEntityId >= 0) this.entityManager.setEntityVisible(this.elevatorBtnUpEntityId, elevatorInBand);
    if (this.elevatorBtnDownEntityId >= 0) this.entityManager.setEntityVisible(this.elevatorBtnDownEntityId, elevatorInBand);

    for (let i = 0; i < this.physics.moveableObjects.length; i++) {
      const obj = this.physics.moveableObjects[i];
      if (obj.entityId < 0) continue;
      const [ox, oy, oz] = obj.position;
      const inMainFootprint = Math.abs(ox) <= 20.6 && Math.abs(oz) <= 20.6;
      const inSecFootprint = Math.abs(ox - 60.0) <= 20.6 && Math.abs(oz) <= 20.6;
      let propVisible = false;
      if (activeBuilding === 0 && !inSecFootprint) {
        propVisible = inMainFootprint
          ? oy >= bandMinY && oy <= bandMaxY
          : minFloor <= 1 && oy >= bandMinY && oy <= bandMaxY;
      } else if (activeBuilding === 1 && inSecFootprint) {
        propVisible = oy >= bandMinY && oy <= bandMaxY;
      }
      this.entityManager.setEntityVisible(obj.entityId, propVisible);
    }

    const visibleNow = this.entityManager.getVisibleFlagEntityCount();
    this.stats.smartCullingEnabled = true;
    this.stats.smartCullMode = 'INTERIOR';
    this.stats.smartCullBuilding = activeBuilding;
    this.stats.smartCullFloor = currentFloor;
    this.stats.smartCullMinFloor = minFloor;
    this.stats.smartCullMaxFloor = maxFloor;
    this.stats.smartCulledCount = Math.max(0, totalCount - visibleNow);
  }

  async loadCustomGLB(arrayBuffer: ArrayBuffer, fileName = 'custom_model.glb'): Promise<void> {
    if (this.isDeviceLost) return;
    await this.loadPlayerGLB(arrayBuffer, fileName);
  }

  spawnProceduralCube(name = 'Moveable_Crate'): number {
    if (this.isDeviceLost || this.anarchyCrateMeshId < 0 || this.anarchyCrateMatId < 0) return -1;

    const p = this.playerController.position;
    const fwdX = -Math.sin(this.playerController.cameraTheta);
    const fwdZ = -Math.cos(this.playerController.cameraTheta);
    const spawnPos: [number, number, number] = [
      p[0] + fwdX * 2.4,
      p[1] + 0.65,
      p[2] + fwdZ * 2.4,
    ];
    const worldMat = Mat4.create();
    Mat4.fromTranslation(spawnPos, worldMat);
    const idx = this.physics.moveableObjects.length + 1;
    const propName = name === 'Procedural_Cube' || name === 'Moveable_Crate' ? `Spawned_Crate_${idx}` : name;

    const entityId = this.entityManager.addEntity({
      meshId: this.anarchyCrateMeshId,
      materialId: this.anarchyCrateMatId,
      worldMatrix: worldMat,
      sphereCenter: [spawnPos[0], spawnPos[1], spawnPos[2], 1.2],
      flags: 1,
      animOffset: 0,
      name: propName,
    });
    this.physics.addMoveableObject({
      id: `spawned_${Date.now()}_${idx}`,
      entityId,
      name: propName,
      position: spawnPos,
      halfExtents: [0.45, 0.45, 0.45],
      mass: 1.0,
      restitution: 0.38,
    });

    const device = this.deviceManager.getDevice();
    this.entityManager.uploadToGPU(device);
    return entityId;
  }

  /**
   * Load and play an external or custom BVH motion capture animation on the character
   */
  public loadBVHAnimation(
    bvhText: string,
    name?: string
  ): { success: boolean; clipName: string; duration: number } {
    try {
      const clipIdx = this.animController.loadBVH(bvhText, { name: name || 'Custom_BVH_Mocap' });
      const clip = this.animController.clips[clipIdx];
      this.userLockedClip = true;
      return { success: true, clipName: clip.name, duration: clip.duration };
    } catch (err: any) {
      console.error('Failed to parse BVH:', err);
      return { success: false, clipName: '', duration: 0 };
    }
  }

  /**
   * Switch active character animation clip by name
   */
  public switchAnimation(clipName: string): boolean {
    const ok = this.animController.playClipByName(clipName, true);
    if (ok) {
      this.userLockedClip = true;
    }
    return ok;
  }

  /**
   * Get list of all currently loaded animation clips
   */
  public getAvailableAnimations(): string[] {
    return this.animController.getClipNames();
  }

  public getPlayerEnergy(): number {
    return this.playerController.energy;
  }
}
