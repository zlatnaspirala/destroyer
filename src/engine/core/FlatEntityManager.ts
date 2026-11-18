/**
 * Destroyer Engine - Flat Data-Oriented Entity Manager
 * Stores all scene entities in contiguous TypedArrays for maximum cache-locality
 * and direct WebGPU storage buffer streaming.
 */

import { Mat4 } from '../math/Mat4';
import {
  DRAW_INDEXED_INDIRECT_STRIDE_BYTES,
  DRAW_INDEXED_INDIRECT_STRIDE_U32,
  EntityRecord,
  FlatMaterial,
  MeshMetadata,
  LightRecord,
} from './Types';

export interface AddEntityParams {
  meshId: number;
  materialId?: number;
  worldMatrix: Float32Array;
  sphereCenter: [number, number, number, number];
  flags?: number;
  animOffset?: number;
  name?: string;
}

export class FlatEntityManager {
  public readonly maxEntities: number;
  public readonly maxMaterials: number;
  public readonly maxJoints: number;

  public activeEntityCount = 0;
  public nextEntityId = 0;
  public nextLightId = 0;

  // Active Light Records
  public lightRecords: LightRecord[] = [];

  // Contiguous Flat Buffers
  public static readonly ENTITY_STRIDE_FLOATS = 24;

  public readonly entityBufferRaw: ArrayBuffer;
  public readonly entityFloatView: Float32Array;
  public readonly entityUintView: Uint32Array;

  // Separate transforms for fast CPU-side updates
  public readonly positions: Float32Array;
  public readonly rotations: Float32Array;
  public readonly scales: Float32Array;

  // Flat Materials Buffer (16 floats per material = 64 bytes)
  public readonly materialBufferRaw: ArrayBuffer;
  public readonly materialFloatView: Float32Array;
  public readonly materialUintView: Uint32Array;
  public static readonly MATERIAL_STRIDE_FLOATS = 16;
  public materialCount = 0;

  // Indirect Draw Commands & Mesh Registry
  public indirectCommandsData: Uint32Array;
  public meshRegistry: MeshMetadata[] = [];

  // Skinned Joint Matrices
  public readonly jointMatrices: Float32Array;
  public totalJointsCount = 0;

  // Entity records list for inspection
  public entityRecords: (EntityRecord & { name?: string })[] = [];

  // WebGPU GPUBuffer References
  private gpuEntityBuffer: GPUBuffer | null = null;
  private gpuMaterialBuffer: GPUBuffer | null = null;
  private gpuVisibleIndicesBuffer: GPUBuffer | null = null;
  private gpuIndirectArgsBuffer: GPUBuffer | null = null;
  private gpuJointMatricesBuffer: GPUBuffer | null = null;

  // Cached visible indices and mesh instance counts to eliminate per-frame allocations
  private meshCountsCache = new Uint32Array(256);
  private meshFirstInstanceCache = new Uint32Array(256);
  private meshWriteCursorCache = new Uint32Array(256);
  private meshIsFloorCache = new Uint8Array(256);
  private survivorsCache: Uint32Array;
  private survivorMeshCache: Uint16Array;
  private indicesCache: Uint32Array;

  public lastCulledVisibleCount = 0;
  public lastCulledShadowCasterCount = 0;
  private cachedTotalVertices = 0;
  private cachedTotalTriangles = 0;

