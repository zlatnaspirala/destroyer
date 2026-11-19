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
import { DestroyerConfig, DriveableVehicle, EngineStats } from './core/Types';
import { FREE_3D_ASSETS_CATALOG, Free3DAssetEntry } from './loaders/FreeAssetCatalog';
import { GLBLoader, GLBParseResult, GLBTextureImage, ParsedGLBPrimitive } from './loaders/GLBLoader';
import { CityBuilder } from './loaders/CityBuilder';
import { ProceduralModels } from './loaders/ProceduralModels';
import { Mat4 } from './math/Mat4';
import { IndirectRenderer } from './render/IndirectRenderer';
import { FBXLoader } from './loaders/FBXLoader';

export type { DriveableVehicle };

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
  public npcAnimController: VertexAnimationController;
  public citizenAnimController: VertexAnimationController;
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
    isDriving: false,
    activeVehicleName: '',
    vehicleSpeedKmh: 0,
    activeVehicleHealth: 100,
    nearbyVehicleName: '',
    nearbyVehicleHealth: 100,
    timeOfDayHours: 10.5,
    dayNightPhase: 'DAY',
    dayNightPaused: false,
    dayNightSpeed: 1.0,
    policeAlertActive: false,
    policeWantedLevel: 0,
    policeDispatchCount: 0,
    policeNearestDistMeters: 0,
    policeEtaSeconds: 0,
    policeCallerInfo: '',
    cityCitizenCount: 0,
    cctvCameraCount: 0,
    bigCrimeActive: false,
    policeSirenWarningActive: false,
    policeSirenCountdown: 0,
    isJailed: false,
    jailTimeLeft: 0,
    jailLocationName: '',
    jailReason: '',
    hasWeapon: false,
    weaponAmmo: 0,
    gunShopNearby: false,
    activePatrolCount: 2,
  };

  private currentCanvas: HTMLCanvasElement | null = null;
  private currentSubgroupsPreference = true;
  private currentCullingPreference = true;

  public smartCullingEnabled = true;
  private buildingFloorEntities: { buildingIndex: 0 | 1; floor: number; entityIds: number[] }[] = [];
  private buildingBannerEntityIds: [number, number] = [-1, -1];
  private groundSlabEntityId = -1;
  private playerEntityIds: number[] = [];
  private npcEntityIds: number[] = [];
  private cityEntityIds: number[] = [];
  public vehicles: DriveableVehicle[] = [];

  private customPlayerGLB: { buffer: ArrayBuffer; name: string } | null = null;
  private customNpcGLB: { buffer: ArrayBuffer; name: string } | null = null;
  private isCustomPlayerRig = false;
  private playerWalkClipName = 'Human_Walk_Cycle';
  private playerIdleClipName: string | null = 'BVH_Idle_Mocap';
  private playerJumpClipName: string | null = 'BVH_Jump_Mocap';
  private playerPunchClipName: string | null = 'BVH_Punch_Mocap';

  // Sitting Desk Office Worker NPC state (placed at Floor 0 Front Reception Desk)
  private npcJointOffset = 0;
  private npcHasSkinning = false;
  private npcIdleClipName: string | null = null;
  private npcHitClipName: string | null = null;
  private npcHitTimer = 0;
  private npcHitDuration = 0.9;
  private npcBasePos: [number, number, number] = [-2.5, 0.45, 16.82];
  public activeNpcSourceLabel = 'Procedural Sitting Worker';

  // Scaled & Colored Remy Street Citizens + 6 Police Officers + 15 Police Cars + 18 CCTV Cameras (zero alloc)
  private citizenJointOffset = 0;
  private citizenJointCount = 0;
  private citizenHasSkinning = false;
  private citizenTrackCount = 5; // 0:WalkA, 1:WalkB, 2:WalkFast, 3:PhoneCall, 4:PoliceWalk
  private citizenWalkClipName: string | null = null;
  private citizenPhoneClipName: string | null = null;
  private citizenSimTime = 0;
  private citizenAgents: {
    id: string;
    name: string;
    entityIds: number[];
    phoneEntityId: number;
    x: number;
    z: number;
    rotY: number;
    scaleXZ: number;
    scaleY: number;
    walkSpeed: number;
    axis: 'x' | 'z';
    minBound: number;
    maxBound: number;
    dir: 1 | -1;
    walkTrackOffset: number;
    phoneTrackOffset: number;
    stumbleTimer: number;
    phoneCallTimer: number;
    usingPhoneTrack: boolean;
    punchTarget: import('./physics/JoltPhysics').NPCPunchTarget;
  }[] = [];
  private policeOfficers: {
    id: string;
    name: string;
    entityIds: number[];
    x: number;
    y: number;
    z: number;
    rotY: number;
    homeX: number;
    homeZ: number;
    patrolDir: 1 | -1;
    patrolAxis: 'x' | 'z';
    patrolRange: number;
    scaleXZ: number;
    scaleY: number;
    trackOffset: number;
    stumbleTimer: number;
    kickCooldown: number;
    punchTarget: import('./physics/JoltPhysics').NPCPunchTarget;
  }[] = [];
  private policeCarAgents: {
    vehicle: DriveableVehicle;
    vehicleIndex: number;
    barRedEntityId: number;
    barBlueEntityId: number;
    patrolAxis: 'x' | 'z';
    laneCoord: number;
    patrolDir: 1 | -1;
    minCoord: number;
    maxCoord: number;
    patrolSpeed: number;
    pursuitSpeed: number;
    evadeTimer: number;
    evadeSign: number;
    ramCooldown: number;
    dispatched: boolean;
    sector: 'NORTH' | 'SOUTH';
    alwaysPatrol: boolean;
    homeX: number;
    homeY: number;
    homeZ: number;
    homeRotY: number;
    blockedTimer: number;
  }[] = [];
  private cctvNodes: {
    id: string;
    name: string;
    x: number;
    y: number;
    z: number;
    baseRotY: number;
    headEntityId: number;
    ledEntityId: number;
    phase: number;
    alertCooldown: number;
  }[] = [];

  // Police Dispatch, Arrest, Jail, Billboards & Gun Shop Weapon State
  private policeAlertActive = false;
  private policeAlertTimer = 0;
  private policeWantedLevel = 0;
  private policeDispatchCount = 0;
  private policeCallerInfo = '';
  private policeNearestDistMeters = 0;
  private policeEtaSeconds = 0;
  private policeLightbarTimer = 0;
  private bigCrimeActive = false;
  private policeSirenWarningActive = false;
  private policeSirenCountdown = 0;
  private isJailed = false;
  private jailTimeLeft = 0;
  private jailLocationName = '';
  private jailReason = '';
  private jailReleasePos: [number, number, number] = [-11.0, 0.0, 91.5];
  private policeJailCellPos: [number, number, number] = [-18.0, 0.14, 77.2];
  private maxPrisonCellPos: [number, number, number] = [-32.0, 0.18, -221.5];
  private gunShopCounterPos: [number, number, number] = [44.0, 0.12, 52.4];
  private hasWeapon = false;
  private weaponAmmo = 0;
  private gunShopNearby = false;
  private activePatrolCount = 2;
  private pistolEntityId = -1;
  private scratchPistolMat = Mat4.create();
  private billboardScreenEntityIds: number[] = [];
  private billboardNormalMatId = 0;
  private billboardWantedMatId = 0;
  private audioCtx: AudioContext | null = null;
  private sirenAudioCooldown = 0;

  // Zero-alloc scratch helpers for citizens, police officers, CCTV & dispatch
  private tempCitizenMat = Mat4.create();
  private scratchPhoneMat = Mat4.create();
  private scratchCctvMat = Mat4.create();
  private scratchAgentPos: [number, number, number] = [0, 0, 0];
  private scratchAgentDisp: [number, number, number] = [0, 0, 0];

  // Moveable prop mesh/material caches (primitives + mid-level convex)
  private anarchyCrateMeshId = -1;
  private anarchyCrateMatId = -1;
  private anarchyBarrelMeshId = -1;
  private anarchyBarrelMatId = -1;
  private anarchyOctaCrateMeshId = -1;
  private anarchyOctaCrateMatId = -1;
  private anarchyConeMeshId = -1;
  private anarchyConeMatId = -1;
  private anarchyBinMeshId = -1;
  private anarchyBinMatId = -1;

  // Dynamic mesh + shared texture atlas state for runtime GLB prop spawning
  private loadedGeometryPrims: ParsedGLBPrimitive[] = [];
  private sharedAtlasImages: GLBTextureImage[] = [];
  private sharedAtlasMatRefs: { matId: number; globalTexIdx: number }[] = [];

  private tempPropMat = Mat4.create();
  private tempDynamicMat = Mat4.create();
  private userLockedClip = false;
  public activePlayerSourceLabel = 'Procedural Humanoid';

  constructor() {
    this.deviceManager = new DeviceManager();
    // Allocate capacity: 50,000 entities on desktop, 10,000 on mobile
    const entityCap = isMobileBrowser() ? 10000 : 50000;
    this.entityManager = new FlatEntityManager(entityCap, 512, 2048);
    this.camera = new Camera();
    this.renderer = new IndirectRenderer(this.deviceManager, this.entityManager, this.camera);
    this.animController = new VertexAnimationController(this.entityManager);
    this.npcAnimController = new VertexAnimationController();
    this.citizenAnimController = new VertexAnimationController();
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

  public setPlayerEntitiesVisible(visible: boolean): void {
    const ids = this.playerEntityIds;
    for (let i = 0; i < ids.length; i++) {
      this.entityManager.setEntityVisible(ids[i], visible);
    }
  }

  private loop = (currentTime: number) => {
    if (!this.isRunning || this.isDeviceLost) return;

    try {
      const workStart = performance.now();

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
        this.frameCount = 0;
        this.lastFpsUpdate = currentTime;
      }

      // Advance dynamic Day-Night cycle lighting & atmosphere (zero alloc)
      this.renderer.updateDayNightCycle(deltaSec);

      // Update dynamic physics objects (automatic sliding door, elevator, moveable props) - zero alloc
      if (this.physics) {
        const physDyn = this.physics.updateDynamicPhysics(deltaSec, this.playerController.position);
        const elevatorDeltaY = physDyn.elevatorDeltaY;
        const dynMat = this.tempDynamicMat;

        // Update Left Sliding Door Matrix
        if (this.doorLeftEntityId >= 0) {
          const doorX = -2.0 - this.physics.doorOpenFactor * 3.5;
          Mat4.fromTranslationXYZ(doorX, 1.2, 20.0, dynMat);
          this.entityManager.updateEntityMatrixXYZ(this.doorLeftEntityId, dynMat, doorX, 1.2, 20.0, 4.0);
        }

        // Update Right Sliding Door Matrix
        if (this.doorRightEntityId >= 0) {
          const doorX = 2.0 + this.physics.doorOpenFactor * 3.5;
          Mat4.fromTranslationXYZ(doorX, 1.2, 20.0, dynMat);
          this.entityManager.updateEntityMatrixXYZ(this.doorRightEntityId, dynMat, doorX, 1.2, 20.0, 4.0);
        }

        // Update Moving Elevator Platform Matrix
        const eleY = this.physics.elevatorY;
        if (this.elevatorEntityId >= 0) {
          Mat4.fromTranslationXYZ(14.0, eleY, 10.0, dynMat);
          this.entityManager.updateEntityMatrixXYZ(this.elevatorEntityId, dynMat, 14.0, eleY, 10.0, 5.0);
        }

        // Update Elevator Cab Buttons
        if (this.elevatorBtnUpEntityId >= 0) {
          Mat4.fromTranslationXYZ(12.02, eleY + 1.7, 10.8, dynMat);
          this.entityManager.updateEntityMatrixXYZ(this.elevatorBtnUpEntityId, dynMat, 12.02, eleY + 1.7, 10.8, 1.0);
        }

        if (this.elevatorBtnDownEntityId >= 0) {
          Mat4.fromTranslationXYZ(12.02, eleY + 1.3, 10.8, dynMat);
          this.entityManager.updateEntityMatrixXYZ(this.elevatorBtnDownEntityId, dynMat, 12.02, eleY + 1.3, 10.8, 1.0);
        }

        // If player is standing inside elevator cab, ride elevator synchronously (only on foot)
        if (this.playerController.activeVehicleIndex < 0) {
          const pPos = this.playerController.position;
          const newEleTop = eleY + 0.15;
          const prevEleTop = newEleTop - elevatorDeltaY;
          const insideCabXZ =
            Math.abs(pPos[0] - 14.0) <= 2.38 &&
            Math.abs(pPos[2] - 10.0) <= 2.38;
          const onPrevDeck =
            pPos[1] >= prevEleTop - 0.45 &&
            pPos[1] <= prevEleTop + 0.40 &&
            this.playerController.velocityY <= 0.5;

          if (insideCabXZ && onPrevDeck && elevatorDeltaY !== 0) {
            pPos[1] = elevatorDeltaY > 0
              ? Math.max(pPos[1] + elevatorDeltaY, newEleTop)
              : Math.max(0, newEleTop);
            if (this.playerController.velocityY < 0) {
              this.playerController.velocityY = 0;
            }
            this.playerController.isGrounded = true;
          }
        }

        // Update moveable crates & barrels physics and sync entity matrices (zero alloc)
        this.physics.updateMoveableObjects(deltaSec);
        const moveObjs = this.physics.moveableObjects;
        for (let i = 0; i < moveObjs.length; i++) {
          const obj = moveObjs[i];
          if (obj.entityId < 0) continue;
          const cx = Math.cos(obj.tiltX * 0.5), sx = Math.sin(obj.tiltX * 0.5);
          const cy = Math.cos(obj.rotationY * 0.5), sy = Math.sin(obj.rotationY * 0.5);
          const cz = Math.cos(obj.tiltZ * 0.5), sz = Math.sin(obj.tiltZ * 0.5);
          const qw = cy * cx * cz + sy * sx * sz;
          const qx = cy * sx * cz + sy * cx * sz;
          const qy = sy * cx * cz - cy * sx * sz;
          const qz = cy * cx * sz - sy * sx * cz;
          const op = obj.position;
          Mat4.fromTRSValues(op[0], op[1], op[2], qx, qy, qz, qw, 1, 1, 1, this.tempPropMat);
          const rad = Math.max(1.2, Math.hypot(obj.halfExtents[0], obj.halfExtents[1], obj.halfExtents[2]) + 0.3);
          this.entityManager.updateEntityMatrixXYZ(obj.entityId, this.tempPropMat, op[0], op[1], op[2], rad);
          if (obj.extraEntityIds) {
            const extras = obj.extraEntityIds;
            for (let ex = 0; ex < extras.length; ex++) {
              this.entityManager.updateEntityMatrixXYZ(extras[ex], this.tempPropMat, op[0], op[1], op[2], rad);
            }
          }
        }

        // Update non-driven parked/coasting cars (knockback, spin, tilt wobble & chain collisions) - zero alloc
        const anyParkedMoved = this.physics.updateNonDrivenVehicles(deltaSec, this.playerController.activeVehicleIndex);
        if (anyParkedMoved) {
          const activeVehIdx = this.playerController.activeVehicleIndex;
          for (let vIdx = 0; vIdx < this.vehicles.length; vIdx++) {
            if (vIdx === activeVehIdx) continue;
            const car = this.vehicles[vIdx];
            const cx = Math.cos(car.tiltX * 0.5), sx = Math.sin(car.tiltX * 0.5);
            const cy = Math.cos(car.rotationY * 0.5), sy = Math.sin(car.rotationY * 0.5);
            const cz = Math.cos(car.tiltZ * 0.5), sz = Math.sin(car.tiltZ * 0.5);
            const qw = cy * cx * cz + sy * sx * sz;
            const qx = cy * sx * cz + sy * cx * sz;
            const qy = sy * cx * cz - cy * sx * sz;
            const qz = cy * cx * sz - sy * sx * cz;
            const cp = car.position;
            Mat4.fromTRSValues(cp[0], cp[1], cp[2], qx, qy, qz, qw, 1, 1, 1, this.tempPropMat);
            const carEnts = car.entityIds;
            for (let eIdx = 0; eIdx < carEnts.length; eIdx++) {
              this.entityManager.updateEntityMatrixXYZ(carEnts[eIdx], this.tempPropMat, cp[0], cp[1], cp[2], 3.2);
            }
          }
        }
      }

      // Camera update
      this.camera.update(deltaSec);

      // Player / Vehicle controller update
      this.playerController.update(deltaSec);

      // Vertex animation update (skipped when inside a car to save CPU skinning work)
      if (this.playerController.activeVehicleIndex >= 0) {
        // Player character hidden inside vehicle
      } else if (this.userLockedClip) {
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

      // Independent Sitting Desk Woman NPC Animation Evaluation (writes at npcJointOffset, zero alloc)
      if (this.npcHasSkinning && this.npcAnimController.joints.length > 0) {
        const bx = this.npcBasePos[0], by = this.npcBasePos[1], bz = this.npcBasePos[2];
        const npcIds = this.npcEntityIds;
        if (this.npcHitTimer > 0 && this.npcHitClipName) {
          const hitPlaybackRate = this.npcHitDuration > 3.0 ? 1.35 : 1.0;
          const prevRemaining = this.npcHitTimer;
          this.npcHitTimer = Math.max(0, this.npcHitTimer - deltaSec * hitPlaybackRate);
          const elapsed = this.npcHitDuration - prevRemaining;
          this.npcAnimController.evaluateClipAtTime(
            this.npcHitClipName,
            elapsed,
            this.entityManager.jointMatrices,
            this.npcJointOffset
          );
          if (npcIds.length > 0) {
            const impactWindow = Math.min(0.55, this.npcHitDuration);
            const flinch =
              elapsed < impactWindow
                ? Math.sin((elapsed / Math.max(0.05, impactWindow)) * Math.PI) * 0.08
                : 0;
            Mat4.fromTranslationXYZ(bx, by, bz - flinch, this.tempPropMat);
            for (let nIdx = 0; nIdx < npcIds.length; nIdx++) {
              this.entityManager.updateEntityMatrixXYZ(npcIds[nIdx], this.tempPropMat, bx, by + 0.7, bz - flinch, 2.0);
            }
          }
        } else {
          if (this.npcIdleClipName) {
            if (this.npcAnimController.getCurrentClipName() !== this.npcIdleClipName) {
              this.npcAnimController.playClipByName(this.npcIdleClipName, true);
            }
            this.npcAnimController.update(deltaSec, this.entityManager.jointMatrices, this.npcJointOffset);
          } else if (this.npcHitClipName) {
            this.npcAnimController.evaluateClipAtTime(
              this.npcHitClipName,
              0,
              this.entityManager.jointMatrices,
              this.npcJointOffset
            );
          }
          if (npcIds.length > 0) {
            Mat4.fromTranslationXYZ(bx, by, bz, this.tempPropMat);
            for (let nIdx = 0; nIdx < npcIds.length; nIdx++) {
              this.entityManager.updateEntityMatrixXYZ(npcIds[nIdx], this.tempPropMat, bx, by + 0.7, bz, 2.0);
            }
          }
        }
      }

      // Scaled & Colored Remy Citizens + Mobile Phones + 6 Police Officers + 15 Police Patrol Cars + 18 CCTV Cameras (zero alloc)
      this.citizenSimTime += deltaSec;
      this.updateCitizensPoliceAndCCTV(deltaSec, currentTime * 0.001);

      // Update Smart Floor/Interior Culling before uploading entity flags to GPU
      this.updateSmartCulling();

      // Upload dynamic entities & joint matrices to GPU and execute culled render
      if (!this.deviceManager.isDeviceLost) {
        const device = this.deviceManager.getDevice();
        this.entityManager.uploadToGPU(device);

        const timeSec = currentTime * 0.001;
        this.renderer.render(timeSec, this.stats);
      }

      const workMs = performance.now() - workStart;
      this.currentFrameTime += (workMs - this.currentFrameTime) * 0.2;

      // Update telemetry stats (zero allocation)
      this.stats.fps = this.currentFps;
      this.stats.frameTimeMs = Math.round(this.currentFrameTime * 10) * 0.1;
      const totalEnt = this.entityManager.activeEntityCount;
      this.stats.totalInstances = totalEnt;
      const renderedCount = this.entityManager.lastCulledVisibleCount;
      this.stats.visibleInstances = renderedCount;
      this.stats.culledInstances = Math.max(0, totalEnt - renderedCount);
      this.stats.totalVertices = this.entityManager.getTotalVertices();
      this.stats.totalTriangles = this.entityManager.getTotalTriangles();
      const vIdx = this.playerController.activeVehicleIndex;
      const nIdx = this.playerController.nearbyVehicleIndex;
      if (vIdx >= 0 && vIdx < this.vehicles.length) {
        const car = this.vehicles[vIdx];
        this.stats.isDriving = true;
        this.stats.activeVehicleName = car.name;
        this.stats.vehicleSpeedKmh = Math.round(Math.abs(car.speed) * 3.6);
        this.stats.activeVehicleHealth = Math.round(car.health);
        this.stats.nearbyVehicleName = '';
        this.stats.nearbyVehicleHealth = 100;
      } else {
        this.stats.isDriving = false;
        this.stats.activeVehicleName = '';
        this.stats.vehicleSpeedKmh = 0;
        this.stats.activeVehicleHealth = 100;
        if (nIdx >= 0 && nIdx < this.vehicles.length) {
          const nearCar = this.vehicles[nIdx];
          this.stats.nearbyVehicleName = nearCar.name;
          this.stats.nearbyVehicleHealth = Math.round(nearCar.health);
        } else {
          this.stats.nearbyVehicleName = '';
          this.stats.nearbyVehicleHealth = 100;
        }
      }
      this.stats.timeOfDayHours = this.renderer.timeOfDayHours;
      this.stats.dayNightPhase = this.renderer.dayNightPhase;
      this.stats.dayNightPaused = !this.renderer.dayNightAutoCycle;
      this.stats.dayNightSpeed = this.renderer.dayNightSpeed;
      this.stats.policeAlertActive = this.policeAlertActive;
      this.stats.policeWantedLevel = this.policeWantedLevel;
      this.stats.policeDispatchCount = this.policeDispatchCount;
      this.stats.policeNearestDistMeters = this.policeNearestDistMeters;
      this.stats.policeEtaSeconds = this.policeEtaSeconds;
      this.stats.policeCallerInfo = this.policeCallerInfo;
      this.stats.cityCitizenCount = this.citizenAgents.length;
      this.stats.cctvCameraCount = this.cctvNodes.length;
      this.stats.bigCrimeActive = this.bigCrimeActive;
      this.stats.policeSirenWarningActive = this.policeSirenWarningActive;
      this.stats.policeSirenCountdown = this.policeSirenCountdown;
      this.stats.isJailed = this.isJailed;
      this.stats.jailTimeLeft = Math.max(0, Math.round(this.jailTimeLeft * 10) * 0.1);
      this.stats.jailLocationName = this.jailLocationName;
      this.stats.jailReason = this.jailReason;
      this.stats.hasWeapon = this.hasWeapon;
      this.stats.weaponAmmo = this.weaponAmmo;
      this.stats.gunShopNearby = this.gunShopNearby;
      this.stats.activePatrolCount = this.activePatrolCount;
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

  private async tryFetchGLB(url: string, allowCache = true): Promise<ArrayBuffer | null> {
    try {
      const res = await fetch(url, { cache: allowCache ? 'default' : 'no-store' });
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

  private async tryFetchGLBWithTimeout(url: string, timeoutMs = 4000): Promise<ArrayBuffer | null> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        cache: 'default',
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 12) return null;
      const dv = new DataView(buf);
      if (dv.getUint32(0, true) !== 0x46546c67) return null;
      return buf;
    } catch {
      return null;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  public setTimeOfDay(hours: number): void {
    this.renderer.dayNightEnabled = true;
    this.renderer.timeOfDayHours = ((hours % 24) + 24) % 24;
    this.renderer.updateDayNightCycle(0);
    this.stats.timeOfDayHours = this.renderer.timeOfDayHours;
    this.stats.dayNightPhase = this.renderer.dayNightPhase;
  }

  public toggleDayNightPause(): boolean {
    this.renderer.dayNightAutoCycle = !this.renderer.dayNightAutoCycle;
    if (this.renderer.dayNightAutoCycle) {
      this.renderer.dayNightEnabled = true;
      this.renderer.updateDayNightCycle(0);
    }
    this.stats.dayNightPaused = !this.renderer.dayNightAutoCycle;
    return this.renderer.dayNightAutoCycle;
  }

  public setDayNightSpeed(speed: number): void {
    this.renderer.dayNightSpeed = Math.max(0.1, Math.min(60, speed));
    this.stats.dayNightSpeed = this.renderer.dayNightSpeed;
  }

  /**
   * Appends used texture images from a parsed GLB into the shared GPU diffuse atlas
   * and rebuilds the atlas texture without clobbering previously loaded models.
   * Returns a map from local textureImageIndex -> global sharedAtlasImages index.
   */
  private registerTexturesInSharedAtlas(
    textures: GLBTextureImage[],
    primitives: ParsedGLBPrimitive[]
  ): Map<number, number> {
    const localToGlobal = new Map<number, number>();
    if (textures.length === 0) return localToGlobal;

    const usedLocalIndices = new Set<number>();
    for (const p of primitives) {
      if (p.textureImageIndex !== undefined && p.textureImageIndex !== null) {
        usedLocalIndices.add(p.textureImageIndex);
      }
    }
    if (usedLocalIndices.size === 0) return localToGlobal;

    // Keep mobile VRAM light by capping combined atlas tiles at 16 (mobile) / 25 (desktop)
    const maxTiles = isMobileBrowser() ? 16 : 25;
    for (const tex of textures) {
      if (!usedLocalIndices.has(tex.index)) continue;
      if (this.sharedAtlasImages.length >= maxTiles) break;
      const globalIdx = this.sharedAtlasImages.length;
      this.sharedAtlasImages.push({
        index: globalIdx,
        bytes: tex.bytes,
        mimeType: tex.mimeType,
      });
      localToGlobal.set(tex.index, globalIdx);
    }
    return localToGlobal;
  }

  private async rebuildSharedDiffuseAtlas(): Promise<void> {
    if (this.sharedAtlasImages.length === 0 || typeof document === 'undefined') {
      this.renderer.clearDiffuseAtlas();
      return;
    }

    const cols = Math.ceil(Math.sqrt(this.sharedAtlasImages.length));
    const tileSize = isMobileBrowser() ? (cols <= 2 ? 256 : 192) : (cols <= 4 ? 512 : 256);

    const decoded: { globalIdx: number; bitmap: ImageBitmap }[] = [];
    for (const tex of this.sharedAtlasImages) {
      try {
        const copy = new Uint8Array(tex.bytes);
        const blob = new Blob([copy], { type: tex.mimeType || 'image/png' });
        let bitmap: ImageBitmap;
        try {
          // Decode directly at target tile size so 4K PNGs never exhaust mobile memory
          bitmap = await createImageBitmap(blob, {
            resizeWidth: tileSize,
            resizeHeight: tileSize,
            resizeQuality: 'medium',
          });
        } catch {
          bitmap = await createImageBitmap(blob);
        }
        decoded.push({ globalIdx: tex.index, bitmap });
      } catch (err) {
        console.warn('[GLB Texture Decode] Skipping image', tex.index, err);
      }
    }

    if (decoded.length === 0) {
      this.renderer.clearDiffuseAtlas();
      for (const ref of this.sharedAtlasMatRefs) {
        const mat = this.entityManager.getMaterial(ref.matId);
        if (mat) {
          mat.flags = (mat.flags ?? 0) & ~2;
          this.entityManager.updateMaterial(ref.matId, mat);
        }
      }
      return;
    }

    const atlasSize = cols * tileSize;

    const canvas = document.createElement('canvas');
    canvas.width = atlasSize;
    canvas.height = atlasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      for (const d of decoded) d.bitmap.close();
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, atlasSize, atlasSize);

    const newRects: ([number, number, number] | undefined)[] = new Array(this.sharedAtlasImages.length);
    for (let i = 0; i < decoded.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * tileSize;
      const y = row * tileSize;
      ctx.drawImage(decoded[i].bitmap, x, y, tileSize, tileSize);
      decoded[i].bitmap.close();

      newRects[decoded[i].globalIdx] = [
        (x + 0.5) / atlasSize,
        (y + 0.5) / atlasSize,
        (tileSize - 1.0) / atlasSize,
      ];
    }

    const imgData = ctx.getImageData(0, 0, atlasSize, atlasSize);
    this.renderer.setDiffuseAtlas(new Uint8Array(imgData.data.buffer), atlasSize, atlasSize);

    // Refresh existing material atlas UVs whenever the shared atlas grows, or fall back to baseColor if tile decode failed
    for (const ref of this.sharedAtlasMatRefs) {
      const mat = this.entityManager.getMaterial(ref.matId);
      const rect = newRects[ref.globalTexIdx];
      if (mat && rect) {
        mat.atlasRect = rect;
        mat.flags = 2;
        this.entityManager.updateMaterial(ref.matId, mat);
      } else if (mat) {
        mat.flags = (mat.flags ?? 0) & ~2;
        this.entityManager.updateMaterial(ref.matId, mat);
      }
    }
  }

  private registerTexturedPrimitivesMaterials(
    primitives: ParsedGLBPrimitive[],
    localToGlobalTex: Map<number, number>,
    defaultMatId: number
  ): number[] {
    return primitives.map((prim) => {
      if (!prim.material && (prim.textureImageIndex === undefined || prim.textureImageIndex === null)) {
        return defaultMatId;
      }
      const m = prim.material || {
        baseColor: [0.85, 0.85, 0.88, 1.0] as [number, number, number, number],
        emissiveColor: [0, 0, 0, 0] as [number, number, number, number],
        roughness: 0.55,
        metallic: 0.1,
        ao: 1.0,
        alphaCutoff: 0.5,
      };
      const globalTexIdx =
        prim.textureImageIndex !== undefined && prim.textureImageIndex !== null
          ? localToGlobalTex.get(prim.textureImageIndex)
          : undefined;
      const matId = this.entityManager.registerMaterial({
        ...m,
        flags: globalTexIdx !== undefined ? 2 : 0,
      });
      if (globalTexIdx !== undefined) {
        this.sharedAtlasMatRefs.push({ matId, globalTexIdx });
      }
      return matId;
    });
  }

  private async resolveAnarchyPlayer(): Promise<{
    primitives: ParsedGLBPrimitive[];
    joints: import('./core/Types').SkeletonJoint[];
    clips: import('./core/Types').AnimationClip[];
    textures: GLBTextureImage[];
    isCustomRig: boolean;
    sourceLabel: string;
  }> {
    // 1. Check in-memory uploaded GLB first
    let glbBuffer: ArrayBuffer | null = this.customPlayerGLB?.buffer ?? null;
    let glbName = this.customPlayerGLB?.name ?? '';

    // 2. Check server-persisted GLB uploads (/api/assets, ignoring NPC worker-woman uploads)
    if (!glbBuffer) {
      try {
        const res = await fetch('/api/assets', { cache: 'no-store' });
        if (res.ok) {
          const assets: { name: string; url: string }[] = await res.json();
          const glbAssets = assets.filter(
            (a) => /\.glb$/i.test(a.name) && !/worker[-_]?woman|^npc_/i.test(a.name)
          );
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

    // 3. Check Vite-discovered workspace assets & standard paths (excluding worker-woman NPC files)
    if (!glbBuffer) {
      const globUrls = Object.values(
        import.meta.glob('/src/assets/**/*.glb', { query: '?url', eager: true, import: 'default' })
      ) as string[];

      const filteredGlobs = globUrls.filter((u) => !/worker[-_]?woman|\/npc\//i.test(u));
      const candidatePaths = [
        ...filteredGlobs.sort((a, b) => (/remy/i.test(a) ? -1 : /remy/i.test(b) ? 1 : 0)),
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
          let finalClips = [...parsed.clips];
          if (parsed.hasSkinning && MixamoAnimations.isMixamoSkeleton(parsed.joints)) {
            const generated = MixamoAnimations.generateStandardClips(parsed.joints);
            if (finalClips.length === 0) {
              finalClips = generated;
            } else {
              const hasWalk = finalClips.some((c) => /walk|run|move/i.test(c.name));
              const hasIdle = finalClips.some((c) => /idle|stand|breath/i.test(c.name));
              const hasJump = finalClips.some((c) => /jump|air/i.test(c.name));
              const hasPunch = finalClips.some((c) => /punch|jab|hit|attack/i.test(c.name));
              for (const g of generated) {
                if (!hasWalk && g.name === 'Mixamo_Walk_Cycle') finalClips.push(g);
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
            textures: parsed.textures,
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
            textures: [],
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
      textures: [],
      isCustomRig: false,
      sourceLabel: 'Procedural Humanoid',
    };
  }

  /**
   * Resolves the Sitting Desk Woman NPC from:
   * 1. Uploaded customNpcGLB,
   * 2. Server-persisted /api/assets matching worker-woman or npc_,
   * 3. Workspace src/assets/animations/worker-woman-1/worker-woman-1.glb,
   * 4. Procedural articulated Sitting Office Worker fallback.
   */
  private async resolveOfficeWorkerNPC(): Promise<{
    primitives: ParsedGLBPrimitive[];
    joints: import('./core/Types').SkeletonJoint[];
    clips: import('./core/Types').AnimationClip[];
    textures: GLBTextureImage[];
    hasSkinning: boolean;
    sourceLabel: string;
  }> {
    let glbBuffer: ArrayBuffer | null = this.customNpcGLB?.buffer ?? null;
    let glbName = this.customNpcGLB?.name ?? '';

    if (!glbBuffer) {
      try {
        const res = await fetch('/api/assets', { cache: 'no-store' });
        if (res.ok) {
          const assets: { name: string; url: string }[] = await res.json();
          const npcAssets = assets.filter((a) => /\.glb$/i.test(a.name) && /worker[-_]?woman|^npc_/i.test(a.name));
          if (npcAssets.length > 0) {
            glbBuffer = await this.tryFetchGLB(npcAssets[0].url);
            if (glbBuffer) glbName = npcAssets[0].name;
          }
        }
      } catch {
        // optional
      }
    }

    if (!glbBuffer) {
      const globUrls = Object.values(
        import.meta.glob('/src/assets/**/*.glb', { query: '?url', eager: true, import: 'default' })
      ) as string[];
      const workerGlobs = globUrls.filter((u) => /worker[-_]?woman/i.test(u));
      const candidatePaths = [
        ...workerGlobs,
        '/src/assets/animations/worker-woman-1/worker-woman-1.glb',
        '/assets/animations/worker-woman-1/worker-woman-1.glb',
        '/assets/worker-woman-1.glb',
        '/worker-woman-1.glb',
        'https://raw.githubusercontent.com/zlatnaspirala/destroyer/main/src/assets/animations/worker-woman-1/worker-woman-1.glb',
      ];
      for (const candidate of candidatePaths) {
        if (!candidate) continue;
        const buf = await this.tryFetchGLB(candidate, true);
        if (buf) {
          glbBuffer = buf;
          glbName = candidate.split('/').pop()?.split('?')[0] || 'worker-woman-1.glb';
          break;
        }
      }
    }

    if (glbBuffer) {
      try {
        const parsed = GLBLoader.parse(glbBuffer, { normalizeToHeight: 1.30 });
        if (parsed.primitives.length > 0) {
          let finalClips = [...parsed.clips];
          if (parsed.hasSkinning && MixamoAnimations.isMixamoSkeleton(parsed.joints) && finalClips.length === 0) {
            finalClips = MixamoAnimations.generateSeatedClips(parsed.joints);
          }
          return {
            primitives: parsed.primitives,
            joints: parsed.joints,
            clips: finalClips,
            textures: parsed.textures,
            hasSkinning: parsed.hasSkinning && parsed.joints.length > 0,
            sourceLabel: `GLB: ${glbName}`,
          };
        }
      } catch (err) {
        console.warn('[NPC GLB Parse Error] Falling back to procedural sitting worker:', err);
      }
    }

    const proc = ProceduralModels.createSittingOfficeWorker();
    return {
      primitives: proc.primitives,
      joints: proc.joints,
      clips: proc.clips,
      textures: [],
      hasSkinning: true,
      sourceLabel: 'Procedural Sitting Worker',
    };
  }

  public triggerNpcPunchReaction(npcId: string): void {
    if (npcId === 'office_worker_woman') {
      this.npcHitTimer = Math.max(0.45, this.npcHitDuration);
      this.onCrimeReported(this.npcBasePos[0], this.npcBasePos[1], this.npcBasePos[2], 'Desk Worker (911 Phone)');
      return;
    }

    for (let i = 0; i < this.citizenAgents.length; i++) {
      const c = this.citizenAgents[i];
      if (c.id === npcId) {
        c.stumbleTimer = 0.85;
        c.phoneCallTimer = 10.0;
        this.onCrimeReported(c.x, 0, c.z, `${c.name} (Mobile 911)`);
        this.alertBystanderPhones(c.x, c.z, c.id);
        return;
      }
    }

    for (let i = 0; i < this.policeOfficers.length; i++) {
      const off = this.policeOfficers[i];
      if (off.id === npcId) {
        off.stumbleTimer = 0.55;
        this.onCrimeReported(off.x, off.y, off.z, `${off.name} (Officer Assaulted!)`);
        return;
      }
    }
  }

  public onPlayerPunchWitnessCheck(pos: [number, number, number], alreadyHitNpc: boolean): void {
    // Check if any citizen nearby saw the assault & dials 911 with their phone
    let witnessTriggered = alreadyHitNpc;
    for (let i = 0; i < this.citizenAgents.length; i++) {
      const c = this.citizenAgents[i];
      const d = Math.hypot(c.x - pos[0], c.z - pos[2]);
      if (d <= 22.0) {
        c.phoneCallTimer = Math.max(c.phoneCallTimer, 8.0);
        if (!witnessTriggered) {
          witnessTriggered = true;
          this.onCrimeReported(pos[0], pos[1], pos[2], `${c.name} (Witness Mobile)`);
        }
      }
    }

    // Check if any City 0 CCTV surveillance camera covers the punch location
    for (let i = 0; i < this.cctvNodes.length; i++) {
      const cam = this.cctvNodes[i];
      const d = Math.hypot(cam.x - pos[0], cam.z - pos[2]);
      if (d <= 18.0 && cam.alertCooldown <= 0) {
        cam.alertCooldown = 8.0;
        this.onCrimeReported(pos[0], pos[1], pos[2], `${cam.name} (City CCTV)`);
        break;
      }
    }
  }

  private alertBystanderPhones(cx: number, cz: number, excludeId: string): void {
    for (let i = 0; i < this.citizenAgents.length; i++) {
      const c = this.citizenAgents[i];
      if (c.id === excludeId) continue;
      const d = Math.hypot(c.x - cx, c.z - cz);
      if (d <= 24.0) {
        c.phoneCallTimer = Math.max(c.phoneCallTimer, 8.5);
      }
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          this.audioCtx = new Ctor();
        } catch {
          return null;
        }
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private playPoliceSirenBeep(): void {
    if (this.sirenAudioCooldown > 0) return;
    this.sirenAudioCooldown = 0.65;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(920, now + 0.16);
      osc.frequency.setValueAtTime(660, now + 0.32);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.50);
    } catch {
      // Ignore audio errors
    }
  }

  private playGunshotSound(): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {
      // Ignore audio errors
    }
  }

  private async createBillboardCanvasTexture(isWanted: boolean): Promise<Uint8Array | null> {
    if (typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      if (!isWanted) {
        const grad = ctx.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, '#09111f');
        grad.addColorStop(1, '#172554');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 14;
        ctx.strokeRect(18, 18, 476, 476);

        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(42, 48, 428, 72);
        ctx.fillStyle = '#082f49';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('METRO CITY 0', 256, 98);

        ctx.fillStyle = '#e0f2fe';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('DOWNTOWN PLAZA', 256, 200);

        ctx.fillStyle = '#7dd3fc';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('SKYLINE BUSINESS TOWERS', 256, 255);
        ctx.fillText('GUN SHOP NOW OPEN · [E]', 256, 315);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(42, 372, 428, 86);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 22px monospace';
        ctx.fillText('PATROL SECTORS: NORTH & SOUTH', 256, 412);
        ctx.fillText('24/7 CITY CCTV ACTIVE', 256, 444);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#7f1d1d');
        grad.addColorStop(1, '#3b0712');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        // Caution stripes top & bottom
        ctx.fillStyle = '#facc15';
        ctx.fillRect(0, 0, 512, 32);
        ctx.fillRect(0, 480, 512, 32);
        ctx.fillStyle = '#111827';
        for (let sx = -32; sx < 544; sx += 48) {
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx + 24, 0);
          ctx.lineTo(sx + 8, 32);
          ctx.lineTo(sx - 16, 32);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(sx, 480);
          ctx.lineTo(sx + 24, 480);
          ctx.lineTo(sx + 8, 512);
          ctx.lineTo(sx - 16, 512);
          ctx.closePath();
          ctx.fill();
        }

        // Crisp WANTED Header
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(34, 48, 444, 108);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 8;
        ctx.strokeRect(34, 48, 444, 108);
        ctx.fillStyle = '#b91c1c';
        ctx.font = 'bold 88px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WANTED', 256, 132);

        // Mugshot Target Reticle + Criminal Silhouette
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(256, 250, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(256, 232, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(256, 286, 40, 26, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(256, 250, 74, 0, Math.PI * 2);
        ctx.moveTo(166, 250);
        ctx.lineTo(202, 250);
        ctx.moveTo(310, 250);
        ctx.lineTo(346, 250);
        ctx.moveTo(256, 160);
        ctx.lineTo(256, 196);
        ctx.moveTo(256, 304);
        ctx.lineTo(256, 340);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('BIG CRIME ALERT', 256, 376);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('REWARD $50,000 · CALL 911', 256, 418);
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('ALL 15 UNITS DISPATCHED · MAX PRISON', 256, 456);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return null;
      return new Uint8Array(await blob.arrayBuffer());
    } catch {
      return null;
    }
  }

  private setBillboardWantedMode(wanted: boolean): void {
    const targetMat = wanted ? this.billboardWantedMatId : this.billboardNormalMatId;
    if (targetMat <= 0) return;
    for (let i = 0; i < this.billboardScreenEntityIds.length; i++) {
      this.entityManager.setEntityMaterialId(this.billboardScreenEntityIds[i], targetMat);
    }
  }

  public isPlayerJailed(): boolean {
    return this.isJailed;
  }

  public tryInteractGunShop(): boolean {
    if (this.isJailed || this.playerController.activeVehicleIndex >= 0) return false;
    const p = this.playerController.position;
    const dist = Math.hypot(p[0] - this.gunShopCounterPos[0], p[2] - this.gunShopCounterPos[2]);
    if (dist <= 4.2 && Math.abs(p[1] - this.gunShopCounterPos[1]) < 3.0) {
      this.hasWeapon = true;
      this.weaponAmmo = 24;
      if (this.pistolEntityId >= 0) {
        this.entityManager.setEntityVisible(this.pistolEntityId, true);
      }
      return true;
    }
    return false;
  }

  public consumeWeaponShot(): boolean {
    if (this.isJailed || !this.hasWeapon || this.weaponAmmo <= 0) return false;
    this.weaponAmmo--;
    return true;
  }

  public onWeaponFired(pos: [number, number, number], hitNpcId: string | null, hitPoliceCar: boolean): void {
    this.playGunshotSound();
    if (hitNpcId) {
      this.triggerNpcPunchReaction(hitNpcId);
    }
    this.onBigCrimeCommitted(pos[0], pos[1], pos[2], hitPoliceCar ? 'Gunfire at Police Cruiser' : 'Downtown Gunshots');
  }

  public onPoliceCarPunched(): void {
    this.arrestPlayer('Punched Police Cruiser', false);
  }

  public onBigCrimeCommitted(cx: number, cy: number, cz: number, callerLabel: string): void {
    this.bigCrimeActive = true;
    this.policeWantedLevel = Math.max(3, this.policeWantedLevel);
    this.setBillboardWantedMode(true);
    this.onCrimeReported(cx, cy, cz, callerLabel);
  }

  public arrestPlayer(reason: string, isBigCrimeArrest = false): void {
    if (this.isJailed) return;
    if (this.playerController.activeVehicleIndex >= 0) {
      this.playerController.activeVehicleIndex = -1;
      this.setPlayerEntitiesVisible(true);
    }

    const useMaxPrison = isBigCrimeArrest || this.bigCrimeActive || this.policeWantedLevel >= 3;
    const targetCell = useMaxPrison ? this.maxPrisonCellPos : this.policeJailCellPos;

    if (useMaxPrison) {
      this.physics.setColliderTrigger('MaxPrison_JailGate', false);
      this.physics.setColliderTrigger('City0_PoliceStation_JailGate', true);
      this.jailReleasePos[0] = -32.0;
      this.jailReleasePos[1] = 0.0;
      this.jailReleasePos[2] = -196.0;
      this.jailLocationName = 'Maximum Security Prison';
      this.jailTimeLeft = 12.0;
    } else {
      this.physics.setColliderTrigger('City0_PoliceStation_JailGate', false);
      this.physics.setColliderTrigger('MaxPrison_JailGate', true);
      this.jailReleasePos[0] = -11.0;
      this.jailReleasePos[1] = 0.0;
      this.jailReleasePos[2] = 91.5;
      this.jailLocationName = 'City 0 Police Station Jail';
      this.jailTimeLeft = 8.0;
    }

    this.isJailed = true;
    this.jailReason = reason;
    this.policeAlertActive = false;
    this.policeAlertTimer = 0;
    this.bigCrimeActive = false;
    this.policeWantedLevel = 0;
    this.policeDispatchCount = 0;
    this.policeCallerInfo = '';
    this.policeNearestDistMeters = 0;
    this.policeEtaSeconds = 0;
    this.policeSirenWarningActive = false;
    this.policeSirenCountdown = 0;
    this.setBillboardWantedMode(false);

    if (this.pistolEntityId >= 0) {
      this.entityManager.setEntityVisible(this.pistolEntityId, false);
    }

    // Clear active pursuits and return reserve police cars to parked posts
    for (let i = 0; i < this.policeCarAgents.length; i++) {
      const pa = this.policeCarAgents[i];
      pa.dispatched = false;
      pa.blockedTimer = 0;
      pa.evadeTimer = 0;
      if (!pa.alwaysPatrol && pa.vehicle.health > 0) {
        pa.vehicle.position[0] = pa.homeX;
        pa.vehicle.position[1] = pa.homeY;
        pa.vehicle.position[2] = pa.homeZ;
        pa.vehicle.rotationY = pa.homeRotY;
        pa.vehicle.speed = 0;
        this.physics.updateVehicleCollider(pa.vehicle.colliderId, pa.homeX, pa.homeY, pa.homeZ, pa.homeRotY);
        const hy = pa.homeRotY * 0.5;
        Mat4.fromTRSValues(pa.homeX, pa.homeY, pa.homeZ, 0, Math.sin(hy), 0, Math.cos(hy), 1, 1, 1, this.tempPropMat);
        for (let eIdx = 0; eIdx < pa.vehicle.entityIds.length; eIdx++) {
          this.entityManager.updateEntityMatrixXYZ(pa.vehicle.entityIds[eIdx], this.tempPropMat, pa.homeX, pa.homeY, pa.homeZ, 3.2);
        }
      }
    }

    this.playerController.position[0] = targetCell[0];
    this.playerController.position[1] = targetCell[1];
    this.playerController.position[2] = targetCell[2];
    this.playerController.velocityY = 0;
    this.playerController.currentSpeed = 0;
    this.playerController.isGrounded = true;
    this.playerController.knockbackVelX = 0;
    this.playerController.knockbackVelZ = 0;

    this.camera.target[0] = targetCell[0];
    this.camera.target[1] = targetCell[1] + 1.4;
    this.camera.target[2] = targetCell[2];
    this.camera.updatePositionFromSpherical();
  }

  public releaseFromJail(): void {
    if (!this.isJailed) return;
    this.isJailed = false;
    this.jailTimeLeft = 0;
    this.jailReason = '';
    this.physics.setColliderTrigger('City0_PoliceStation_JailGate', true);
    this.physics.setColliderTrigger('MaxPrison_JailGate', true);

    this.playerController.position[0] = this.jailReleasePos[0];
    this.playerController.position[1] = this.jailReleasePos[1];
    this.playerController.position[2] = this.jailReleasePos[2];
    this.playerController.velocityY = 0;
    this.playerController.currentSpeed = 0;
    this.playerController.isGrounded = true;
    this.playerController.knockbackVelX = 0;
    this.playerController.knockbackVelZ = 0;

    if (this.pistolEntityId >= 0) {
      this.entityManager.setEntityVisible(this.pistolEntityId, this.hasWeapon);
    }

    this.camera.target[0] = this.jailReleasePos[0];
    this.camera.target[1] = this.jailReleasePos[1] + 1.4;
    this.camera.target[2] = this.jailReleasePos[2];
    this.camera.updatePositionFromSpherical();
  }

  public onCrimeReported(cx: number, _cy: number, cz: number, callerLabel: string): void {
    if (this.isJailed) return;
    this.policeAlertActive = true;
    this.policeAlertTimer = 38.0;
    this.policeWantedLevel = Math.min(5, this.policeWantedLevel + 1);
    this.policeCallerInfo = callerLabel;

    // Escalate to Big Crime -> switch Downtown billboards to WANTED poster & dispatch reserve police fleet
    if (
      this.bigCrimeActive ||
      this.policeWantedLevel >= 2 ||
      /gun|shot|officer|prison|wanted/i.test(callerLabel)
    ) {
      this.bigCrimeActive = true;
      this.setBillboardWantedMode(true);
    }

    // Normal patrol split: only 2 patrolling cars (North #01 + South #02). Other 13 dispatch only on Big Crime!
    const targetDispatched = this.bigCrimeActive
      ? Math.min(
          this.policeCarAgents.length,
          this.policeWantedLevel <= 2 ? 6 : this.policeWantedLevel === 3 ? 10 : this.policeWantedLevel === 4 ? 13 : 15
        )
      : 2;

    const activeVeh = this.playerController.activeVehicleIndex;
    let bestDist = Infinity;
    let bestSpeed = 19.0;

    // Reset & measure live distances of police cars eligible for this response tier
    for (let i = 0; i < this.policeCarAgents.length; i++) {
      const pa = this.policeCarAgents[i];
      pa.dispatched = false;
      if (pa.vehicleIndex === activeVeh || pa.vehicle.health <= 0) continue;
      if (!this.bigCrimeActive && !pa.alwaysPatrol) continue;
      const d = Math.hypot(pa.vehicle.position[0] - cx, pa.vehicle.position[2] - cz);
      if (d < bestDist) {
        bestDist = d;
        bestSpeed = pa.pursuitSpeed;
      }
    }

    // Greedily pick closest `targetDispatched` eligible patrol units with zero array allocations
    let assigned = 0;
    for (let pass = 0; pass < targetDispatched; pass++) {
      let pickIdx = -1;
      let pickDist = Infinity;
      for (let i = 0; i < this.policeCarAgents.length; i++) {
        const pa = this.policeCarAgents[i];
        if (pa.dispatched || pa.vehicleIndex === activeVeh || pa.vehicle.health <= 0) continue;
        if (!this.bigCrimeActive && !pa.alwaysPatrol) continue;
        const d = Math.hypot(pa.vehicle.position[0] - cx, pa.vehicle.position[2] - cz);
        if (d < pickDist) {
          pickDist = d;
          pickIdx = i;
        }
      }
      if (pickIdx >= 0) {
        this.policeCarAgents[pickIdx].dispatched = true;
        assigned++;
      } else {
        break;
      }
    }

    // Also include foot police officer distances in ETA check
    for (let i = 0; i < this.policeOfficers.length; i++) {
      const off = this.policeOfficers[i];
      const d = Math.hypot(off.x - cx, off.z - cz);
      if (d < bestDist) {
        bestDist = d;
        bestSpeed = this.playerController.walkSpeedForward;
      }
    }

    this.policeDispatchCount = assigned + this.policeOfficers.length;
    if (Number.isFinite(bestDist)) {
      this.policeNearestDistMeters = Math.round(bestDist);
      this.policeEtaSeconds = Math.round((bestDist / Math.max(8.5, bestSpeed)) * 10) * 0.1;
    }
  }

  private async resolveRemyCitizenRig(): Promise<{
    primitives: ParsedGLBPrimitive[];
    joints: import('./core/Types').SkeletonJoint[];
    clips: import('./core/Types').AnimationClip[];
    textures: GLBTextureImage[];
    hasSkinning: boolean;
  }> {
    let glbBuffer: ArrayBuffer | null = null;
    const globUrls = Object.values(
      import.meta.glob('/src/assets/**/*.glb', { query: '?url', eager: true, import: 'default' })
    ) as string[];
    const remyGlobs = globUrls.filter((u) => /remy/i.test(u));
    const candidatePaths = [
      ...remyGlobs,
      '/src/assets/animations/character-remy/remy.glb',
      '/assets/animations/character-remy/remy.glb',
      '/assets/remy.glb',
      '/remy.glb',
    ];
    for (const candidate of candidatePaths) {
      if (!candidate) continue;
      const buf = await this.tryFetchGLB(candidate, true);
      if (buf) {
        glbBuffer = buf;
        break;
      }
    }

    if (glbBuffer) {
      try {
        const parsed = GLBLoader.parse(glbBuffer, { normalizeToHeight: 1.75 });
        if (parsed.primitives.length > 0 && parsed.hasSkinning && parsed.joints.length > 0) {
          const generated = MixamoAnimations.isMixamoSkeleton(parsed.joints)
            ? MixamoAnimations.generateStandardClips(parsed.joints)
            : parsed.clips;
          return {
            primitives: parsed.primitives,
            joints: parsed.joints,
            clips: generated.length > 0 ? generated : parsed.clips,
            textures: parsed.textures,
            hasSkinning: true,
          };
        }
      } catch (err) {
        console.warn('[Remy Crowd GLB Parse Error] Using humanoid fallback:', err);
      }
    }

    const proc = ProceduralModels.createSimpleHumanoidPlayer();
    return {
      primitives: [proc.primitive],
      joints: proc.joints,
      clips: proc.allClips,
      textures: [],
      hasSkinning: true,
    };
  }

  async loadNpcGLB(arrayBuffer: ArrayBuffer, fileName = 'worker-woman-1.glb'): Promise<void> {
    if (this.isDeviceLost) return;
    const savedPos: [number, number, number] = [...this.playerController.position];
    const savedTheta = this.playerController.cameraTheta;
    const savedPhi = this.playerController.cameraPhi;
    const savedDist = this.playerController.cameraDistance;

    this.customNpcGLB = { buffer: arrayBuffer, name: fileName };
    await this.loadAnarchyWorld();

    if (this.playerController.entityId >= 0) {
      this.playerController.position = savedPos;
      this.playerController.cameraTheta = savedTheta;
      this.playerController.cameraPhi = savedPhi;
      this.playerController.rotationY = savedTheta + Math.PI;
      this.playerController.cameraDistance = savedDist;
    }
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
    this.npcAnimController.clear();
    this.citizenAnimController.clear();
    this.renderer.clearDiffuseAtlas();
    this.renderer.waveFactor = 0.0;
    this.playerController.extraEntityIds = [];
    this.anarchyCrateMeshId = -1;
    this.anarchyCrateMatId = -1;
    this.anarchyBarrelMeshId = -1;
    this.anarchyBarrelMatId = -1;
    this.anarchyOctaCrateMeshId = -1;
    this.anarchyOctaCrateMatId = -1;
    this.anarchyConeMeshId = -1;
    this.anarchyConeMatId = -1;
    this.anarchyBinMeshId = -1;
    this.anarchyBinMatId = -1;
    this.loadedGeometryPrims = [];
    this.sharedAtlasImages = [];
    this.sharedAtlasMatRefs = [];
    this.userLockedClip = false;
    this.buildingFloorEntities = [];
    this.buildingBannerEntityIds = [-1, -1];
    this.groundSlabEntityId = -1;
    this.playerEntityIds = [];
    this.npcEntityIds = [];
    this.citizenAgents = [];
    this.policeOfficers = [];
    this.policeCarAgents = [];
    this.cctvNodes = [];
    this.citizenHasSkinning = false;
    this.citizenWalkClipName = null;
    this.citizenPhoneClipName = null;
    this.citizenJointCount = 0;
    this.citizenSimTime = 0;
    this.policeAlertActive = false;
    this.policeAlertTimer = 0;
    this.policeWantedLevel = 0;
    this.policeDispatchCount = 0;
    this.policeCallerInfo = '';
    this.policeNearestDistMeters = 0;
    this.policeEtaSeconds = 0;
    this.policeLightbarTimer = 0;
    this.bigCrimeActive = false;
    this.policeSirenWarningActive = false;
    this.policeSirenCountdown = 0;
    this.isJailed = false;
    this.jailTimeLeft = 0;
    this.jailLocationName = '';
    this.jailReason = '';
    this.hasWeapon = false;
    this.weaponAmmo = 0;
    this.gunShopNearby = false;
    this.activePatrolCount = 2;
    this.pistolEntityId = -1;
    this.billboardScreenEntityIds = [];
    this.sirenAudioCooldown = 0;
    this.cityEntityIds = [];
    this.vehicles = [];
    this.playerController.activeVehicleIndex = -1;
    this.playerController.nearbyVehicleIndex = -1;
    this.npcHitTimer = 0;

    const device = this.deviceManager.getDevice();

    // Pre-configure Day-Night cycle lighting BEFORE initial upload/render
    this.renderer.updateDayNightCycle(0);

    // Whole city around the 10-story business buildings: streets, houses, gas stations, police station, gun shop, prison & billboards
    {
      this.physics.setupDefaultBuildingPhysics();

      const buildingData = ProceduralModels.createSingleBuildingWithStairsAndElevator();
      const cityData = CityBuilder.buildWholeCity();
      this.gunShopCounterPos = [...cityData.gunShopCounterPos];
      this.policeJailCellPos = [...cityData.policeJailCellPos];
      this.maxPrisonCellPos = [...cityData.maxPrisonCellPos];
      this.physics.addCityColliders(cityData.colliders);

      // Lightweight legal free online city vehicles (kept alongside all existing procedural sedans!)
      const autoOnlineCarDefs: {
        entryId: string;
        id: string;
        position: [number, number, number];
        rotationY: number;
      }[] = [
        { entryId: 'kenney-truck-red', id: 'online_kenney_red_pickup', position: [14.5, 0.06, 30.2], rotationY: -Math.PI * 0.5 },
        { entryId: 'babylon-vintage-coupe', id: 'online_babylon_coupe', position: [-24.0, 0.06, 37.8], rotationY: Math.PI * 0.5 },
        { entryId: 'kenney-truck-yellow', id: 'online_kenney_yellow_truck', position: [2.0, 0.06, 44.5], rotationY: -Math.PI * 0.5 },
        { entryId: 'khr-cesium-milk-truck', id: 'online_cesium_milk_truck', position: [36.0, 0.06, 30.2], rotationY: Math.PI * 0.5 },
      ];

      interface LoadedOnlineCarSpec {
        id: string;
        name: string;
        position: [number, number, number];
        rotationY: number;
        primitives: ParsedGLBPrimitive[];
        localToGlobalTex: Map<number, number>;
      }

      const fetchAndParseOnlineCar = async (
        spec: (typeof autoOnlineCarDefs)[number]
      ): Promise<{ spec: (typeof autoOnlineCarDefs)[number]; entry: Free3DAssetEntry; parsed: GLBParseResult } | null> => {
        const entry = FREE_3D_ASSETS_CATALOG.find((a) => a.id === spec.entryId);
        if (!entry) return null;
        const buf = await this.tryFetchGLBWithTimeout(entry.glbUrl, 4000);
        if (!buf) return null;
        try {
          const parsed = GLBLoader.parse(buf, {
            normalizeToHeight: entry.targetHeightMeters,
            bakeRotateY: entry.bakeRotateY,
          });
          if (parsed.primitives.length === 0) return null;
          await GLBLoader.resolveExternalTextures(parsed, entry.glbUrl);
          let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const prim of parsed.primitives) {
            for (let v = 0; v < prim.positions.length; v += 3) {
              const vx = prim.positions[v], vy = prim.positions[v + 1], vz = prim.positions[v + 2];
              if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
              if (vy < minY) minY = vy;
              if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
            }
          }
          const cx = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
          const offY = Number.isFinite(minY) ? minY : 0;
          const cz = Number.isFinite(minZ) ? (minZ + maxZ) * 0.5 : 0;
          const cleanPrims: ParsedGLBPrimitive[] = parsed.primitives.map((prim) => {
            const pArr = new Float32Array(prim.positions.length);
            for (let v = 0; v < prim.positions.length; v += 3) {
              pArr[v] = prim.positions[v] - cx;
              pArr[v + 1] = prim.positions[v + 1] - offY;
              pArr[v + 2] = prim.positions[v + 2] - cz;
            }
            return { ...prim, positions: pArr, joints: undefined, weights: undefined };
          });
          return { spec, entry, parsed: { ...parsed, primitives: cleanPrims } };
        } catch {
          return null;
        }
      };

      const [resolvedPlayer, resolvedNpc, fetchedOnlineCarsRaw, remyCitizenRig, bbNormalBytes, bbWantedBytes] = await Promise.all([
        this.resolveAnarchyPlayer(),
        this.resolveOfficeWorkerNPC(),
        Promise.all(autoOnlineCarDefs.map(fetchAndParseOnlineCar)),
        this.resolveRemyCitizenRig(),
        this.createBillboardCanvasTexture(false),
        this.createBillboardCanvasTexture(true),
      ]);

      this.isCustomPlayerRig = resolvedPlayer.isCustomRig;
      this.activePlayerSourceLabel = resolvedPlayer.sourceLabel;
      this.activeNpcSourceLabel = resolvedNpc.sourceLabel;

      // Guarantee first 2 atlas tiles are reserved for Downtown Billboards (Normal + WANTED Poster)
      let bbNormalGlobalIdx = -1;
      let bbWantedGlobalIdx = -1;
      if (bbNormalBytes) {
        bbNormalGlobalIdx = this.sharedAtlasImages.length;
        this.sharedAtlasImages.push({ index: bbNormalGlobalIdx, bytes: bbNormalBytes, mimeType: 'image/png' });
      }
      if (bbWantedBytes) {
        bbWantedGlobalIdx = this.sharedAtlasImages.length;
        this.sharedAtlasImages.push({ index: bbWantedGlobalIdx, bytes: bbWantedBytes, mimeType: 'image/png' });
      }

      const playerLocalToGlobalTex = this.registerTexturesInSharedAtlas(
        resolvedPlayer.textures,
        resolvedPlayer.primitives
      );
      const npcLocalToGlobalTex = this.registerTexturesInSharedAtlas(
        resolvedNpc.textures,
        resolvedNpc.primitives
      );
      const citizenLocalToGlobalTex = this.registerTexturesInSharedAtlas(
        remyCitizenRig.textures,
        remyCitizenRig.primitives
      );

      const loadedOnlineCars: LoadedOnlineCarSpec[] = [];
      for (const item of fetchedOnlineCarsRaw) {
        if (!item) continue;
        const texMap = this.registerTexturesInSharedAtlas(item.parsed.textures, item.parsed.primitives);
        loadedOnlineCars.push({
          id: item.spec.id,
          name: item.entry.name,
          position: item.spec.position,
          rotationY: item.spec.rotationY,
          primitives: item.parsed.primitives,
          localToGlobalTex: texMap,
        });
      }

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

      const groundGridMatId = this.entityManager.registerMaterial({
        baseColor: [0.16, 0.18, 0.17, 1.0], // Urban Ground District Terrain
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.88,
        metallic: 0.05,
        ao: 1.0,
        alphaCutoff: 0.5,
        flags: 4,
      });

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

      const playerPrimMatIds = this.registerTexturedPrimitivesMaterials(
        resolvedPlayer.primitives,
        playerLocalToGlobalTex,
        defaultPlayerMatId
      );

      const defaultNpcMatId = this.entityManager.registerMaterial({
        baseColor: [0.68, 0.24, 0.34, 1.0],
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.52,
        metallic: 0.1,
        ao: 1.0,
        alphaCutoff: 0.5,
        flags: 0,
      });

      const npcPrimMatIds = this.registerTexturedPrimitivesMaterials(
        resolvedNpc.primitives,
        npcLocalToGlobalTex,
        defaultNpcMatId
      );

      // Register 10 scaled/tinted citizen outfit material variants + 1 Navy-Blue Police Uniform reusing Remy's diffuse atlas tile
      const registerTintedRemyMaterials = (tint: [number, number, number]): number[] =>
        remyCitizenRig.primitives.map((prim) => {
          const base = prim.material || {
            baseColor: [0.85, 0.85, 0.88, 1.0] as [number, number, number, number],
            emissiveColor: [0, 0, 0, 0] as [number, number, number, number],
            roughness: 0.56,
            metallic: 0.08,
            ao: 1.0,
            alphaCutoff: 0.5,
          };
          const globalTexIdx =
            prim.textureImageIndex !== undefined && prim.textureImageIndex !== null
              ? citizenLocalToGlobalTex.get(prim.textureImageIndex)
              : undefined;
          const matId = this.entityManager.registerMaterial({
            ...base,
            baseColor: [
              base.baseColor[0] * tint[0],
              base.baseColor[1] * tint[1],
              base.baseColor[2] * tint[2],
              base.baseColor[3],
            ],
            flags: globalTexIdx !== undefined ? 2 : 0,
          });
          if (globalTexIdx !== undefined) {
            this.sharedAtlasMatRefs.push({ matId, globalTexIdx });
          }
          return matId;
        });

      const citizenOutfitTints: [number, number, number][] = [
        [0.96, 0.38, 0.38], // Crimson Jacket
        [0.32, 0.86, 0.80], // Teal Casual
        [0.98, 0.76, 0.28], // Amber Sweater
        [0.68, 0.46, 0.96], // Violet Hoodie
        [0.36, 0.86, 0.50], // Emerald Coat
        [0.36, 0.58, 0.98], // Cobalt Denim
        [0.98, 0.54, 0.42], // Coral Shirt
        [0.96, 0.94, 0.88], // Ivory Cream
        [0.42, 0.46, 0.52], // Charcoal Street
        [0.90, 0.70, 0.26], // Mustard Gold
      ];
      const citizenOutfitMatLists: number[][] = citizenOutfitTints.map(registerTintedRemyMaterials);
      const policeOutfitMatList: number[] = registerTintedRemyMaterials([0.16, 0.30, 0.68]);

      const onlineCarMatLists = loadedOnlineCars.map((car) =>
        this.registerTexturedPrimitivesMaterials(
          car.primitives,
          car.localToGlobalTex,
          concreteMatId
        )
      );

      this.billboardNormalMatId = this.entityManager.registerMaterial({
        baseColor: bbNormalGlobalIdx >= 0 ? [1.0, 1.0, 1.0, 1.0] : [0.12, 0.24, 0.44, 1.0],
        emissiveColor: bbNormalGlobalIdx >= 0 ? [0.18, 0.24, 0.30, 0.45] : [0.05, 0.14, 0.25, 0.5],
        roughness: 0.45,
        metallic: 0.05,
        ao: 1.0,
        alphaCutoff: 0.0,
        flags: bbNormalGlobalIdx >= 0 ? 2 : 0,
      });
      if (bbNormalGlobalIdx >= 0) {
        this.sharedAtlasMatRefs.push({ matId: this.billboardNormalMatId, globalTexIdx: bbNormalGlobalIdx });
      }

      this.billboardWantedMatId = this.entityManager.registerMaterial({
        baseColor: bbWantedGlobalIdx >= 0 ? [1.0, 1.0, 1.0, 1.0] : [0.88, 0.14, 0.14, 1.0],
        emissiveColor: bbWantedGlobalIdx >= 0 ? [0.42, 0.14, 0.12, 0.65] : [0.65, 0.08, 0.08, 0.9],
        roughness: 0.38,
        metallic: 0.05,
        ao: 1.0,
        alphaCutoff: 0.0,
        flags: bbWantedGlobalIdx >= 0 ? 2 : 0,
      });
      if (bbWantedGlobalIdx >= 0) {
        this.sharedAtlasMatRefs.push({ matId: this.billboardWantedMatId, globalTexIdx: bbWantedGlobalIdx });
      }

      // Build shared GPU diffuse atlas combining Billboards + Player + NPC + Remy Crowd + Online Cars textures
      await this.rebuildSharedDiffuseAtlas();

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

      // Generate Moveable Physics Primitives & Mid-Level Convex Props
      const cratePrim = ProceduralModels.createPhysicsCrate(0.9);
      const barrelPrim = ProceduralModels.createPhysicsBarrel(0.38, 1.05, 12);
      const octaCratePrim = ProceduralModels.createConvexOctaCrate(0.9);
      const conePrim = ProceduralModels.createConvexHazardCone(0.34, 0.88);
      const binPrim = ProceduralModels.createConvexOfficeBin(0.30, 0.72);

      const regPropMat = (prim: ParsedGLBPrimitive) =>
        this.entityManager.registerMaterial(
          prim.material ?? {
            baseColor: [0.76, 0.48, 0.20, 1.0],
            emissiveColor: [0.04, 0.02, 0.0, 0.15],
            roughness: 0.55,
            metallic: 0.2,
            ao: 1.0,
            alphaCutoff: 0.5,
          }
        );

      const crateMatId = regPropMat(cratePrim);
      const barrelMatId = regPropMat(barrelPrim);
      const octaCrateMatId = regPropMat(octaCratePrim);
      const coneMatId = regPropMat(conePrim);
      const binMatId = regPropMat(binPrim);
      this.anarchyCrateMatId = crateMatId;
      this.anarchyBarrelMatId = barrelMatId;
      this.anarchyOctaCrateMatId = octaCrateMatId;
      this.anarchyConeMatId = coneMatId;
      this.anarchyBinMatId = binMatId;

      // Register Player Skeleton & Clips (starts at joint index 0)
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

      // Register Isolated NPC Skeleton & Clips (starts at npcJointOffset)
      this.npcJointOffset = this.animController.joints.length;
      this.npcHasSkinning = resolvedNpc.hasSkinning && resolvedNpc.joints.length > 0;
      if (this.npcHasSkinning) {
        this.npcAnimController.registerSkeleton(resolvedNpc.joints);
        for (const clip of resolvedNpc.clips) {
          this.npcAnimController.addClip(clip);
        }
        this.entityManager.totalJointsCount = this.npcJointOffset + this.npcAnimController.joints.length;
        this.npcAnimController.writeBindPoseTo(this.entityManager.jointMatrices, this.npcJointOffset);

        const clips = resolvedNpc.clips;
        const explicitHit = clips.find((c) => /punch|hit|react|slap|impact|hurt/i.test(c.name))?.name || null;
        const explicitIdle = clips.find((c) => /sit|idle|desk|breath/i.test(c.name))?.name || null;

        if (explicitHit) {
          this.npcHitClipName = explicitHit;
          this.npcIdleClipName = explicitIdle;
        } else if (clips.length === 1) {
          // Single-clip Mixamo sitting-punched export (e.g. "mixamo.com"): frame 0 is calm sitting, full clip is recoil
          this.npcHitClipName = clips[0].name;
          this.npcIdleClipName = null;
        } else {
          this.npcIdleClipName = explicitIdle || clips[0]?.name || null;
          this.npcHitClipName = clips.find((c) => c.name !== this.npcIdleClipName)?.name || clips[0]?.name || null;
        }
        const hitClipObj = clips.find((c) => c.name === this.npcHitClipName);
        this.npcHitDuration = hitClipObj?.duration && hitClipObj.duration > 0.1 ? hitClipObj.duration : 0.9;
      } else {
        this.npcIdleClipName = null;
        this.npcHitClipName = null;
      }

      // Register 5 Shared Remy Crowd + Police Skeleton Tracks (starts at citizenJointOffset, well within 2048 joints)
      this.citizenJointOffset = this.npcJointOffset + this.npcAnimController.joints.length;
      if (remyCitizenRig.hasSkinning && remyCitizenRig.joints.length > 0) {
        this.citizenHasSkinning = true;
        this.citizenJointCount = remyCitizenRig.joints.length;
        this.citizenAnimController.registerSkeleton(remyCitizenRig.joints);
        for (const clip of remyCitizenRig.clips) {
          this.citizenAnimController.addClip(clip);
        }
        const totalNeeded = this.citizenJointOffset + this.citizenTrackCount * this.citizenJointCount;
        this.entityManager.totalJointsCount = Math.min(this.entityManager.maxJoints, totalNeeded);
        for (let t = 0; t < this.citizenTrackCount; t++) {
          const trackOff = this.citizenJointOffset + t * this.citizenJointCount;
          if (trackOff + this.citizenJointCount <= this.entityManager.maxJoints) {
            this.citizenAnimController.writeBindPoseTo(this.entityManager.jointMatrices, trackOff);
          }
        }
        this.citizenWalkClipName =
          remyCitizenRig.clips.find((c) => /walk|run|move/i.test(c.name))?.name ||
          remyCitizenRig.clips[0]?.name ||
          null;
        this.citizenPhoneClipName =
          remyCitizenRig.clips.find((c) => /phone|call/i.test(c.name))?.name ||
          this.citizenWalkClipName;
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

      const npcMeshIds: number[] = resolvedNpc.primitives.map((p, pIdx) =>
        queueMesh(
          p,
          p.name || `Worker_Woman_Part_${pIdx}`,
          p.boundingRadius || 1.8,
          this.npcHasSkinning || !!(p.joints && p.joints.length > 0)
        )
      );

      const floorLabelMeshIds: number[] = floorLabelMeshes.map((prim, k) =>
        queueMesh(prim, `3D_Text_Floor_${k}`, 5.0)
      );

      const crateMeshId = queueMesh(cratePrim, 'Moveable_Physics_Crate', cratePrim.boundingRadius || 0.9);
      this.anarchyCrateMeshId = crateMeshId;
      const barrelMeshId = queueMesh(barrelPrim, 'Moveable_Physics_Barrel', barrelPrim.boundingRadius || 0.7);
      this.anarchyBarrelMeshId = barrelMeshId;
      const octaCrateMeshId = queueMesh(octaCratePrim, 'Moveable_Convex_OctaCrate', octaCratePrim.boundingRadius || 0.9);
      this.anarchyOctaCrateMeshId = octaCrateMeshId;
      const coneMeshId = queueMesh(conePrim, 'Moveable_Convex_HazardCone', conePrim.boundingRadius || 0.7);
      this.anarchyConeMeshId = coneMeshId;
      const binMeshId = queueMesh(binPrim, 'Moveable_Convex_OfficeBin', binPrim.boundingRadius || 0.6);
      this.anarchyBinMeshId = binMeshId;

      const cityMatMap = new Map<string, number>();
      for (const mDef of cityData.materials) {
        cityMatMap.set(mDef.key, this.entityManager.registerMaterial(mDef.material));
      }
      const cityMeshMap = new Map<string, number>();
      for (const meshDef of cityData.meshes) {
        cityMeshMap.set(
          meshDef.key,
          queueMesh(meshDef.prim, `City_${meshDef.key}`, meshDef.boundingRadius)
        );
      }

      const citizenMeshIds: number[] = remyCitizenRig.primitives.map((p, pIdx) =>
        queueMesh(p, p.name || `Remy_Citizen_Part_${pIdx}`, 1.9, true)
      );

      const onlineCarMeshIdLists: number[][] = loadedOnlineCars.map((car) =>
        car.primitives.map((p, pIdx) =>
          queueMesh(p, `${car.id}_Part_${pIdx}`, 3.5, false)
        )
      );

      this.loadedGeometryPrims = pendingMeshes.map((m) => m.prim);
      this.uploadGeometries(this.loadedGeometryPrims);

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
        materialId: groundGridMatId,
        worldMatrix: groundMat,
        sphereCenter: [0, 0, 0, 5000.0],
        flags: 1,
        name: 'Massive_Ground_Slab',
      });

      // Spawn Whole City Entities (streets, sidewalks, streetlamps, mid-rises, small houses, living houses, gas stations)
      const cityRotMat = Mat4.create();
      for (const pl of cityData.placements) {
        const meshId = cityMeshMap.get(pl.meshKey);
        if (meshId === undefined) continue;
        const matId = pl.materialKey ? (cityMatMap.get(pl.materialKey) ?? concreteMatId) : concreteMatId;
        const halfAngle = pl.rotationY * 0.5;
        Mat4.fromTranslationRotationScale(
          pl.position,
          [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
          pl.scale ?? [1, 1, 1],
          cityRotMat
        );
        const cEntId = this.entityManager.addEntity({
          meshId,
          materialId: matId,
          worldMatrix: cityRotMat,
          sphereCenter: [pl.position[0], pl.position[1], pl.position[2], pl.sphereRadius],
          flags: 1,
          name: pl.name,
        });
        if (cEntId >= 0) {
          this.cityEntityIds.push(cEntId);
        }
      }

      // Spawn Driveable Cars with multi-part meshes & live vehicle colliders
      const carPartDefs: { meshKey: string; matKey?: string; suffix: string }[] = [
        { meshKey: 'car_body', suffix: 'Body' },
        { meshKey: 'car_glass', matKey: 'car_glass_tint', suffix: 'Glass' },
        { meshKey: 'car_tires', matKey: 'car_rubber_tire', suffix: 'Tires' },
        { meshKey: 'car_rims', matKey: 'car_chrome_alloy', suffix: 'Rims' },
        { meshKey: 'car_headlights', matKey: 'car_headlight', suffix: 'Headlights' },
        { meshKey: 'car_taillights', matKey: 'car_taillight', suffix: 'Taillights' },
      ];
      for (const carSpec of cityData.cars) {
        const halfAngle = carSpec.rotationY * 0.5;
        Mat4.fromTranslationRotationScale(
          carSpec.position,
          [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
          [1, 1, 1],
          cityRotMat
        );
        const entIds: number[] = [];
        for (const part of carPartDefs) {
          const meshId = cityMeshMap.get(part.meshKey);
          if (meshId === undefined) continue;
          const matId = cityMatMap.get(part.matKey ?? carSpec.paintMat) ?? concreteMatId;
          const entId = this.entityManager.addEntity({
            meshId,
            materialId: matId,
            worldMatrix: cityRotMat,
            sphereCenter: [carSpec.position[0], carSpec.position[1], carSpec.position[2], 3.2],
            flags: 1,
            name: `${carSpec.name}_${part.suffix}`,
          });
          if (entId >= 0) {
            entIds.push(entId);
            this.cityEntityIds.push(entId);
          }
        }
        const colliderId = `veh_col_${carSpec.id}`;
        this.physics.addBoxCollider({
          id: colliderId,
          name: carSpec.name,
          center: [carSpec.position[0], carSpec.position[1] + 0.65, carSpec.position[2]],
          size: [2.22, 0.65, 1.02],
          category: 'floor',
        });
        this.physics.updateVehicleCollider(
          colliderId,
          carSpec.position[0],
          carSpec.position[1],
          carSpec.position[2],
          carSpec.rotationY
        );
        const vehicle: DriveableVehicle = {
          id: carSpec.id,
          name: carSpec.name,
          position: [...carSpec.position],
          rotationY: carSpec.rotationY,
          speed: 0,
          velX: 0,
          velZ: 0,
          angularVelY: 0,
          tiltX: 0,
          tiltZ: 0,
          steerAngle: 0,
          health: 100,
          maxHealth: 100,
          impactCooldown: 0,
          entityIds: entIds,
          colliderId,
        };
        this.vehicles.push(vehicle);
        this.physics.registerVehicle(vehicle);
      }

      // Spawn 15 Police Interceptor Patrol Cars (driveable, collidable, patrol lanes & chase/block criminals!)
      const policePartDefs: { meshKey: string; matKey: string; suffix: string; isRed?: boolean; isBlue?: boolean }[] = [
        { meshKey: 'car_body', matKey: 'police_black', suffix: 'Body' },
        { meshKey: 'police_doors_roof', matKey: 'police_white', suffix: 'WhiteTrim' },
        { meshKey: 'car_glass', matKey: 'car_glass_tint', suffix: 'Glass' },
        { meshKey: 'car_tires', matKey: 'car_rubber_tire', suffix: 'Tires' },
        { meshKey: 'car_rims', matKey: 'car_chrome_alloy', suffix: 'Rims' },
        { meshKey: 'car_headlights', matKey: 'car_headlight', suffix: 'Headlights' },
        { meshKey: 'car_taillights', matKey: 'car_taillight', suffix: 'Taillights' },
        { meshKey: 'police_bar_red', matKey: 'police_light_red', suffix: 'LightbarRed', isRed: true },
        { meshKey: 'police_bar_blue', matKey: 'police_light_blue', suffix: 'LightbarBlue', isBlue: true },
      ];
      for (let pIdx = 0; pIdx < cityData.policeCars.length; pIdx++) {
        const carSpec = cityData.policeCars[pIdx];
        const halfAngle = carSpec.rotationY * 0.5;
        Mat4.fromTranslationRotationScale(
          carSpec.position,
          [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
          [1, 1, 1],
          cityRotMat
        );
        const entIds: number[] = [];
        let barRedEntityId = -1;
        let barBlueEntityId = -1;
        for (const part of policePartDefs) {
          const meshId = cityMeshMap.get(part.meshKey);
          if (meshId === undefined) continue;
          const matId = cityMatMap.get(part.matKey) ?? concreteMatId;
          const entId = this.entityManager.addEntity({
            meshId,
            materialId: matId,
            worldMatrix: cityRotMat,
            sphereCenter: [carSpec.position[0], carSpec.position[1], carSpec.position[2], 3.2],
            flags: 1,
            name: `${carSpec.name}_${part.suffix}`,
          });
          if (entId >= 0) {
            entIds.push(entId);
            this.cityEntityIds.push(entId);
            if (part.isRed) barRedEntityId = entId;
            if (part.isBlue) barBlueEntityId = entId;
          }
        }
        const colliderId = `veh_col_${carSpec.id}`;
        this.physics.addBoxCollider({
          id: colliderId,
          name: carSpec.name,
          center: [carSpec.position[0], carSpec.position[1] + 0.65, carSpec.position[2]],
          size: [2.22, 0.65, 1.02],
          category: 'floor',
        });
        this.physics.updateVehicleCollider(
          colliderId,
          carSpec.position[0],
          carSpec.position[1],
          carSpec.position[2],
          carSpec.rotationY
        );
        const vehicleIndex = this.vehicles.length;
        const vehicle: DriveableVehicle = {
          id: carSpec.id,
          name: carSpec.name,
          position: [...carSpec.position],
          rotationY: carSpec.rotationY,
          speed: 0,
          velX: 0,
          velZ: 0,
          angularVelY: 0,
          tiltX: 0,
          tiltZ: 0,
          steerAngle: 0,
          health: 100,
          maxHealth: 100,
          impactCooldown: 0,
          entityIds: entIds,
          colliderId,
        };
        this.vehicles.push(vehicle);
        this.physics.registerVehicle(vehicle);

        const isXPatrol = Math.abs(Math.sin(carSpec.rotationY)) > 0.7;
        const laneCoord = isXPatrol ? carSpec.position[2] : carSpec.position[0];
        this.policeCarAgents.push({
          vehicle,
          vehicleIndex,
          barRedEntityId,
          barBlueEntityId,
          patrolAxis: isXPatrol ? 'x' : 'z',
          laneCoord,
          patrolDir: isXPatrol
            ? Math.sin(carSpec.rotationY) >= 0 ? 1 : -1
            : Math.cos(carSpec.rotationY) >= 0 ? 1 : -1,
          minCoord: isXPatrol ? -145 : -95,
          maxCoord: isXPatrol ? 210 : 165,
          patrolSpeed: 9.0 + (pIdx % 4) * 1.1,
          pursuitSpeed: 18.0 + (pIdx % 3) * 1.6,
          evadeTimer: 0,
          evadeSign: (pIdx % 2 === 0 ? 1 : -1),
          ramCooldown: 0,
          dispatched: false,
          sector: carSpec.sector ?? 'SOUTH',
          alwaysPatrol: !!carSpec.alwaysPatrol,
          homeX: carSpec.position[0],
          homeY: carSpec.position[1],
          homeZ: carSpec.position[2],
          homeRotY: carSpec.rotationY,
          blockedTimer: 0,
        });
      }

      // Spawn Lockable Holding Cell Gate (Police Station) & Max Prison Gate
      const policeGateMeshId = cityMeshMap.get('police_jail_gate');
      const prisonBarsMatId = cityMatMap.get('prison_bars') ?? metalTrimMatId;
      if (policeGateMeshId !== undefined) {
        Mat4.fromTranslation([-11, 0, 82], cityRotMat);
        const pgEntId = this.entityManager.addEntity({
          meshId: policeGateMeshId,
          materialId: prisonBarsMatId,
          worldMatrix: cityRotMat,
          sphereCenter: [-18, 1.8, 79.8, 3.5],
          flags: 1,
          name: 'City0_PoliceStation_JailGate_Mesh',
        });
        if (pgEntId >= 0) this.cityEntityIds.push(pgEntId);
      }

      // Spawn Downtown Billboards (dynamic material switches to WANTED poster on Big Crime!)
      const bbScreenMeshId = cityMeshMap.get('billboard_screen');
      if (bbScreenMeshId !== undefined) {
        for (let i = 0; i < cityData.billboards.length; i++) {
          const bb = cityData.billboards[i];
          const halfAngle = bb.rotationY * 0.5;
          Mat4.fromTranslationRotationScale(
            bb.position,
            [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
            [1, 1, 1],
            cityRotMat
          );
          const scrEntId = this.entityManager.addEntity({
            meshId: bbScreenMeshId,
            materialId: this.billboardNormalMatId,
            worldMatrix: cityRotMat,
            sphereCenter: [bb.position[0], bb.position[1] + 6.2, bb.position[2], 6.5],
            flags: 1,
            name: `${bb.name}_Screen`,
          });
          if (scrEntId >= 0) {
            this.billboardScreenEntityIds.push(scrEntId);
            this.cityEntityIds.push(scrEntId);
          }
        }
      }

      // Spawn Equippable Player Pistol (initially hidden until picked up at Downtown Gun Shop)
      const pistolMeshId = cityMeshMap.get('weapon_pistol');
      const gunMetalMatId = cityMatMap.get('gun_metal') ?? metalTrimMatId;
      if (pistolMeshId !== undefined) {
        Mat4.fromTranslation([0, 1.1, 25.0], this.scratchPistolMat);
        this.pistolEntityId = this.entityManager.addEntity({
          meshId: pistolMeshId,
          materialId: gunMetalMatId,
          worldMatrix: this.scratchPistolMat,
          sphereCenter: [0, 1.1, 25.0, 0.8],
          flags: 0,
          name: 'Player_Equipped_Pistol',
        });
      }

      // Spawn City 0 CCTV Surveillance Rotating Camera Heads & Blinking LEDs
      const camHeadMeshId = cityMeshMap.get('cctv_cam_head');
      const camLedMeshId = cityMeshMap.get('cctv_cam_led');
      const camHeadMatId = cityMatMap.get('cctv_body') ?? concreteMatId;
      const camLedMatId = cityMatMap.get('cctv_led') ?? btnDownMatId;
      if (camHeadMeshId !== undefined && camLedMeshId !== undefined) {
        for (let i = 0; i < cityData.cctvCameras.length; i++) {
          const cam = cityData.cctvCameras[i];
          const halfAngle = cam.baseRotY * 0.5;
          Mat4.fromTranslationRotationScale(
            cam.pos,
            [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
            [1, 1, 1],
            cityRotMat
          );
          const headEntityId = this.entityManager.addEntity({
            meshId: camHeadMeshId,
            materialId: camHeadMatId,
            worldMatrix: cityRotMat,
            sphereCenter: [cam.pos[0], cam.pos[1], cam.pos[2], 1.5],
            flags: 1,
            name: `${cam.name}_Head`,
          });
          const ledEntityId = this.entityManager.addEntity({
            meshId: camLedMeshId,
            materialId: camLedMatId,
            worldMatrix: cityRotMat,
            sphereCenter: [cam.pos[0], cam.pos[1], cam.pos[2], 1.5],
            flags: 1,
            name: `${cam.name}_LED`,
          });
          if (headEntityId >= 0) this.cityEntityIds.push(headEntityId);
          if (ledEntityId >= 0) this.cityEntityIds.push(ledEntityId);
          this.cctvNodes.push({
            id: cam.id,
            name: cam.name,
            x: cam.pos[0],
            y: cam.pos[1],
            z: cam.pos[2],
            baseRotY: cam.baseRotY,
            headEntityId,
            ledEntityId,
            phase: i * 0.65,
            alertCooldown: 0,
          });
        }
      }

      // Spawn Free Online Legal GLB Vehicles alongside old procedural sedans (both kept!)
      for (let cIdx = 0; cIdx < loadedOnlineCars.length; cIdx++) {
        const carSpec = loadedOnlineCars[cIdx];
        const meshIds = onlineCarMeshIdLists[cIdx];
        const matIds = onlineCarMatLists[cIdx];
        const halfAngle = carSpec.rotationY * 0.5;
        Mat4.fromTranslationRotationScale(
          carSpec.position,
          [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
          [1, 1, 1],
          cityRotMat
        );
        const entIds: number[] = [];
        for (let pIdx = 0; pIdx < meshIds.length; pIdx++) {
          const entId = this.entityManager.addEntity({
            meshId: meshIds[pIdx],
            materialId: matIds[pIdx] ?? concreteMatId,
            worldMatrix: cityRotMat,
            sphereCenter: [carSpec.position[0], carSpec.position[1], carSpec.position[2], 3.5],
            flags: 1,
            name: `${carSpec.name}_Part_${pIdx}`,
          });
          if (entId >= 0) {
            entIds.push(entId);
            this.cityEntityIds.push(entId);
          }
        }
        const colliderId = `veh_col_${carSpec.id}`;
        this.physics.addBoxCollider({
          id: colliderId,
          name: carSpec.name,
          center: [carSpec.position[0], carSpec.position[1] + 0.65, carSpec.position[2]],
          size: [2.22, 0.65, 1.02],
          category: 'floor',
        });
        this.physics.updateVehicleCollider(
          colliderId,
          carSpec.position[0],
          carSpec.position[1],
          carSpec.position[2],
          carSpec.rotationY
        );
        const vehicle: DriveableVehicle = {
          id: carSpec.id,
          name: carSpec.name,
          position: [...carSpec.position],
          rotationY: carSpec.rotationY,
          speed: 0,
          velX: 0,
          velZ: 0,
          angularVelY: 0,
          tiltX: 0,
          tiltZ: 0,
          steerAngle: 0,
          health: 100,
          maxHealth: 100,
          impactCooldown: 0,
          entityIds: entIds,
          colliderId,
        };
        this.vehicles.push(vehicle);
        this.physics.registerVehicle(vehicle);
      }

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
          const worldFloorCenter: [number, number, number, number] = [
            off[0],
            fl.floor * 4.0 + 2.0,
            off[2],
            30.0,
          ];

          if (fl.buildingMeshId >= 0) {
            list.push(
              this.entityManager.addEntity({
                meshId: fl.buildingMeshId,
                materialId: concreteMatId,
                worldMatrix: mat,
                sphereCenter: worldFloorCenter,
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
                sphereCenter: worldFloorCenter,
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
                sphereCenter: worldFloorCenter,
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
                sphereCenter: worldFloorCenter,
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
                sphereCenter: worldFloorCenter,
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
                sphereCenter: worldFloorCenter,
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
          sphereCenter: [off[0], 4.4, off[2] + 20.25, 10.0],
          flags: 1,
          name: `${nameSuffix}_Banner`,
        });

        // Main building floor call buttons (0..9) & 3D Text Floor Labels (0..10)
        if (buildingIndex === 0) {
          for (let k = 0; k < 10; k++) {
            const btnMat = Mat4.create();
            const btnY = k * 4.0 + 1.6;
            Mat4.fromTranslation([11.32, btnY, 9.0], btnMat);
            const btnId = this.entityManager.addEntity({
              meshId: floorButtonMeshId,
              materialId: btnDownMatId,
              worldMatrix: btnMat,
              sphereCenter: [11.32, btnY, 9.0, 0.5],
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
              sphereCenter: [labelPos[0], labelPos[1], labelPos[2], 6.0],
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

      // Sitting Office Worker NPC (worker-woman-1.glb or fallback) sitting on Floor 0 Lobby Desk facing +Z entrance
      const npcMat = Mat4.create();
      Mat4.fromTranslation(this.npcBasePos, npcMat);
      const npcIds: number[] = [];
      for (let pIdx = 0; pIdx < npcMeshIds.length; pIdx++) {
        const entId = this.entityManager.addEntity({
          meshId: npcMeshIds[pIdx],
          materialId: npcPrimMatIds[pIdx] ?? defaultNpcMatId,
          worldMatrix: npcMat,
          sphereCenter: [this.npcBasePos[0], this.npcBasePos[1] + 0.7, this.npcBasePos[2], 1.8],
          flags: 1,
          animOffset: this.npcJointOffset,
          name: pIdx === 0 ? 'Worker_Woman_Desk_NPC' : `Worker_Woman_Part_${pIdx}`,
        });
        npcIds.push(entId);
      }
      this.npcEntityIds = npcIds;

      // Attach NPC entities to Floor 0 of Main Building (buildingIndex 0) so Smart Floor Culling hides them cleanly above Floor 1
      const mainFloor0Entry = this.buildingFloorEntities.find((e) => e.buildingIndex === 0 && e.floor === 0);
      if (mainFloor0Entry) {
        mainFloor0Entry.entityIds.push(...npcIds);
      }

      // Register Desk Woman collider + punch target in JoltPhysics (seated on Floor 0 Front Reception Desk)
      this.physics.addBoxCollider({
        id: 'worker_woman_desk_collider',
        name: 'Worker Woman (Desk NPC)',
        center: [this.npcBasePos[0], this.npcBasePos[1] + 0.55, this.npcBasePos[2]],
        size: [0.45, 0.55, 0.45],
        category: 'wall',
      });
      this.physics.registerNPCPunchTarget({
        id: 'office_worker_woman',
        name: 'Office Worker (Desk)',
        position: [...this.npcBasePos],
        radius: 0.90,
        height: 1.45,
      });

      // Spawn 24 Scaled & Differently Colored Remy Street Citizens + Mobile Phones + 6 Navy Police Officers
      if (citizenMeshIds.length > 0 && this.citizenHasSkinning) {
        const phoneMeshId = cityMeshMap.get('citizen_mobile_phone') ?? -1;
        const phoneMatId = cityMatMap.get('phone_screen') ?? btnUpMatId;
        const phoneTrackOffset = this.citizenJointOffset + 3 * this.citizenJointCount;
        const policeTrackOffset = this.citizenJointOffset + 4 * this.citizenJointCount;

        const citizenRoutes: {
          name: string;
          axis: 'x' | 'z';
          fixedCoord: number;
          min: number;
          max: number;
          start: number;
          dir: 1 | -1;
          scaleXZ: number;
          scaleY: number;
          speed: number;
        }[] = [
          { name: 'Citizen_MainBlvd_N1', axis: 'x', fixedCoord: 26.2, min: -22, max: 22, start: 8, dir: 1, scaleXZ: 1.00, scaleY: 1.02, speed: 1.45 },
          { name: 'Citizen_MainBlvd_N2', axis: 'x', fixedCoord: 26.5, min: 38, max: 86, start: 54, dir: -1, scaleXZ: 0.94, scaleY: 0.92, speed: 1.35 },
          { name: 'Citizen_MainBlvd_S1', axis: 'x', fixedCoord: 41.8, min: -24, max: 22, start: -8, dir: -1, scaleXZ: 1.06, scaleY: 1.08, speed: 1.50 },
          { name: 'Citizen_MainBlvd_S2', axis: 'x', fixedCoord: 41.5, min: 38, max: 86, start: 64, dir: 1, scaleXZ: 0.90, scaleY: 0.95, speed: 1.38 },
          { name: 'Citizen_MainBlvd_W1', axis: 'x', fixedCoord: 26.3, min: -88, max: -40, start: -62, dir: 1, scaleXZ: 1.08, scaleY: 1.12, speed: 1.55 },
          { name: 'Citizen_MainBlvd_W2', axis: 'x', fixedCoord: 41.9, min: -88, max: -40, start: -52, dir: -1, scaleXZ: 0.92, scaleY: 0.90, speed: 1.32 },
          { name: 'Citizen_MainBlvd_E1', axis: 'x', fixedCoord: 26.4, min: 104, max: 152, start: 122, dir: 1, scaleXZ: 1.02, scaleY: 1.05, speed: 1.42 },
          { name: 'Citizen_MainBlvd_E2', axis: 'x', fixedCoord: 41.7, min: 104, max: 152, start: 138, dir: -1, scaleXZ: 0.89, scaleY: 0.91, speed: 1.28 },
          { name: 'Citizen_CivicSt_1', axis: 'z', fixedCoord: -25.4, min: -24, max: 24, start: 4, dir: 1, scaleXZ: 1.04, scaleY: 1.10, speed: 1.48 },
          { name: 'Citizen_CivicSt_2', axis: 'z', fixedCoord: -38.6, min: 44, max: 94, start: 70, dir: -1, scaleXZ: 0.95, scaleY: 0.94, speed: 1.36 },
          { name: 'Citizen_CommerceSt_1', axis: 'z', fixedCoord: 23.4, min: -24, max: 24, start: -10, dir: 1, scaleXZ: 0.91, scaleY: 0.93, speed: 1.40 },
          { name: 'Citizen_CommerceSt_2', axis: 'z', fixedCoord: 36.6, min: 44, max: 94, start: 58, dir: 1, scaleXZ: 1.10, scaleY: 1.14, speed: 1.58 },
          { name: 'Citizen_SouthBlvd_C1', axis: 'x', fixedCoord: 96.2, min: -24, max: 22, start: -4, dir: 1, scaleXZ: 0.98, scaleY: 1.00, speed: 1.44 },
          { name: 'Citizen_SouthBlvd_E1', axis: 'x', fixedCoord: 96.2, min: 38, max: 86, start: 56, dir: -1, scaleXZ: 0.88, scaleY: 0.89, speed: 1.30 },
          { name: 'Citizen_SouthBlvd_W1', axis: 'x', fixedCoord: 96.2, min: -88, max: -40, start: -68, dir: 1, scaleXZ: 1.05, scaleY: 1.06, speed: 1.46 },
          { name: 'Citizen_NorthAve_C1', axis: 'x', fixedCoord: -26.2, min: -22, max: 22, start: -12, dir: 1, scaleXZ: 0.96, scaleY: 0.97, speed: 1.38 },
          { name: 'Citizen_NorthAve_E1', axis: 'x', fixedCoord: -26.2, min: 38, max: 86, start: 68, dir: -1, scaleXZ: 1.03, scaleY: 1.04, speed: 1.42 },
          { name: 'Citizen_NorthAve_W1', axis: 'x', fixedCoord: -41.8, min: -88, max: -40, start: -58, dir: -1, scaleXZ: 0.93, scaleY: 0.96, speed: 1.34 },
          { name: 'Citizen_MarketSt_1', axis: 'z', fixedCoord: 89.4, min: -24, max: 24, start: 12, dir: -1, scaleXZ: 1.01, scaleY: 1.03, speed: 1.45 },
          { name: 'Citizen_MarketSt_2', axis: 'z', fixedCoord: 102.6, min: 44, max: 94, start: 78, dir: 1, scaleXZ: 0.90, scaleY: 0.88, speed: 1.31 },
          { name: 'Citizen_PlazaFront_1', axis: 'x', fixedCoord: 22.8, min: -16, max: 16, start: -10, dir: 1, scaleXZ: 0.97, scaleY: 1.01, speed: 1.40 },
          { name: 'Citizen_PlazaFront_2', axis: 'x', fixedCoord: 24.0, min: -18, max: 18, start: 11, dir: -1, scaleXZ: 1.07, scaleY: 1.09, speed: 1.52 },
          { name: 'Citizen_HarborBlvd_1', axis: 'x', fixedCoord: 41.8, min: 168, max: 214, start: 184, dir: 1, scaleXZ: 0.94, scaleY: 0.98, speed: 1.39 },
          { name: 'Citizen_FarWest_1', axis: 'x', fixedCoord: 26.2, min: -150, max: -104, start: -124, dir: -1, scaleXZ: 1.02, scaleY: 1.04, speed: 1.47 },
        ];

        const spawnMat = Mat4.create();
        for (let i = 0; i < citizenRoutes.length; i++) {
          const r = citizenRoutes[i];
          const cx = r.axis === 'x' ? r.start : r.fixedCoord;
          const cz = r.axis === 'z' ? r.start : r.fixedCoord;
          const rotY = r.axis === 'x' ? (r.dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) : (r.dir > 0 ? 0 : Math.PI);
          const halfY = rotY * 0.5;
          const walkTrackIdx = i % 3;
          const walkTrackOffset = this.citizenJointOffset + walkTrackIdx * this.citizenJointCount;
          const matList = citizenOutfitMatLists[i % citizenOutfitMatLists.length];

          Mat4.fromTRSValues(cx, 0, cz, 0, Math.sin(halfY), 0, Math.cos(halfY), r.scaleXZ, r.scaleY, r.scaleXZ, spawnMat);
          const entIds: number[] = [];
          for (let pIdx = 0; pIdx < citizenMeshIds.length; pIdx++) {
            const entId = this.entityManager.addEntity({
              meshId: citizenMeshIds[pIdx],
              materialId: matList[pIdx] ?? matList[0] ?? defaultNpcMatId,
              worldMatrix: spawnMat,
              sphereCenter: [cx, 0.9 * r.scaleY, cz, 1.9],
              flags: 1,
              animOffset: walkTrackOffset,
              name: pIdx === 0 ? r.name : `${r.name}_Part_${pIdx}`,
            });
            if (entId >= 0) {
              entIds.push(entId);
              this.cityEntityIds.push(entId);
            }
          }

          let phoneEntityId = -1;
          if (phoneMeshId >= 0) {
            Mat4.fromTranslation([cx + 0.25, 0.9 * r.scaleY, cz], this.scratchPhoneMat);
            phoneEntityId = this.entityManager.addEntity({
              meshId: phoneMeshId,
              materialId: phoneMatId,
              worldMatrix: this.scratchPhoneMat,
              sphereCenter: [cx, 1.0, cz, 0.8],
              flags: 1,
              name: `${r.name}_Phone`,
            });
            if (phoneEntityId >= 0) {
              this.cityEntityIds.push(phoneEntityId);
            }
          }

          const citId = `street_citizen_${i}`;
          const target: import('./physics/JoltPhysics').NPCPunchTarget = {
            id: citId,
            name: r.name,
            position: [cx, 0, cz],
            radius: 0.72 * r.scaleXZ,
            height: 1.75 * r.scaleY,
          };
          this.physics.registerNPCPunchTarget(target);
          this.citizenAgents.push({
            id: citId,
            name: r.name,
            entityIds: entIds,
            phoneEntityId,
            x: cx,
            z: cz,
            rotY,
            scaleXZ: r.scaleXZ,
            scaleY: r.scaleY,
            walkSpeed: r.speed,
            axis: r.axis,
            minBound: r.min,
            maxBound: r.max,
            dir: r.dir,
            walkTrackOffset,
            phoneTrackOffset,
            stumbleTimer: 0,
            phoneCallTimer: 0,
            usingPhoneTrack: false,
            punchTarget: target,
          });
        }

        // 7 Uniformed Police Officers (walk speed = Player walkSpeedForward = 8.5 m/s; FIRST punch = JAILED!)
        const officerSpawns: { name: string; x: number; z: number; axis: 'x' | 'z'; range: number }[] = [
          { name: 'Officer_Precinct_FrontL', x: -15.5, z: 92.0, axis: 'x', range: 6.0 },
          { name: 'Officer_Precinct_FrontR', x: -6.5, z: 92.0, axis: 'x', range: 6.0 },
          { name: 'Officer_MainBlvd_Civic', x: -25.0, z: 30.0, axis: 'z', range: 9.0 },
          { name: 'Officer_MainBlvd_Plaza', x: 18.0, z: 27.5, axis: 'x', range: 10.0 },
          { name: 'Officer_GasStation1_Beat', x: -20.5, z: 62.0, axis: 'z', range: 8.0 },
          { name: 'Officer_SouthBlvd_Beat', x: 12.0, z: 96.5, axis: 'x', range: 12.0 },
          { name: 'Officer_MaxPrison_Gate', x: -32.0, z: -203.0, axis: 'x', range: 7.5 },
        ];
        for (let i = 0; i < officerSpawns.length; i++) {
          const os = officerSpawns[i];
          const rotY = os.axis === 'x' ? Math.PI * 0.5 : 0;
          const halfY = rotY * 0.5;
          const sXZ = 1.03;
          const sY = 1.05;
          Mat4.fromTRSValues(os.x, 0, os.z, 0, Math.sin(halfY), 0, Math.cos(halfY), sXZ, sY, sXZ, spawnMat);
          const entIds: number[] = [];
          for (let pIdx = 0; pIdx < citizenMeshIds.length; pIdx++) {
            const entId = this.entityManager.addEntity({
              meshId: citizenMeshIds[pIdx],
              materialId: policeOutfitMatList[pIdx] ?? policeOutfitMatList[0] ?? defaultNpcMatId,
              worldMatrix: spawnMat,
              sphereCenter: [os.x, 0.95, os.z, 1.9],
              flags: 1,
              animOffset: policeTrackOffset,
              name: pIdx === 0 ? os.name : `${os.name}_Part_${pIdx}`,
            });
            if (entId >= 0) {
              entIds.push(entId);
              this.cityEntityIds.push(entId);
            }
          }
          const offId = `police_officer_${i}`;
          const target: import('./physics/JoltPhysics').NPCPunchTarget = {
            id: offId,
            name: os.name,
            position: [os.x, 0, os.z],
            radius: 0.75,
            height: 1.82,
          };
          this.physics.registerNPCPunchTarget(target);
          this.policeOfficers.push({
            id: offId,
            name: os.name,
            entityIds: entIds,
            x: os.x,
            y: 0,
            z: os.z,
            rotY,
            homeX: os.x,
            homeZ: os.z,
            patrolDir: 1,
            patrolAxis: os.axis,
            patrolRange: os.range,
            scaleXZ: sXZ,
            scaleY: sY,
            trackOffset: policeTrackOffset,
            stumbleTimer: 0,
            kickCooldown: 0,
            punchTarget: target,
          });
        }
      }

      // Moveable Punchable Primitives & Mid-Level Convex Props in courtyard & ground lobby
      const propSpawns: {
        kind: 'crate' | 'barrel' | 'octacrate' | 'cone' | 'bin';
        name: string;
        pos: [number, number, number];
        mass: number;
        restitution: number;
      }[] = [
        // Front courtyard flanking walkway (mix of pure box primitives + mid-level convex polyhedra)
        { kind: 'crate', name: 'Courtyard_Crate_01', pos: [-2.4, 0.53, 22.8], mass: 1.0, restitution: 0.35 },
        { kind: 'octacrate', name: 'Courtyard_Convex_OctaCrate_01', pos: [2.4, 0.53, 22.8], mass: 1.05, restitution: 0.38 },
        { kind: 'crate', name: 'Courtyard_Crate_03', pos: [-3.8, 0.53, 22.1], mass: 1.1, restitution: 0.35 },
        { kind: 'octacrate', name: 'Courtyard_Convex_OctaCrate_Stack', pos: [-3.8, 1.44, 22.1], mass: 0.9, restitution: 0.40 },
        { kind: 'cone', name: 'Courtyard_Convex_SafetyCone_01', pos: [-1.5, 0.44, 21.5], mass: 0.55, restitution: 0.45 },
        { kind: 'cone', name: 'Courtyard_Convex_SafetyCone_02', pos: [1.5, 0.44, 21.5], mass: 0.55, restitution: 0.45 },
        { kind: 'barrel', name: 'Courtyard_Barrel_01', pos: [-2.2, 0.525, 24.1], mass: 1.25, restitution: 0.42 },
        { kind: 'barrel', name: 'Courtyard_Barrel_02', pos: [2.3, 0.525, 24.2], mass: 1.25, restitution: 0.42 },
        // Inside ground lobby
        { kind: 'crate', name: 'Lobby_Crate_01', pos: [-6.5, 0.45, 11.2], mass: 1.0, restitution: 0.35 },
        { kind: 'octacrate', name: 'Lobby_Convex_Crate_02', pos: [-5.5, 0.45, 11.2], mass: 1.0, restitution: 0.38 },
        { kind: 'bin', name: 'Lobby_Convex_Bin_01', pos: [-2.3, 0.36, 6.2], mass: 0.65, restitution: 0.42 },
        { kind: 'bin', name: 'Lobby_Convex_Bin_02', pos: [2.3, 0.36, 6.2], mass: 0.65, restitution: 0.42 },
        { kind: 'barrel', name: 'Lobby_Barrel_01', pos: [-4.2, 0.525, 9.6], mass: 1.25, restitution: 0.42 },
        ...cityData.propSpawns,
      ];

      for (let i = 0; i < propSpawns.length; i++) {
        const sp = propSpawns[i];
        const meshId =
          sp.kind === 'crate'
            ? crateMeshId
            : sp.kind === 'barrel'
            ? barrelMeshId
            : sp.kind === 'octacrate'
            ? octaCrateMeshId
            : sp.kind === 'cone'
            ? coneMeshId
            : binMeshId;
        const matId =
          sp.kind === 'crate'
            ? crateMatId
            : sp.kind === 'barrel'
            ? barrelMatId
            : sp.kind === 'octacrate'
            ? octaCrateMatId
            : sp.kind === 'cone'
            ? coneMatId
            : binMatId;
        const halfExt: [number, number, number] =
          sp.kind === 'crate' || sp.kind === 'octacrate'
            ? [0.45, 0.45, 0.45]
            : sp.kind === 'barrel'
            ? [0.38, 0.525, 0.38]
            : sp.kind === 'cone'
            ? [0.34, 0.44, 0.34]
            : [0.30, 0.36, 0.30];
        const shape: 'box' | 'cylinder' | 'convex' =
          sp.kind === 'crate' ? 'box' : sp.kind === 'barrel' ? 'cylinder' : 'convex';

        const propMat = Mat4.create();
        Mat4.fromTranslation(sp.pos, propMat);
        const propEntityId = this.entityManager.addEntity({
          meshId,
          materialId: matId,
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
          shape,
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
   * Zero-allocation per-frame simulation for:
   * - 5 shared Remy skeletal animation tracks (3 walk gaits, 1 911 phone call pose, 1 police officer march)
   * - 24 scaled & outfit-colored street citizens + paired glowing mobile phones
   * - 6 police officers walking at exact Player walkSpeedForward (8.5 m/s) who kick/block criminals
   * - 15 patrolling & intercepting Police Interceptor cars with flashing lightbars & live dynamic ETA
   * - 18 scanning City 0 CCTV surveillance cameras
   */
  private updateCitizensPoliceAndCCTV(deltaSec: number, elapsedSec: number): void {
    const dt = Math.min(deltaSec, 0.05);
    if (this.sirenAudioCooldown > 0) {
      this.sirenAudioCooldown = Math.max(0, this.sirenAudioCooldown - dt);
    }

    if (this.isJailed) {
      this.jailTimeLeft = Math.max(0, this.jailTimeLeft - dt);
      if (this.jailTimeLeft <= 0) {
        this.releaseFromJail();
      }
    }

    const pPos = this.playerController.position;
    const playerX = pPos[0];
    const playerZ = pPos[2];
    const isDriving = this.playerController.activeVehicleIndex >= 0;

    // Update Gun Shop proximity & held pistol transform (zero alloc)
    this.gunShopNearby =
      !this.isJailed &&
      !isDriving &&
      Math.abs(pPos[1] - this.gunShopCounterPos[1]) < 3.0 &&
      Math.hypot(playerX - this.gunShopCounterPos[0], playerZ - this.gunShopCounterPos[2]) <= 4.2;

    if (this.pistolEntityId >= 0) {
      const showPistol = this.hasWeapon && !this.isJailed && !isDriving;
      this.entityManager.setEntityVisible(this.pistolEntityId, showPistol);
      if (showPistol) {
        const yaw = this.playerController.cameraTheta + Math.PI;
        const sinY = Math.sin(yaw);
        const cosY = Math.cos(yaw);
        const halfY = yaw * 0.5;
        const px = playerX - cosY * 0.24 + sinY * 0.34;
        const py = pPos[1] + 1.05;
        const pz = pPos[2] + sinY * 0.24 + cosY * 0.34;
        Mat4.fromTRSValues(px, py, pz, 0, Math.sin(halfY), 0, Math.cos(halfY), 1.4, 1.4, 1.4, this.scratchPistolMat);
        this.entityManager.updateEntityMatrixXYZ(this.pistolEntityId, this.scratchPistolMat, px, py, pz, 0.8);
      }
    }

    // 1. Evaluate 5 shared skeleton tracks into jointMatrices (ZERO heap alloc)
    if (this.citizenHasSkinning && this.citizenJointCount > 0 && this.citizenAnimController.joints.length > 0) {
      const jm = this.entityManager.jointMatrices;
      const walkName = this.citizenWalkClipName;
      const phoneName = this.citizenPhoneClipName;
      const jc = this.citizenJointCount;
      const base = this.citizenJointOffset;
      const simT = this.citizenSimTime;

      if (walkName) {
        this.citizenAnimController.evaluateClipAtTime(walkName, simT, jm, base);
        this.citizenAnimController.evaluateClipAtTime(walkName, simT + 0.45, jm, base + jc);
        this.citizenAnimController.evaluateClipAtTime(walkName, simT * 1.22 + 0.2, jm, base + 2 * jc);
        this.citizenAnimController.evaluateClipAtTime(walkName, simT * 1.45 + 0.1, jm, base + 4 * jc);
      }
      if (phoneName) {
        this.citizenAnimController.evaluateClipAtTime(phoneName, simT, jm, base + 3 * jc);
      }
    }

    // 2. Update 24 Street Citizens + Paired Mobile Phones (zero alloc)
    for (let i = 0; i < this.citizenAgents.length; i++) {
      const c = this.citizenAgents[i];
      if (c.stumbleTimer > 0) {
        c.stumbleTimer = Math.max(0, c.stumbleTimer - dt);
      }
      if (c.phoneCallTimer > 0) {
        c.phoneCallTimer = Math.max(0, c.phoneCallTimer - dt);
      }

      const isCalling = c.phoneCallTimer > 0;
      if (c.stumbleTimer <= 0 && !isCalling) {
        if (c.axis === 'x') {
          c.x += c.dir * c.walkSpeed * dt;
          if (c.x > c.maxBound) { c.x = c.maxBound; c.dir = -1; }
          else if (c.x < c.minBound) { c.x = c.minBound; c.dir = 1; }
          c.rotY = c.dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        } else {
          c.z += c.dir * c.walkSpeed * dt;
          if (c.z > c.maxBound) { c.z = c.maxBound; c.dir = -1; }
          else if (c.z < c.minBound) { c.z = c.minBound; c.dir = 1; }
          c.rotY = c.dir > 0 ? 0 : Math.PI;
        }
      } else if (isCalling && c.stumbleTimer <= 0) {
        // Face generally toward the criminal incident while on 911 call
        c.rotY = Math.atan2(playerX - c.x, playerZ - c.z);
      }

      // Swap GPU animOffset only when transitioning walk <-> phone call
      if (isCalling !== c.usingPhoneTrack) {
        c.usingPhoneTrack = isCalling;
        const targetOffset = isCalling ? c.phoneTrackOffset : c.walkTrackOffset;
        for (let p = 0; p < c.entityIds.length; p++) {
          this.entityManager.setEntityAnimOffset(c.entityIds[p], targetOffset);
        }
      }

      c.punchTarget.position[0] = c.x;
      c.punchTarget.position[2] = c.z;

      const wobbleZ = c.stumbleTimer > 0 ? Math.sin(c.stumbleTimer * 18.0) * 0.16 : 0;
      const yawH = c.rotY * 0.5;
      const wobH = wobbleZ * 0.5;
      const yc = Math.cos(yawH), ys = Math.sin(yawH);
      const wc = Math.cos(wobH), ws = Math.sin(wobH);
      Mat4.fromTRSValues(
        c.x,
        0,
        c.z,
        ws * yc,
        ys * wc,
        ws * ys,
        yc * wc,
        c.scaleXZ,
        c.scaleY,
        c.scaleXZ,
        this.tempCitizenMat
      );
      for (let p = 0; p < c.entityIds.length; p++) {
        this.entityManager.updateEntityMatrixXYZ(c.entityIds[p], this.tempCitizenMat, c.x, 0.9 * c.scaleY, c.z, 1.9);
      }

      // Position Citizen's Handheld Mobile Phone (held to right ear during 911 call, at right side otherwise)
      if (c.phoneEntityId >= 0) {
        const sinR = Math.sin(c.rotY);
        const cosR = Math.cos(c.rotY);
        const localX = (isCalling ? -0.22 : -0.27) * c.scaleXZ;
        const localY = (isCalling ? 1.46 : 0.88) * c.scaleY;
        const localZ = (isCalling ? 0.14 : 0.08) * c.scaleXZ;
        const px = c.x + localX * cosR + localZ * sinR;
        const pz = c.z - localX * sinR + localZ * cosR;
        Mat4.fromTRSValues(px, localY, pz, 0, ys, 0, yc, 1, 1, 1, this.scratchPhoneMat);
        this.entityManager.updateEntityMatrixXYZ(c.phoneEntityId, this.scratchPhoneMat, px, localY, pz, 0.6);
      }
    }

    // 3. Decay Police Alert Timer if criminal has evaded
    if (this.policeAlertActive) {
      this.policeAlertTimer = Math.max(0, this.policeAlertTimer - dt);
      if (this.policeAlertTimer <= 0) {
        this.policeAlertActive = false;
        this.bigCrimeActive = false;
        this.policeWantedLevel = 0;
        this.policeDispatchCount = 0;
        this.policeNearestDistMeters = 0;
        this.policeEtaSeconds = 0;
        this.policeCallerInfo = '';
        this.setBillboardWantedMode(false);
        for (let i = 0; i < this.policeCarAgents.length; i++) {
          const pa = this.policeCarAgents[i];
          pa.dispatched = false;
          pa.blockedTimer = 0;
          if (!pa.alwaysPatrol && pa.vehicle.health > 0 && pa.vehicleIndex !== this.playerController.activeVehicleIndex) {
            pa.vehicle.position[0] = pa.homeX;
            pa.vehicle.position[1] = pa.homeY;
            pa.vehicle.position[2] = pa.homeZ;
            pa.vehicle.rotationY = pa.homeRotY;
            pa.vehicle.speed = 0;
            this.physics.updateVehicleCollider(pa.vehicle.colliderId, pa.homeX, pa.homeY, pa.homeZ, pa.homeRotY);
            const hy = pa.homeRotY * 0.5;
            Mat4.fromTRSValues(pa.homeX, pa.homeY, pa.homeZ, 0, Math.sin(hy), 0, Math.cos(hy), 1, 1, 1, this.tempPropMat);
            for (let eIdx = 0; eIdx < pa.vehicle.entityIds.length; eIdx++) {
              this.entityManager.updateEntityMatrixXYZ(pa.vehicle.entityIds[eIdx], this.tempPropMat, pa.homeX, pa.homeY, pa.homeZ, 3.2);
            }
          }
        }
      }
    }

    // 4. Update Police Officers On Foot (FIRST PUNCH / STRIKE FROM POLICE = IMMEDIATELY JAILED!)
    const officerSpeed = this.playerController.walkSpeedForward;
    for (let i = 0; i < this.policeOfficers.length; i++) {
      const off = this.policeOfficers[i];
      if (off.stumbleTimer > 0) off.stumbleTimer = Math.max(0, off.stumbleTimer - dt);
      if (off.kickCooldown > 0) off.kickCooldown = Math.max(0, off.kickCooldown - dt);

      if (off.stumbleTimer <= 0) {
        if (this.policeAlertActive && !this.isJailed) {
          const dx = playerX - off.x;
          const dz = playerZ - off.z;
          const dist = Math.hypot(dx, dz);
          off.rotY = Math.atan2(dx, dz);

          if (dist > 1.25 && dist < 140.0) {
            const step = officerSpeed * dt;
            this.scratchAgentPos[0] = off.x;
            this.scratchAgentPos[1] = off.y;
            this.scratchAgentPos[2] = off.z;
            this.scratchAgentDisp[0] = (dx / dist) * step;
            this.scratchAgentDisp[1] = 0;
            this.scratchAgentDisp[2] = (dz / dist) * step;
            const res = this.physics.updateCharacterPhysics(this.scratchAgentPos, this.scratchAgentDisp, 0.4, 1.8);
            off.x = res.newPos[0];
            off.y = Math.max(0, res.newPos[1]);
            off.z = res.newPos[2];
          }

          // First strike / catch from a Police Officer jails the criminal immediately!
          if (!isDriving && dist <= 1.85) {
            off.kickCooldown = 2.0;
            this.arrestPlayer(`${off.name} First Strike Takedown`, this.bigCrimeActive);
          }
        } else {
          // Gentle precinct / downtown foot patrol around home post
          const calmSpeed = 1.45;
          if (off.patrolAxis === 'x') {
            off.x += off.patrolDir * calmSpeed * dt;
            if (off.x > off.homeX + off.patrolRange) { off.x = off.homeX + off.patrolRange; off.patrolDir = -1; }
            else if (off.x < off.homeX - off.patrolRange) { off.x = off.homeX - off.patrolRange; off.patrolDir = 1; }
            off.rotY = off.patrolDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
          } else {
            off.z += off.patrolDir * calmSpeed * dt;
            if (off.z > off.homeZ + off.patrolRange) { off.z = off.homeZ + off.patrolRange; off.patrolDir = -1; }
            else if (off.z < off.homeZ - off.patrolRange) { off.z = off.homeZ - off.patrolRange; off.patrolDir = 1; }
            off.rotY = off.patrolDir > 0 ? 0 : Math.PI;
          }
        }
      }

      off.punchTarget.position[0] = off.x;
      off.punchTarget.position[1] = off.y;
      off.punchTarget.position[2] = off.z;
      const halfY = off.rotY * 0.5;
      Mat4.fromTRSValues(
        off.x,
        off.y,
        off.z,
        0,
        Math.sin(halfY),
        0,
        Math.cos(halfY),
        off.scaleXZ,
        off.scaleY,
        off.scaleXZ,
        this.tempCitizenMat
      );
      for (let p = 0; p < off.entityIds.length; p++) {
        this.entityManager.updateEntityMatrixXYZ(off.entityIds[p], this.tempCitizenMat, off.x, off.y + 0.95, off.z, 1.9);
      }
    }

    // 5. Update 15 Police Cruisers (Only 2 Patrol N+S Normally; 13 Stay Parked Unless Big Crime; Blocking Car = Siren -> Arrest!)
    this.policeLightbarTimer += dt;
    const redOn = Math.floor(this.policeLightbarTimer * 8.0) % 2 === 0;
    const activeVeh = this.playerController.activeVehicleIndex;
    let liveNearestDist = Infinity;
    let liveBestSpeed = 19.0;
    let anyBlocked = false;
    let minBlockedRemaining = 3.5;
    let activePatrolCounter = 0;

    for (let i = 0; i < this.policeCarAgents.length; i++) {
      const pa = this.policeCarAgents[i];
      const car = pa.vehicle;
      if (pa.ramCooldown > 0) pa.ramCooldown = Math.max(0, pa.ramCooldown - dt);

      const isActiveDuty = pa.alwaysPatrol || (this.policeAlertActive && pa.dispatched);
      const isBlockingPlayer = pa.blockedTimer > 0.01;
      const strobeActive = (isBlockingPlayer || (this.policeAlertActive && pa.dispatched)) && car.health > 0;
      if (pa.barRedEntityId >= 0) {
        this.entityManager.setEntityVisible(pa.barRedEntityId, strobeActive ? redOn : true);
      }
      if (pa.barBlueEntityId >= 0) {
        this.entityManager.setEntityVisible(pa.barBlueEntityId, strobeActive ? !redOn : true);
      }

      if (pa.vehicleIndex === activeVeh || car.health <= 0) {
        pa.blockedTimer = 0;
        continue;
      }

      if (isActiveDuty) {
        activePatrolCounter++;
      }

      if (pa.dispatched && this.policeAlertActive) {
        const dToCriminal = Math.hypot(car.position[0] - playerX, car.position[2] - playerZ);
        if (dToCriminal < liveNearestDist) {
          liveNearestDist = dToCriminal;
          liveBestSpeed = pa.pursuitSpeed;
        }
      }

      // Check if player is standing right in front of a moving/patrolling police cruiser
      let blockedNow = false;
      if (isActiveDuty && !isDriving && !this.isJailed) {
        const dxP = playerX - car.position[0];
        const dzP = playerZ - car.position[2];
        const sinR = Math.sin(car.rotationY);
        const cosR = Math.cos(car.rotationY);
        const ahead = dxP * sinR + dzP * cosR;
        const side = dxP * cosR - dzP * sinR;
        if (ahead > 1.0 && ahead < 6.8 && Math.abs(side) < 2.15 && Math.abs(car.position[1] - pPos[1]) < 2.2) {
          blockedNow = true;
        }
      }

      let moveVx = 0;
      let moveVz = 0;
      let targetSpeed = 0;

      if (blockedNow) {
        // Sound siren and give player 3.5s warning countdown to step out of cruiser's path before arrest
        pa.blockedTimer += dt;
        anyBlocked = true;
        const rem = Math.max(0, 3.5 - pa.blockedTimer);
        if (rem < minBlockedRemaining) minBlockedRemaining = rem;
        this.playPoliceSirenBeep();
        targetSpeed = 0;
        if (pa.blockedTimer >= 3.5) {
          this.arrestPlayer('Blocked Police Cruiser Path', false);
          break;
        }
      } else {
        pa.blockedTimer = Math.max(0, pa.blockedTimer - dt * 1.5);

        if (!isActiveDuty) {
          // 13 Reserve Cruisers remain parked stationary at Police Station / Substations / Max Prison
          targetSpeed = 0;
        } else if (pa.evadeTimer > 0) {
          pa.evadeTimer = Math.max(0, pa.evadeTimer - dt);
          car.rotationY += pa.evadeSign * 1.9 * dt;
          targetSpeed = -7.5;
          moveVx = Math.sin(car.rotationY) * targetSpeed;
          moveVz = Math.cos(car.rotationY) * targetSpeed;
        } else if (this.policeAlertActive && pa.dispatched) {
          const dx = playerX - car.position[0];
          const dz = playerZ - car.position[2];
          const dist = Math.hypot(dx, dz);

          if (dist > 3.2) {
            const desiredYaw = Math.atan2(dx, dz);
            let yawDiff = desiredYaw - car.rotationY;
            while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            const maxTurn = 2.6 * dt;
            car.rotationY += Math.max(-maxTurn, Math.min(maxTurn, yawDiff));
            targetSpeed = dist > 18.0 ? pa.pursuitSpeed : Math.min(pa.pursuitSpeed, 11.0 + dist * 0.45);
            moveVx = Math.sin(car.rotationY) * targetSpeed;
            moveVz = Math.cos(car.rotationY) * targetSpeed;
          } else {
            targetSpeed = 0;
          }

          // Kick / arrest if pursuing car closes onto criminal on foot
          if (!isDriving && !this.isJailed && dist <= 2.35 && pa.ramCooldown <= 0 && this.playerController.knockbackCooldown <= 0) {
            this.playerController.applyPoliceKnockback(dx, dz, 14.0);
            pa.ramCooldown = 1.45;
          }
        } else if (pa.alwaysPatrol) {
          // ONLY 2 Patrols during calm: Patrol #01 strictly in NORTH sector (Z=-34), Patrol #02 strictly in SOUTH sector (Z=37)
          if (pa.patrolAxis === 'x') {
            car.position[2] += (pa.laneCoord - car.position[2]) * Math.min(1.0, dt * 2.0);
            if (car.position[0] > pa.maxCoord) pa.patrolDir = -1;
            else if (car.position[0] < pa.minCoord) pa.patrolDir = 1;
            car.rotationY = pa.patrolDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
            targetSpeed = pa.patrolSpeed;
            moveVx = pa.patrolDir * targetSpeed;
          } else {
            car.position[0] += (pa.laneCoord - car.position[0]) * Math.min(1.0, dt * 2.0);
            if (car.position[2] > pa.maxCoord) pa.patrolDir = -1;
            else if (car.position[2] < pa.minCoord) pa.patrolDir = 1;
            car.rotationY = pa.patrolDir > 0 ? 0 : Math.PI;
            targetSpeed = pa.patrolSpeed;
            moveVz = pa.patrolDir * targetSpeed;
          }
        }
      }

      car.speed = targetSpeed;
      const dispX = moveVx * dt;
      const dispZ = moveVz * dt;
      if (Math.abs(dispX) > 1e-5 || Math.abs(dispZ) > 1e-5) {
        const res = this.physics.resolveVehicleMovement(
          car.position[0],
          car.position[1],
          car.position[2],
          dispX,
          dispZ,
          car.rotationY,
          car.colliderId,
          targetSpeed,
          car
        );
        car.position[0] = Math.max(-245, Math.min(260, res.x));
        car.position[1] = car.position[1] + (res.y - car.position[1]) * Math.min(1.0, dt * 16.0);
        car.position[2] = Math.max(-265, Math.min(220, res.z));
        if (res.collided) {
          if (this.policeAlertActive && pa.dispatched) {
            const dPlayer = Math.hypot(car.position[0] - playerX, car.position[2] - playerZ);
            if (dPlayer > 5.2) {
              pa.evadeTimer = 0.75;
            }
          } else {
            pa.patrolDir = (pa.patrolDir === 1 ? -1 : 1) as 1 | -1;
          }
        }
        this.physics.updateVehicleCollider(car.colliderId, car.position[0], car.position[1], car.position[2], car.rotationY);

        const cx = Math.cos(car.tiltX * 0.5), sx = Math.sin(car.tiltX * 0.5);
        const cy = Math.cos(car.rotationY * 0.5), sy = Math.sin(car.rotationY * 0.5);
        const cz = Math.cos(car.tiltZ * 0.5), sz = Math.sin(car.tiltZ * 0.5);
        const qw = cy * cx * cz + sy * sx * sz;
        const qx = cy * sx * cz + sy * cx * sz;
        const qy = sy * cx * cz - cy * sx * sz;
        const qz = cy * cx * sz - sy * sx * cz;
        Mat4.fromTRSValues(car.position[0], car.position[1], car.position[2], qx, qy, qz, qw, 1, 1, 1, this.tempPropMat);
        const cEnts = car.entityIds;
        for (let eIdx = 0; eIdx < cEnts.length; eIdx++) {
          this.entityManager.updateEntityMatrixXYZ(cEnts[eIdx], this.tempPropMat, car.position[0], car.position[1], car.position[2], 3.2);
        }
      }
    }

    this.activePatrolCount = activePatrolCounter;
    this.policeSirenWarningActive = anyBlocked && !this.isJailed;
    this.policeSirenCountdown = anyBlocked ? Math.round(minBlockedRemaining * 10) * 0.1 : 0;

    if (this.policeAlertActive && Number.isFinite(liveNearestDist)) {
      this.policeNearestDistMeters = Math.round(liveNearestDist);
      this.policeEtaSeconds = Math.round((liveNearestDist / Math.max(8.5, liveBestSpeed)) * 10) * 0.1;
    }

    // 6. Update 18 City 0 CCTV Video Cameras (Smooth sweep + recording LED pulse, zero alloc)
    const ledBlinkOn = Math.floor(elapsedSec * 2.2) % 2 === 0;
    for (let i = 0; i < this.cctvNodes.length; i++) {
      const cam = this.cctvNodes[i];
      if (cam.alertCooldown > 0) cam.alertCooldown = Math.max(0, cam.alertCooldown - dt);
      const yaw = cam.baseRotY + Math.sin(elapsedSec * 0.75 + cam.phase) * 0.52;
      const halfY = yaw * 0.5;
      Mat4.fromTRSValues(cam.x, cam.y, cam.z, 0, Math.sin(halfY), 0, Math.cos(halfY), 1, 1, 1, this.scratchCctvMat);
      if (cam.headEntityId >= 0) {
        this.entityManager.updateEntityMatrixXYZ(cam.headEntityId, this.scratchCctvMat, cam.x, cam.y, cam.z, 1.5);
      }
      if (cam.ledEntityId >= 0) {
        this.entityManager.updateEntityMatrixXYZ(cam.ledEntityId, this.scratchCctvMat, cam.x, cam.y, cam.z, 1.5);
        this.entityManager.setEntityVisible(cam.ledEntityId, this.policeAlertActive ? redOn : ledBlinkOn);
      }
    }
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
      if (this.playerController.activeVehicleIndex >= 0) {
        this.setPlayerEntitiesVisible(false);
      }
      if (this.pistolEntityId >= 0) {
        this.entityManager.setEntityVisible(
          this.pistolEntityId,
          this.hasWeapon && !this.isJailed && this.playerController.activeVehicleIndex < 0
        );
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

    const pPos = this.playerController.position;
    const px = pPos[0], py = pPos[1], pz = pPos[2];
    let activeBuilding: -1 | 0 | 1 = -1;

    if (this.playerController.activeVehicleIndex < 0 && py >= -0.5 && py < 43.8 && Math.abs(pz) <= 19.6) {
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
      if (this.playerController.activeVehicleIndex >= 0) {
        this.setPlayerEntitiesVisible(false);
      }
      if (this.pistolEntityId >= 0) {
        this.entityManager.setEntityVisible(
          this.pistolEntityId,
          this.hasWeapon && !this.isJailed && this.playerController.activeVehicleIndex < 0
        );
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
    if (this.pistolEntityId >= 0) {
      this.entityManager.setEntityVisible(
        this.pistolEntityId,
        this.hasWeapon && !this.isJailed && this.playerController.activeVehicleIndex < 0
      );
    }

    // Cull exterior city blocks while player is inside a multi-story skyscraper
    for (let i = 0; i < this.cityEntityIds.length; i++) {
      this.entityManager.setEntityVisible(this.cityEntityIds[i], false);
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

    const moveObjs = this.physics.moveableObjects;
    for (let i = 0; i < moveObjs.length; i++) {
      const obj = moveObjs[i];
      if (obj.entityId < 0) continue;
      const op = obj.position;
      const ox = op[0], oy = op[1], oz = op[2];
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
      if (obj.extraEntityIds) {
        const extras = obj.extraEntityIds;
        for (let ex = 0; ex < extras.length; ex++) {
          this.entityManager.setEntityVisible(extras[ex], propVisible);
        }
      }
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

  spawnPhysicsProp(kind: 'crate' | 'barrel' | 'octacrate' | 'cone' | 'bin' = 'crate', customName?: string): number {
    if (this.isDeviceLost) return -1;
    const meshMap: Record<typeof kind, { meshId: number; matId: number; halfExt: [number, number, number]; shape: 'box' | 'cylinder' | 'convex'; mass: number }> = {
      crate: { meshId: this.anarchyCrateMeshId, matId: this.anarchyCrateMatId, halfExt: [0.45, 0.45, 0.45], shape: 'box', mass: 1.0 },
      barrel: { meshId: this.anarchyBarrelMeshId, matId: this.anarchyBarrelMatId, halfExt: [0.38, 0.525, 0.38], shape: 'cylinder', mass: 1.25 },
      octacrate: { meshId: this.anarchyOctaCrateMeshId, matId: this.anarchyOctaCrateMatId, halfExt: [0.45, 0.45, 0.45], shape: 'convex', mass: 1.05 },
      cone: { meshId: this.anarchyConeMeshId, matId: this.anarchyConeMatId, halfExt: [0.34, 0.44, 0.34], shape: 'convex', mass: 0.55 },
      bin: { meshId: this.anarchyBinMeshId, matId: this.anarchyBinMatId, halfExt: [0.30, 0.36, 0.30], shape: 'convex', mass: 0.65 },
    };
    const cfg = meshMap[kind];
    if (!cfg || cfg.meshId < 0 || cfg.matId < 0) return -1;

    const p = this.playerController.position;
    const fwdX = -Math.sin(this.playerController.cameraTheta);
    const fwdZ = -Math.cos(this.playerController.cameraTheta);
    const spawnPos: [number, number, number] = [
      p[0] + fwdX * 2.4,
      p[1] + cfg.halfExt[1] + 0.25,
      p[2] + fwdZ * 2.4,
    ];
    const worldMat = Mat4.create();
    Mat4.fromTranslation(spawnPos, worldMat);
    const idx = this.physics.moveableObjects.length + 1;
    const propName = customName || `Spawned_${kind}_${idx}`;

    const entityId = this.entityManager.addEntity({
      meshId: cfg.meshId,
      materialId: cfg.matId,
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
      halfExtents: cfg.halfExt,
      shape: cfg.shape,
      mass: cfg.mass,
      restitution: 0.38,
    });

    const device = this.deviceManager.getDevice();
    this.entityManager.uploadToGPU(device);
    return entityId;
  }

  spawnProceduralCube(name = 'Moveable_Crate'): number {
    return this.spawnPhysicsProp('crate', name === 'Procedural_Cube' || name === 'Moveable_Crate' ? undefined : name);
  }

  /**
   * Fetches a legal free CC0 / CC-BY online GLB asset, computes its tight primitive AABB collider
   * for mobile-friendly physics, packs any textures into the shared atlas, and spawns it in front of player.
   */
  async spawnExternalGLBProp(
    url: string,
    options: {
      name: string;
      targetHeight?: number;
      physicsShape?: 'box' | 'cylinder' | 'convex';
      mass?: number;
    }
  ): Promise<{ success: boolean; entityId: number; error?: string }> {
    if (this.isDeviceLost) return { success: false, entityId: -1, error: 'WebGPU device is lost.' };
    try {
      const buf = await this.tryFetchGLB(url, true);
      if (!buf) {
        return { success: false, entityId: -1, error: 'Failed to download valid binary .GLB asset.' };
      }

      const parsed = GLBLoader.parse(buf, { normalizeToHeight: options.targetHeight ?? 0.9 });
      if (parsed.primitives.length === 0) {
        return { success: false, entityId: -1, error: 'GLB contained no renderable mesh primitives.' };
      }

      // Compute exact tight bounding box across all primitives for primitive physics collider
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const prim of parsed.primitives) {
        for (let v = 0; v < prim.positions.length; v += 3) {
          const vx = prim.positions[v];
          const vy = prim.positions[v + 1];
          const vz = prim.positions[v + 2];
          if (vx < minX) minX = vx;
          if (vy < minY) minY = vy;
          if (vz < minZ) minZ = vz;
          if (vx > maxX) maxX = vx;
          if (vy > maxY) maxY = vy;
          if (vz > maxZ) maxZ = vz;
        }
      }

      const cx = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
      const cy = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0.45;
      const cz = Number.isFinite(minZ) ? (minZ + maxZ) * 0.5 : 0;
      const hx = Math.max(0.15, Number.isFinite(minX) ? (maxX - minX) * 0.5 : 0.35);
      const hy = Math.max(0.15, Number.isFinite(minY) ? (maxY - minY) * 0.5 : 0.35);
      const hz = Math.max(0.15, Number.isFinite(minZ) ? (maxZ - minZ) * 0.5 : 0.35);

      // Re-center vertices cleanly around [0, 0, 0] so physics rotation spins smoothly around center
      const cleanPrims: ParsedGLBPrimitive[] = parsed.primitives.map((prim) => {
        const centeredPos = new Float32Array(prim.positions.length);
        for (let v = 0; v < prim.positions.length; v += 3) {
          centeredPos[v] = prim.positions[v] - cx;
          centeredPos[v + 1] = prim.positions[v + 1] - cy;
          centeredPos[v + 2] = prim.positions[v + 2] - cz;
        }
        return {
          ...prim,
          positions: centeredPos,
          joints: undefined,
          weights: undefined,
        };
      });

      const localToGlobalTex = this.registerTexturesInSharedAtlas(parsed.textures, cleanPrims);
      const defaultPropMatId = this.entityManager.registerMaterial({
        baseColor: [0.85, 0.85, 0.88, 1.0],
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.5,
        metallic: 0.15,
        ao: 1.0,
        alphaCutoff: 0.5,
      });
      const primMatIds = this.registerTexturedPrimitivesMaterials(cleanPrims, localToGlobalTex, defaultPropMatId);

      // Compute current vertex/index offsets before appending
      let vOffset = 0;
      let iOffset = 0;
      for (const existing of this.loadedGeometryPrims) {
        vOffset += Math.floor(existing.positions.length / 3);
        iOffset += existing.indices.length;
      }

      const newMeshIds: number[] = [];
      for (let i = 0; i < cleanPrims.length; i++) {
        const prim = cleanPrims[i];
        const vCount = Math.floor(prim.positions.length / 3);
        const meshId = this.entityManager.registerMesh({
          name: `${options.name}_Part_${i}`,
          firstIndex: iOffset,
          indexCount: prim.indices.length,
          baseVertex: vOffset,
          vertexCount: vCount,
          boundingRadius: Math.hypot(hx, hy, hz) + 0.25,
          hasSkinning: false,
          hasMorphTargets: false,
          morphTargetCount: 0,
        });
        this.loadedGeometryPrims.push(prim);
        newMeshIds.push(meshId);
        vOffset += vCount;
        iOffset += prim.indices.length;
      }

      this.uploadGeometries(this.loadedGeometryPrims);
      if (parsed.textures.length > 0) {
        await this.rebuildSharedDiffuseAtlas();
      }

      const p = this.playerController.position;
      const fwdX = -Math.sin(this.playerController.cameraTheta);
      const fwdZ = -Math.cos(this.playerController.cameraTheta);
      const spawnPos: [number, number, number] = [
        p[0] + fwdX * 2.5,
        p[1] + hy + 0.25,
        p[2] + fwdZ * 2.5,
      ];
      const worldMat = Mat4.create();
      Mat4.fromTranslation(spawnPos, worldMat);

      let firstEntityId = -1;
      const extraEntityIds: number[] = [];
      for (let i = 0; i < newMeshIds.length; i++) {
        const entId = this.entityManager.addEntity({
          meshId: newMeshIds[i],
          materialId: primMatIds[i] ?? defaultPropMatId,
          worldMatrix: worldMat,
          sphereCenter: [spawnPos[0], spawnPos[1], spawnPos[2], Math.hypot(hx, hy, hz) + 0.3],
          flags: 1,
          animOffset: 0,
          name: newMeshIds.length === 1 ? options.name : `${options.name}_${i}`,
        });
        if (i === 0) firstEntityId = entId;
        else extraEntityIds.push(entId);
      }

      if (firstEntityId >= 0) {
        this.physics.addMoveableObject({
          id: `ext_${Date.now()}_${firstEntityId}`,
          entityId: firstEntityId,
          extraEntityIds: extraEntityIds.length > 0 ? extraEntityIds : undefined,
          name: options.name,
          position: spawnPos,
          halfExtents: [hx, hy, hz],
          shape: options.physicsShape ?? 'convex',
          mass: options.mass ?? 1.0,
          restitution: 0.38,
        });
      }

      const device = this.deviceManager.getDevice();
      this.entityManager.uploadToGPU(device);
      return { success: true, entityId: firstEntityId };
    } catch (err: any) {
      return { success: false, entityId: -1, error: err?.message || String(err) };
    }
  }

  /**
   * Fetches an external verified vehicle GLB, resolves any sibling textures (e.g. Kenney colormap.png),
   * centers it with wheels at Y=0, registers a live DriveableVehicle (100% health), and spawns it ahead of the player.
   */
  async spawnExternalDriveableCar(
    entry: Free3DAssetEntry
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isDeviceLost) return { success: false, error: 'WebGPU device is lost.' };
    try {
      const buf = await this.tryFetchGLB(entry.glbUrl, true);
      if (!buf) {
        return { success: false, error: 'Failed to download valid binary .GLB vehicle.' };
      }

      const parsed = GLBLoader.parse(buf, {
        normalizeToHeight: entry.targetHeightMeters,
        bakeRotateY: entry.bakeRotateY,
      });
      if (parsed.primitives.length === 0) {
        return { success: false, error: 'Vehicle GLB contained no mesh primitives.' };
      }
      await GLBLoader.resolveExternalTextures(parsed, entry.glbUrl);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const prim of parsed.primitives) {
        for (let v = 0; v < prim.positions.length; v += 3) {
          const vx = prim.positions[v], vy = prim.positions[v + 1], vz = prim.positions[v + 2];
          if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
          if (vy < minY) minY = vy;
          if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
        }
      }
      const cx = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
      const offY = Number.isFinite(minY) ? minY : 0;
      const cz = Number.isFinite(minZ) ? (minZ + maxZ) * 0.5 : 0;

      const cleanPrims: ParsedGLBPrimitive[] = parsed.primitives.map((prim) => {
        const pos = new Float32Array(prim.positions.length);
        for (let v = 0; v < prim.positions.length; v += 3) {
          pos[v] = prim.positions[v] - cx;
          pos[v + 1] = prim.positions[v + 1] - offY;
          pos[v + 2] = prim.positions[v + 2] - cz;
        }
        return { ...prim, positions: pos, joints: undefined, weights: undefined };
      });

      const localToGlobalTex = this.registerTexturesInSharedAtlas(parsed.textures, cleanPrims);
      const defaultMatId = this.entityManager.registerMaterial({
        baseColor: [0.85, 0.85, 0.88, 1.0],
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.42,
        metallic: 0.35,
        ao: 1.0,
        alphaCutoff: 0.5,
      });
      const primMatIds = this.registerTexturedPrimitivesMaterials(cleanPrims, localToGlobalTex, defaultMatId);

      let vOffset = 0;
      let iOffset = 0;
      for (const existing of this.loadedGeometryPrims) {
        vOffset += Math.floor(existing.positions.length / 3);
        iOffset += existing.indices.length;
      }

      const newMeshIds: number[] = [];
      for (let i = 0; i < cleanPrims.length; i++) {
        const prim = cleanPrims[i];
        const vCount = Math.floor(prim.positions.length / 3);
        const meshId = this.entityManager.registerMesh({
          name: `${entry.name}_Part_${i}`,
          firstIndex: iOffset,
          indexCount: prim.indices.length,
          baseVertex: vOffset,
          vertexCount: vCount,
          boundingRadius: 3.5,
          hasSkinning: false,
          hasMorphTargets: false,
          morphTargetCount: 0,
        });
        this.loadedGeometryPrims.push(prim);
        newMeshIds.push(meshId);
        vOffset += vCount;
        iOffset += prim.indices.length;
      }

      this.uploadGeometries(this.loadedGeometryPrims);
      if (parsed.textures.length > 0) {
        await this.rebuildSharedDiffuseAtlas();
      }

      const p = this.playerController.position;
      const fwdX = -Math.sin(this.playerController.cameraTheta);
      const fwdZ = -Math.cos(this.playerController.cameraTheta);
      const spawnPos: [number, number, number] = [p[0] + fwdX * 4.4, 0.06, p[2] + fwdZ * 4.4];
      const spawnRotY = this.playerController.cameraTheta + Math.PI * 0.5;
      const halfAngle = spawnRotY * 0.5;
      const worldMat = Mat4.create();
      Mat4.fromTranslationRotationScale(
        spawnPos,
        [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)],
        [1, 1, 1],
        worldMat
      );

      const entIds: number[] = [];
      for (let i = 0; i < newMeshIds.length; i++) {
        const entId = this.entityManager.addEntity({
          meshId: newMeshIds[i],
          materialId: primMatIds[i] ?? defaultMatId,
          worldMatrix: worldMat,
          sphereCenter: [spawnPos[0], spawnPos[1], spawnPos[2], 3.5],
          flags: 1,
          animOffset: 0,
          name: `${entry.name}_${i}`,
        });
        if (entId >= 0) {
          entIds.push(entId);
          this.cityEntityIds.push(entId);
        }
      }

      const vehId = `ext_car_${Date.now()}_${this.vehicles.length}`;
      const colliderId = `veh_col_${vehId}`;
      this.physics.addBoxCollider({
        id: colliderId,
        name: entry.name,
        center: [spawnPos[0], spawnPos[1] + 0.65, spawnPos[2]],
        size: [2.22, 0.65, 1.02],
        category: 'floor',
      });
      this.physics.updateVehicleCollider(colliderId, spawnPos[0], spawnPos[1], spawnPos[2], spawnRotY);

      const vehicle: DriveableVehicle = {
        id: vehId,
        name: entry.name,
        position: [...spawnPos],
        rotationY: spawnRotY,
        speed: 0,
        velX: 0,
        velZ: 0,
        angularVelY: 0,
        tiltX: 0,
        tiltZ: 0,
        steerAngle: 0,
        health: 100,
        maxHealth: 100,
        impactCooldown: 0,
        entityIds: entIds,
        colliderId,
      };
      this.vehicles.push(vehicle);
      this.physics.registerVehicle(vehicle);

      const device = this.deviceManager.getDevice();
      this.entityManager.uploadToGPU(device);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Fetches a verified online ordinary human character GLB and swaps it in as the playable character.
   */
  async loadPlayerFromUrl(
    url: string,
    fileName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isDeviceLost) return { success: false, error: 'WebGPU device is lost.' };
    try {
      const buf = await this.tryFetchGLB(url, true);
      if (!buf) {
        return { success: false, error: 'Failed to download valid binary .GLB character.' };
      }
      await this.loadPlayerGLB(buf, fileName);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
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