  constructor(maxEntities = 50000, maxMaterials = 256, maxJoints = 2048) {
    this.maxEntities = maxEntities;
    this.maxMaterials = maxMaterials;
    this.maxJoints = maxJoints;

    this.survivorsCache = new Uint32Array(maxEntities);
    this.survivorMeshCache = new Uint16Array(maxEntities);
    this.indicesCache = new Uint32Array(Math.max(maxEntities, 65536));

    this.entityBufferRaw = new ArrayBuffer(maxEntities * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4);
    this.entityFloatView = new Float32Array(this.entityBufferRaw);
    this.entityUintView = new Uint32Array(this.entityBufferRaw);

    this.positions = new Float32Array(maxEntities * 3);
    this.rotations = new Float32Array(maxEntities * 4);
    this.scales = new Float32Array(maxEntities * 3);

    this.materialBufferRaw = new ArrayBuffer(maxMaterials * FlatEntityManager.MATERIAL_STRIDE_FLOATS * 4);
    this.materialFloatView = new Float32Array(this.materialBufferRaw);
    this.materialUintView = new Uint32Array(this.materialBufferRaw);

    this.indirectCommandsData = new Uint32Array(256 * DRAW_INDEXED_INDIRECT_STRIDE_U32);
    this.jointMatrices = new Float32Array(maxJoints * 16);

    // Initialize joint matrices to identity
    for (let i = 0; i < maxJoints; i++) {
      this.jointMatrices[i * 16 + 0] = 1;
      this.jointMatrices[i * 16 + 5] = 1;
      this.jointMatrices[i * 16 + 10] = 1;
      this.jointMatrices[i * 16 + 15] = 1;
    }

    // Default Material 0 (neutral PBR grey/cyan)
    this.registerMaterial({
      baseColor: [0.8, 0.8, 0.85, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.35,
      metallic: 0.1,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
  }

  get registeredMeshes(): MeshMetadata[] {
    return this.meshRegistry;
  }

  get meshCount(): number {
    return this.meshRegistry.length;
  }

  initGPU(device: GPUDevice): void {
    if (this.gpuEntityBuffer) this.gpuEntityBuffer.destroy();
    if (this.gpuMaterialBuffer) this.gpuMaterialBuffer.destroy();
    if (this.gpuVisibleIndicesBuffer) this.gpuVisibleIndicesBuffer.destroy();
    if (this.gpuIndirectArgsBuffer) this.gpuIndirectArgsBuffer.destroy();
    if (this.gpuJointMatricesBuffer) this.gpuJointMatricesBuffer.destroy();

    this.gpuEntityBuffer = device.createBuffer({
      size: Math.max(this.entityBufferRaw.byteLength, 1024),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gpuMaterialBuffer = device.createBuffer({
      size: Math.max(this.materialBufferRaw.byteLength, 1024),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gpuVisibleIndicesBuffer = device.createBuffer({
      size: Math.max(192 * 10000 * 4, this.maxEntities * 4, 1024),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gpuIndirectArgsBuffer = device.createBuffer({
      size: Math.max(this.indirectCommandsData.byteLength, 1024),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });

    this.gpuJointMatricesBuffer = device.createBuffer({
      size: Math.max(this.jointMatrices.byteLength, 1024),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  uploadToGPU(device: GPUDevice): void {
    if (!this.gpuEntityBuffer || !this.gpuMaterialBuffer || !this.gpuIndirectArgsBuffer || !this.gpuJointMatricesBuffer) {
      return;
    }

    const activeBytes = this.activeEntityCount * FlatEntityManager.ENTITY_STRIDE_FLOATS * 4;
    if (activeBytes > 0) {
      device.queue.writeBuffer(this.gpuEntityBuffer, 0, this.entityBufferRaw, 0, activeBytes);
    }

    const matBytes = this.materialCount * FlatEntityManager.MATERIAL_STRIDE_FLOATS * 4;
    if (matBytes > 0) {
      device.queue.writeBuffer(this.gpuMaterialBuffer, 0, this.materialBufferRaw, 0, matBytes);
    }

    const cmdBytes = this.meshRegistry.length * DRAW_INDEXED_INDIRECT_STRIDE_BYTES;
    if (cmdBytes > 0) {
      device.queue.writeBuffer(this.gpuIndirectArgsBuffer, 0, this.indirectCommandsData.buffer, 0, cmdBytes);
    }

    if (this.totalJointsCount > 0) {
      device.queue.writeBuffer(this.gpuJointMatricesBuffer, 0, this.jointMatrices.buffer, 0, this.totalJointsCount * 16 * 4);
    }
  }

  /**
   * Zero-allocation CPU camera-frustum & distance culling pass.
   * Packs surviving entity indices contiguously per mesh so only rendered bytes upload to GPU.
   */
  populateFrustumCulledVisibleIndices(
    device: GPUDevice | null,
    frustumPlanes: Float32Array,
    camPos: [number, number, number],
    cullDistance: number,
    cullingEnabled: boolean
  ): number {
    const numMeshes = this.meshRegistry.length;
    if (numMeshes === 0) {
      this.lastCulledVisibleCount = 0;
      this.lastCulledShadowCasterCount = 0;
      return 0;
    }

    const counts = this.meshCountsCache;
    for (let i = 0; i < numMeshes; i++) {
      counts[i] = 0;
    }

    const activeCount = this.activeEntityCount;
    const fView = this.entityFloatView;
    const uView = this.entityUintView;
    const isFloorArr = this.meshIsFloorCache;
    const survivors = this.survivorsCache;
    const survivorMeshes = this.survivorMeshCache;
    const stride = FlatEntityManager.ENTITY_STRIDE_FLOATS;

    const p0x = frustumPlanes[0],  p0y = frustumPlanes[1],  p0z = frustumPlanes[2],  p0w = frustumPlanes[3];
    const p1x = frustumPlanes[4],  p1y = frustumPlanes[5],  p1z = frustumPlanes[6],  p1w = frustumPlanes[7];
    const p2x = frustumPlanes[8],  p2y = frustumPlanes[9],  p2z = frustumPlanes[10], p2w = frustumPlanes[11];
    const p3x = frustumPlanes[12], p3y = frustumPlanes[13], p3z = frustumPlanes[14], p3w = frustumPlanes[15];
    const p4x = frustumPlanes[16], p4y = frustumPlanes[17], p4z = frustumPlanes[18], p4w = frustumPlanes[19];
    const p5x = frustumPlanes[20], p5y = frustumPlanes[21], p5z = frustumPlanes[22], p5w = frustumPlanes[23];

    const camX = camPos[0], camY = camPos[1], camZ = camPos[2];
    const useDistCull = cullDistance > 0;

    let survivorCount = 0;
    let shadowCasterCount = 0;

    for (let i = 0; i < activeCount; i++) {
      const eOffset = i * stride;
      if ((uView[eOffset + 22] & 1) === 0) continue;

      const meshId = uView[eOffset + 20];
      if (meshId >= numMeshes) continue;

      const rad = fView[eOffset + 19];

      if (cullingEnabled && rad < 1000.0) {
        const cx = fView[eOffset + 16];
        const cy = fView[eOffset + 17];
        const cz = fView[eOffset + 18];

        if (useDistCull) {
          const dx = cx - camX;
          const dy = cy - camY;
          const dz = cz - camZ;
          const maxD = cullDistance + rad;
          if (dx * dx + dy * dy + dz * dz > maxD * maxD) continue;
        }

        const negR = -(rad + 0.5);
        if (
          p0x * cx + p0y * cy + p0z * cz + p0w < negR ||
          p1x * cx + p1y * cy + p1z * cz + p1w < negR ||
          p2x * cx + p2y * cy + p2z * cz + p2w < negR ||
          p3x * cx + p3y * cy + p3z * cz + p3w < negR ||
          p4x * cx + p4y * cy + p4z * cz + p4w < negR ||
          p5x * cx + p5y * cy + p5z * cz + p5w < negR
        ) {
          continue;
        }
      }

      counts[meshId]++;
      survivors[survivorCount] = i;
      survivorMeshes[survivorCount] = meshId;
      survivorCount++;

      if (rad < 1000.0 && isFloorArr[meshId] === 0) {
        shadowCasterCount++;
      }
    }

    // Prefix sum compact firstInstance offsets for each mesh
    const firstInst = this.meshFirstInstanceCache;
    const cursors = this.meshWriteCursorCache;
    let cursor = 0;
    for (let m = 0; m < numMeshes; m++) {
      firstInst[m] = cursor;
      cursors[m] = cursor;
      cursor += counts[m];
      const cmdOffset = m * DRAW_INDEXED_INDIRECT_STRIDE_U32;
      this.indirectCommandsData[cmdOffset + 1] = counts[m];
      this.indirectCommandsData[cmdOffset + 4] = firstInst[m];
    }

    // Scatter surviving entity indices contiguously into indicesCache
    const idxCache = this.indicesCache;
    for (let s = 0; s < survivorCount; s++) {
      const mId = survivorMeshes[s];
      const dst = cursors[mId];
      cursors[mId] = dst + 1;
      idxCache[dst] = survivors[s];
    }

    this.lastCulledVisibleCount = survivorCount;
    this.lastCulledShadowCasterCount = shadowCasterCount;

    if (device && this.gpuVisibleIndicesBuffer && cursor > 0) {
      const uploadBytes = Math.min(cursor * 4, this.gpuVisibleIndicesBuffer.size);
      device.queue.writeBuffer(
        this.gpuVisibleIndicesBuffer,
        0,
        idxCache.buffer,
        0,
        uploadBytes
      );
    }

    return survivorCount;
  }

  private static readonly ZERO_VEC3: [number, number, number] = [0, 0, 0];

  populateDirectVisibleIndices(device: GPUDevice): void {
    this.populateFrustumCulledVisibleIndices(
      device,
      this.entityFloatView,
      FlatEntityManager.ZERO_VEC3,
      0,
      false
    );
  }

  getMeshEntityCount(meshId: number): number {
    if (meshId < 0 || meshId >= this.meshCountsCache.length) return 0;
    return this.meshCountsCache[meshId];
  }

  getMeshFirstInstance(meshId: number): number {
    if (meshId < 0 || meshId >= this.meshFirstInstanceCache.length) return 0;
    return this.meshFirstInstanceCache[meshId];
  }

  isFloorMesh(meshId: number): boolean {
    if (meshId < 0 || meshId >= this.meshIsFloorCache.length) return false;
    return this.meshIsFloorCache[meshId] !== 0;
  }

  getEntityBuffer(): GPUBuffer {
    return this.gpuEntityBuffer!;
  }

  getMaterialBuffer(): GPUBuffer {
    return this.gpuMaterialBuffer!;
  }

  getVisibleIndicesBuffer(): GPUBuffer {
    return this.gpuVisibleIndicesBuffer!;
  }

  getIndirectArgsBuffer(): GPUBuffer {
    return this.gpuIndirectArgsBuffer!;
  }

  getJointMatricesBuffer(): GPUBuffer {
    return this.gpuJointMatricesBuffer!;
  }

  getTotalVertices(): number {
    return this.cachedTotalVertices;
  }

  getTotalTriangles(): number {
    return this.cachedTotalTriangles;
  }

  getMesh(id: number): MeshMetadata | undefined {
    return this.meshRegistry[id];
  }

  registerMesh(metadata: Omit<MeshMetadata, 'id'> & { id?: number }): number {
    const id = metadata.id !== undefined && metadata.id >= 0 ? metadata.id : this.meshRegistry.length;
    const mesh: MeshMetadata = {
      id,
      name: metadata.name,
      firstIndex: metadata.firstIndex,
      indexCount: metadata.indexCount,
      baseVertex: metadata.baseVertex,
      vertexCount: metadata.vertexCount,
      boundingRadius: metadata.boundingRadius,
      hasSkinning: metadata.hasSkinning,
      hasMorphTargets: metadata.hasMorphTargets,
      morphTargetCount: metadata.morphTargetCount,
    };

    if (id < this.meshRegistry.length) {
      this.meshRegistry[id] = mesh;
    } else {
      this.meshRegistry.push(mesh);
    }

    if (id >= this.meshCountsCache.length) {
      const nextCap = Math.max(id + 64, this.meshCountsCache.length * 2);
      const nextCounts = new Uint32Array(nextCap);
      nextCounts.set(this.meshCountsCache);
      this.meshCountsCache = nextCounts;

      const nextFirst = new Uint32Array(nextCap);
      nextFirst.set(this.meshFirstInstanceCache);
      this.meshFirstInstanceCache = nextFirst;

      const nextCursor = new Uint32Array(nextCap);
      nextCursor.set(this.meshWriteCursorCache);
      this.meshWriteCursorCache = nextCursor;

      const nextFloor = new Uint8Array(nextCap);
      nextFloor.set(this.meshIsFloorCache);
      this.meshIsFloorCache = nextFloor;
    }

    const lowerName = mesh.name.toLowerCase();
    this.meshIsFloorCache[id] =
      lowerName.includes('floor') ||
      lowerName.includes('ground') ||
      lowerName.includes('city_road') ||
      lowerName.includes('city_sidewalk') ||
      lowerName.includes('city_stripe') ||
      lowerName.includes('city_lane') ||
      lowerName.includes('city_crosswalk') ||
      mesh.boundingRadius >= 1000.0
        ? 1
        : 0;

    let totVerts = 0;
    let totTris = 0;
    for (let i = 0; i < this.meshRegistry.length; i++) {
      totVerts += this.meshRegistry[i].vertexCount;
      totTris += Math.floor(this.meshRegistry[i].indexCount / 3);
    }
    this.cachedTotalVertices = totVerts;
    this.cachedTotalTriangles = totTris;

    const cmdOffset = id * DRAW_INDEXED_INDIRECT_STRIDE_U32;
    if (cmdOffset + DRAW_INDEXED_INDIRECT_STRIDE_U32 > this.indirectCommandsData.length) {
      const newCmds = new Uint32Array(this.indirectCommandsData.length * 2);
      newCmds.set(this.indirectCommandsData);
      this.indirectCommandsData = newCmds;
    }

    this.indirectCommandsData[cmdOffset + 0] = mesh.indexCount;
    this.indirectCommandsData[cmdOffset + 1] = 0; // instance count (populated by culling)
    this.indirectCommandsData[cmdOffset + 2] = mesh.firstIndex;
    this.indirectCommandsData[cmdOffset + 3] = mesh.baseVertex;
    this.indirectCommandsData[cmdOffset + 4] = id * 10000;

    return id;
  }

  registerMaterial(mat: FlatMaterial): number {
    if (this.materialCount >= this.maxMaterials) {
      return 0;
    }
    const id = this.materialCount++;
    const offset = id * FlatEntityManager.MATERIAL_STRIDE_FLOATS;

    this.materialFloatView[offset + 0] = mat.baseColor[0];
    this.materialFloatView[offset + 1] = mat.baseColor[1];
    this.materialFloatView[offset + 2] = mat.baseColor[2];
    this.materialFloatView[offset + 3] = mat.baseColor[3];

    this.materialFloatView[offset + 4] = mat.emissiveColor[0];
    this.materialFloatView[offset + 5] = mat.emissiveColor[1];
    this.materialFloatView[offset + 6] = mat.emissiveColor[2];
    this.materialFloatView[offset + 7] = mat.emissiveColor[3];

    this.materialFloatView[offset + 8] = mat.roughness;
    this.materialFloatView[offset + 9] = mat.metallic;
    this.materialFloatView[offset + 10] = mat.ao;
    this.materialFloatView[offset + 11] = mat.alphaCutoff;

    this.materialUintView[offset + 12] = mat.flags ?? 0;
    this.materialFloatView[offset + 13] = mat.atlasRect?.[0] ?? 0;
    this.materialFloatView[offset + 14] = mat.atlasRect?.[1] ?? 0;
    this.materialFloatView[offset + 15] = mat.atlasRect?.[2] ?? 1;

    return id;
  }

  getMaterial(id: number): FlatMaterial | null {
    if (id < 0 || id >= this.materialCount) return null;
    const offset = id * FlatEntityManager.MATERIAL_STRIDE_FLOATS;
    return {
      baseColor: [
        this.materialFloatView[offset + 0],
        this.materialFloatView[offset + 1],
        this.materialFloatView[offset + 2],
        this.materialFloatView[offset + 3],
      ],
      emissiveColor: [
        this.materialFloatView[offset + 4],
        this.materialFloatView[offset + 5],
        this.materialFloatView[offset + 6],
        this.materialFloatView[offset + 7],
      ],
      roughness: this.materialFloatView[offset + 8],
      metallic: this.materialFloatView[offset + 9],
      ao: this.materialFloatView[offset + 10],
      alphaCutoff: this.materialFloatView[offset + 11],
      flags: this.materialUintView[offset + 12],
      atlasRect: [
        this.materialFloatView[offset + 13],
        this.materialFloatView[offset + 14],
        this.materialFloatView[offset + 15],
      ],
    };
  }

  updateMaterial(id: number, mat: Partial<FlatMaterial>): void {
    if (id < 0 || id >= this.materialCount) return;
    const offset = id * FlatEntityManager.MATERIAL_STRIDE_FLOATS;

    if (mat.baseColor) {
      this.materialFloatView[offset + 0] = mat.baseColor[0];
      this.materialFloatView[offset + 1] = mat.baseColor[1];
      this.materialFloatView[offset + 2] = mat.baseColor[2];
      this.materialFloatView[offset + 3] = mat.baseColor[3];
    }
    if (mat.emissiveColor) {
      this.materialFloatView[offset + 4] = mat.emissiveColor[0];
      this.materialFloatView[offset + 5] = mat.emissiveColor[1];
      this.materialFloatView[offset + 6] = mat.emissiveColor[2];
      this.materialFloatView[offset + 7] = mat.emissiveColor[3];
    }
    if (mat.roughness !== undefined) {
      this.materialFloatView[offset + 8] = mat.roughness;
    }
    if (mat.metallic !== undefined) {
      this.materialFloatView[offset + 9] = mat.metallic;
    }
    if (mat.ao !== undefined) {
      this.materialFloatView[offset + 10] = mat.ao;
    }
    if (mat.alphaCutoff !== undefined) {
      this.materialFloatView[offset + 11] = mat.alphaCutoff;
    }
    if (mat.flags !== undefined) {
      this.materialUintView[offset + 12] = mat.flags;
    }
    if (mat.atlasRect) {
      this.materialFloatView[offset + 13] = mat.atlasRect[0];
      this.materialFloatView[offset + 14] = mat.atlasRect[1];
      this.materialFloatView[offset + 15] = mat.atlasRect[2];
    }
  }

  addEntity(params: AddEntityParams): number {
    if (this.activeEntityCount >= this.maxEntities) {
      return -1;
    }

    const id = this.nextEntityId++;
    this.activeEntityCount++;

    const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    for (let i = 0; i < 16; i++) {
      this.entityFloatView[eOffset + i] = params.worldMatrix[i];
    }

    this.entityFloatView[eOffset + 16] = params.sphereCenter[0];
    this.entityFloatView[eOffset + 17] = params.sphereCenter[1];
    this.entityFloatView[eOffset + 18] = params.sphereCenter[2];
    this.entityFloatView[eOffset + 19] = params.sphereCenter[3];

    this.entityUintView[eOffset + 20] = params.meshId;
    this.entityUintView[eOffset + 21] = params.materialId ?? 0;
    this.entityUintView[eOffset + 22] = params.flags ?? 1;
    this.entityUintView[eOffset + 23] = params.animOffset ?? 0;

    this.entityRecords.push({
      id,
      meshId: params.meshId,
      materialId: params.materialId ?? 0,
      isActive: true,
      castShadows: true,
      name: params.name || `Entity_${id}`,
    });

    return id;
  }

  updateEntityMatrix(id: number, worldMatrix: Float32Array, centerPos?: [number, number, number], boundingRadius = 2.5): void {
    const posX = centerPos ? centerPos[0] : worldMatrix[12];
    const posY = centerPos ? centerPos[1] : worldMatrix[13];
    const posZ = centerPos ? centerPos[2] : worldMatrix[14];
    this.updateEntityMatrixXYZ(id, worldMatrix, posX, posY, posZ, boundingRadius);
  }

  updateEntityMatrixXYZ(
    id: number,
    worldMatrix: Float32Array,
    posX: number,
    posY: number,
    posZ: number,
    boundingRadius = 2.5
  ): void {
    if (id < 0 || id >= this.nextEntityId) return;
    const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    const fView = this.entityFloatView;
    for (let i = 0; i < 16; i++) {
      fView[eOffset + i] = worldMatrix[i];
    }
    fView[eOffset + 16] = posX;
    fView[eOffset + 17] = posY;
    fView[eOffset + 18] = posZ;
    fView[eOffset + 19] = boundingRadius;
  }

  deleteSingleEntity(id: number): void {
    if (id < this.activeEntityCount) {
      const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
      this.entityUintView[eOffset + 22] = 0;
      this.entityRecords = this.entityRecords.filter((r) => r.id !== id);
      this.lightRecords = this.lightRecords.filter((l) => l.entityId !== id);
    }
  }

  setEntityVisible(id: number, visible: boolean): void {
    if (id < 0 || id >= this.nextEntityId) return;
    const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    if (visible) {
      this.entityUintView[eOffset + 22] |= 1;
    } else {
      this.entityUintView[eOffset + 22] &= ~1;
    }
    const rec = this.entityRecords[id];
    if (rec && rec.id === id) {
      rec.isActive = visible;
    }
  }

  isEntityVisible(id: number): boolean {
    if (id < 0 || id >= this.nextEntityId) return false;
    const eOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    return (this.entityUintView[eOffset + 22] & 1) !== 0;
  }

  getVisibleFlagEntityCount(): number {
    let count = 0;
    for (let i = 0; i < this.activeEntityCount; i++) {
      const eOffset = i * FlatEntityManager.ENTITY_STRIDE_FLOATS;
      if ((this.entityUintView[eOffset + 22] & 1) !== 0) {
        count++;
      }
    }
    return count;
  }

  duplicateEntity(id: number): number {
    const record = this.entityRecords.find((r) => r.id === id);
    if (!record || this.activeEntityCount >= this.maxEntities) return -1;

    const srcOffset = id * FlatEntityManager.ENTITY_STRIDE_FLOATS;
    const newId = this.nextEntityId++;
    this.activeEntityCount++;
    const dstOffset = newId * FlatEntityManager.ENTITY_STRIDE_FLOATS;

    for (let i = 0; i < FlatEntityManager.ENTITY_STRIDE_FLOATS; i++) {
      this.entityFloatView[dstOffset + i] = this.entityFloatView[srcOffset + i];
    }

    // Offset position by +2.0 in X and Z
    this.entityFloatView[dstOffset + 12] += 2.0;
    this.entityFloatView[dstOffset + 14] += 2.0;
    this.entityFloatView[dstOffset + 16] += 2.0;
    this.entityFloatView[dstOffset + 18] += 2.0;

    this.entityRecords.push({
      id: newId,
      meshId: record.meshId,
      materialId: record.materialId,
      isActive: true,
      castShadows: true,
      name: `${record.name || 'Entity'}_copy`,
    });

    return newId;
  }

  clear(): void {
    this.activeEntityCount = 0;
    this.nextEntityId = 0;
    this.nextLightId = 0;
    this.meshRegistry = [];
    this.materialCount = 0;
    this.totalJointsCount = 0;
    this.entityRecords = [];
    this.lightRecords = [];
    this.cachedTotalVertices = 0;
    this.cachedTotalTriangles = 0;
    this.lastCulledVisibleCount = 0;
    this.lastCulledShadowCasterCount = 0;
    this.entityUintView.fill(0);
    this.indirectCommandsData.fill(0);
    this.meshCountsCache.fill(0);
    this.meshFirstInstanceCache.fill(0);
    this.meshIsFloorCache.fill(0);
  }
}
