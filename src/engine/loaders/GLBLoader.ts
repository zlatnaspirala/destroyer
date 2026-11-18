/**
 * Destroyer Engine - Full Rigged & Animated Binary GLB Loader
 * Parses GLTF 2.0 binary containers into Flat GPU Primitives, Skeleton Joints,
 * Animation Clips (translation, rotation, scale, cubicspline), PBR Materials,
 * and Embedded Texture Images.
 */

import { AnimationChannel, AnimationClip, FlatMaterial, MorphTargetData, SkeletonJoint } from '../core/Types';
import { Mat4 } from '../math/Mat4';

export interface ParsedGLBPrimitive {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  joints?: Uint32Array;
  weights?: Float32Array;
  morphTargets?: MorphTargetData[];
  boundingRadius: number;
  material?: FlatMaterial;
  textureImageIndex?: number | null;
}

export interface GLBTextureImage {
  index: number;
  mimeType: string;
  bytes: Uint8Array;
}

export interface GLBParseOptions {
  /** Normalize entire character height to target meters (e.g. 1.75) and place feet at Y=0 */
  normalizeToHeight?: number;
}

export interface GLBParseResult {
  primitives: ParsedGLBPrimitive[];
  joints: SkeletonJoint[];
  clips: AnimationClip[];
  textures: GLBTextureImage[];
  hasSkinning: boolean;
  boundingHeight: number;
}

const COMPONENT_COUNT: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const COMPONENT_BYTE_SIZE: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

export class GLBLoader {
  static interleavePrimitive(prim: ParsedGLBPrimitive): Float32Array {
    const vertexCount = Math.floor(prim.positions.length / 3);
    const stride = 22; // 22 floats = 88 bytes
    const buffer = new ArrayBuffer(vertexCount * stride * 4);
    const f32 = new Float32Array(buffer);
    const u32 = new Uint32Array(buffer);

    for (let i = 0; i < vertexCount; i++) {
      const offset = i * stride;
      // Pos (3): floats 0..2
      f32[offset + 0] = prim.positions[i * 3 + 0] || 0;
      f32[offset + 1] = prim.positions[i * 3 + 1] || 0;
      f32[offset + 2] = prim.positions[i * 3 + 2] || 0;

      // Normal (3): floats 3..5
      if (prim.normals && prim.normals.length >= (i + 1) * 3) {
        f32[offset + 3] = prim.normals[i * 3 + 0];
        f32[offset + 4] = prim.normals[i * 3 + 1];
        f32[offset + 5] = prim.normals[i * 3 + 2];
      } else {
        f32[offset + 3] = 0;
        f32[offset + 4] = 1;
        f32[offset + 5] = 0;
      }

      // UV (2): floats 6..7
      if (prim.uvs && prim.uvs.length >= (i + 1) * 2) {
        f32[offset + 6] = prim.uvs[i * 2 + 0];
        f32[offset + 7] = prim.uvs[i * 2 + 1];
      } else {
        f32[offset + 6] = 0;
        f32[offset + 7] = 0;
      }

      // Joints (4 uint32): floats 8..11
      if (prim.joints && prim.joints.length >= (i + 1) * 4) {
        u32[offset + 8] = prim.joints[i * 4 + 0];
        u32[offset + 9] = prim.joints[i * 4 + 1];
        u32[offset + 10] = prim.joints[i * 4 + 2];
        u32[offset + 11] = prim.joints[i * 4 + 3];
      } else {
        u32[offset + 8] = 0;
        u32[offset + 9] = 0;
        u32[offset + 10] = 0;
        u32[offset + 11] = 0;
      }

      // Weights (4 float32): floats 12..15
      if (prim.weights && prim.weights.length >= (i + 1) * 4) {
        f32[offset + 12] = prim.weights[i * 4 + 0];
        f32[offset + 13] = prim.weights[i * 4 + 1];
        f32[offset + 14] = prim.weights[i * 4 + 2];
        f32[offset + 15] = prim.weights[i * 4 + 3];
      } else {
        f32[offset + 12] = 0;
        f32[offset + 13] = 0;
        f32[offset + 14] = 0;
        f32[offset + 15] = 0;
      }

      // Morph Target 0 (3 floats): floats 16..18
      if (prim.morphTargets && prim.morphTargets[0] && prim.morphTargets[0].deltaPositions.length >= (i + 1) * 3) {
        f32[offset + 16] = prim.morphTargets[0].deltaPositions[i * 3 + 0];
        f32[offset + 17] = prim.morphTargets[0].deltaPositions[i * 3 + 1];
        f32[offset + 18] = prim.morphTargets[0].deltaPositions[i * 3 + 2];
      } else {
        f32[offset + 16] = 0;
        f32[offset + 17] = 0;
        f32[offset + 18] = 0;
      }

      // Morph Target 1 (3 floats): floats 19..21
      if (prim.morphTargets && prim.morphTargets[1] && prim.morphTargets[1].deltaPositions.length >= (i + 1) * 3) {
        f32[offset + 19] = prim.morphTargets[1].deltaPositions[i * 3 + 0];
        f32[offset + 20] = prim.morphTargets[1].deltaPositions[i * 3 + 1];
        f32[offset + 21] = prim.morphTargets[1].deltaPositions[i * 3 + 2];
      } else {
        f32[offset + 19] = 0;
        f32[offset + 20] = 0;
        f32[offset + 21] = 0;
      }
    }

    return f32;
  }

  private static readScalar(dv: DataView, bytePos: number, componentType: number, normalized: boolean): number {
    switch (componentType) {
      case 5120: {
        const v = dv.getInt8(bytePos);
        return normalized ? Math.max(v / 127.0, -1.0) : v;
      }
      case 5121: {
        const v = dv.getUint8(bytePos);
        return normalized ? v / 255.0 : v;
      }
      case 5122: {
        const v = dv.getInt16(bytePos, true);
        return normalized ? Math.max(v / 32767.0, -1.0) : v;
      }
      case 5123: {
        const v = dv.getUint16(bytePos, true);
        return normalized ? v / 65535.0 : v;
      }
      case 5125:
        return dv.getUint32(bytePos, true);
      case 5126:
        return dv.getFloat32(bytePos, true);
      default:
        return 0;
    }
  }

  private static readAccessorFloat(gltf: any, binView: DataView, accessorIdx: number): Float32Array {
    const acc = gltf.accessors[accessorIdx];
    const numComp = COMPONENT_COUNT[acc.type] || 1;
    const total = acc.count * numComp;
    const out = new Float32Array(total);
    const compSize = COMPONENT_BYTE_SIZE[acc.componentType] || 4;
    const normalized = !!acc.normalized;

    if (acc.bufferView !== undefined) {
      const view = gltf.bufferViews[acc.bufferView];
      const baseOffset = (view.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = view.byteStride || numComp * compSize;

      for (let i = 0; i < acc.count; i++) {
        const elemOffset = baseOffset + i * stride;
        for (let c = 0; c < numComp; c++) {
          out[i * numComp + c] = GLBLoader.readScalar(binView, elemOffset + c * compSize, acc.componentType, normalized);
        }
      }
    }

    if (acc.sparse) {
      const sp = acc.sparse;
      const idxView = gltf.bufferViews[sp.indices.bufferView];
      const idxBase = (idxView.byteOffset || 0) + (sp.indices.byteOffset || 0);
      const idxCompSize = COMPONENT_BYTE_SIZE[sp.indices.componentType] || 2;
      const valView = gltf.bufferViews[sp.values.bufferView];
      const valBase = (valView.byteOffset || 0) + (sp.values.byteOffset || 0);

      for (let s = 0; s < sp.count; s++) {
        const targetIdx = GLBLoader.readScalar(binView, idxBase + s * idxCompSize, sp.indices.componentType, false);
        const valPos = valBase + s * numComp * compSize;
        for (let c = 0; c < numComp; c++) {
          out[targetIdx * numComp + c] = GLBLoader.readScalar(
            binView,
            valPos + c * compSize,
            acc.componentType,
            normalized
          );
        }
      }
    }

    return out;
  }

  private static readAccessorUint(gltf: any, binView: DataView, accessorIdx: number): Uint32Array {
    const acc = gltf.accessors[accessorIdx];
    const numComp = COMPONENT_COUNT[acc.type] || 1;
    const total = acc.count * numComp;
    const out = new Uint32Array(total);
    const compSize = COMPONENT_BYTE_SIZE[acc.componentType] || 2;

    if (acc.bufferView !== undefined) {
      const view = gltf.bufferViews[acc.bufferView];
      const baseOffset = (view.byteOffset || 0) + (acc.byteOffset || 0);
      const stride = view.byteStride || numComp * compSize;

      for (let i = 0; i < acc.count; i++) {
        const elemOffset = baseOffset + i * stride;
        for (let c = 0; c < numComp; c++) {
          out[i * numComp + c] = GLBLoader.readScalar(binView, elemOffset + c * compSize, acc.componentType, false);
        }
      }
    }

    return out;
  }

  private static computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
    const normals = new Float32Array(positions.length);
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;

      const ax = positions[i1] - positions[i0];
      const ay = positions[i1 + 1] - positions[i0 + 1];
      const az = positions[i1 + 2] - positions[i0 + 2];

      const bx = positions[i2] - positions[i0];
      const by = positions[i2 + 1] - positions[i0 + 1];
      const bz = positions[i2 + 2] - positions[i0 + 2];

      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;

      normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
      normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
      normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
    }

    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
      if (len > 1e-6) {
        normals[i] /= len;
        normals[i + 1] /= len;
        normals[i + 2] /= len;
      } else {
        normals[i] = 0;
        normals[i + 1] = 1;
        normals[i + 2] = 0;
      }
    }
    return normals;
  }

  private static decodeBase64Bytes(dataUri: string): { mimeType: string; bytes: Uint8Array } | null {
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUri);
    if (!match) return null;
    const mimeType = match[1];
    const binStr = atob(match[2]);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return { mimeType, bytes };
  }

  static parse(arrayBuffer: ArrayBuffer, options: GLBParseOptions = {}): GLBParseResult {
    const dataView = new DataView(arrayBuffer);
    const magic = dataView.getUint32(0, true);
    if (magic !== 0x46546c67) {
      throw new Error('Invalid GLB magic header. Expected 0x46546C67 (glTF)');
    }

    const version = dataView.getUint32(4, true);
    if (version !== 2) {
      throw new Error(`Unsupported glTF version ${version}. Only version 2.0 is supported.`);
    }

    // Walk chunks (JSON and optional BIN)
    let jsonText = '';
    let binSlice: ArrayBuffer | null = null;
    let offset = 12;
    while (offset + 8 <= arrayBuffer.byteLength) {
      const chunkLength = dataView.getUint32(offset, true);
      const chunkType = dataView.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      if (chunkType === 0x4e4f534a) {
        jsonText = new TextDecoder().decode(new Uint8Array(arrayBuffer, chunkStart, chunkLength));
      } else if (chunkType === 0x004e4942) {
        binSlice = arrayBuffer.slice(chunkStart, chunkStart + chunkLength);
      }
      offset = chunkStart + chunkLength;
    }

    if (!jsonText) {
      throw new Error('GLB missing JSON chunk');
    }

    const gltf = JSON.parse(jsonText);
    const binView = new DataView(binSlice || new ArrayBuffer(0));
    const binBytes = new Uint8Array(binSlice || new ArrayBuffer(0));

    // 1. Extract Embedded Textures/Images
    const textures: GLBTextureImage[] = [];
    if (Array.isArray(gltf.images)) {
      for (let idx = 0; idx < gltf.images.length; idx++) {
        const img = gltf.images[idx];
        if (img.bufferView !== undefined && binSlice) {
          const bv = gltf.bufferViews[img.bufferView];
          const start = bv.byteOffset || 0;
          const bytes = binBytes.slice(start, start + bv.byteLength);
          textures.push({
            index: idx,
            mimeType: img.mimeType || 'image/png',
            bytes,
          });
        } else if (typeof img.uri === 'string' && img.uri.startsWith('data:')) {
          const decoded = GLBLoader.decodeBase64Bytes(img.uri);
          if (decoded) {
            textures.push({ index: idx, mimeType: decoded.mimeType, bytes: decoded.bytes });
          }
        }
      }
    }

    // 2. Build Node Hierarchy
    const gltfNodes: any[] = Array.isArray(gltf.nodes) ? gltf.nodes : [];
    const nodeCount = gltfNodes.length;
    const nodeParent = new Int32Array(nodeCount).fill(-1);
    const nodeLocalMats: Float32Array[] = new Array(nodeCount);
    const nodeBindWorldMats: Float32Array[] = new Array(nodeCount);
    const nodeTRS: {
      t: [number, number, number];
      r: [number, number, number, number];
      s: [number, number, number];
    }[] = new Array(nodeCount);

    for (let i = 0; i < nodeCount; i++) {
      const n = gltfNodes[i];
      if (Array.isArray(n.children)) {
        for (const childIdx of n.children) {
          if (childIdx >= 0 && childIdx < nodeCount) {
            nodeParent[childIdx] = i;
          }
        }
      }

      const localMat = Mat4.create();
      if (Array.isArray(n.matrix) && n.matrix.length === 16) {
        localMat.set(n.matrix);
        const dec = Mat4.decompose(localMat);
        nodeTRS[i] = { t: dec.translation, r: dec.rotation, s: dec.scale };
      } else {
        const t: [number, number, number] = n.translation ? [n.translation[0], n.translation[1], n.translation[2]] : [0, 0, 0];
        const r: [number, number, number, number] = n.rotation ? [n.rotation[0], n.rotation[1], n.rotation[2], n.rotation[3]] : [0, 0, 0, 1];
        const s: [number, number, number] = n.scale ? [n.scale[0], n.scale[1], n.scale[2]] : [1, 1, 1];
        Mat4.fromTranslationRotationScale(t, r, s, localMat);
        nodeTRS[i] = { t, r, s };
      }
      nodeLocalMats[i] = localMat;
    }

    const computedBind = new Uint8Array(nodeCount);
    const computeBindWorld = (idx: number): Float32Array => {
      if (computedBind[idx]) return nodeBindWorldMats[idx];
      const out = Mat4.create();
      const p = nodeParent[idx];
      if (p >= 0) {
        Mat4.multiply(computeBindWorld(p), nodeLocalMats[idx], out);
      } else {
        out.set(nodeLocalMats[idx]);
      }
      nodeBindWorldMats[idx] = out;
      computedBind[idx] = 1;
      return out;
    };
    for (let i = 0; i < nodeCount; i++) computeBindWorld(i);

    // 3. Parse Primary Skin & Expand Ancestors (e.g. Mixamo Armature 0.01 scale root)
    const joints: SkeletonJoint[] = [];
    const nodeToJoint = new Map<number, number>();
    const skins: any[] = Array.isArray(gltf.skins) ? gltf.skins : [];
    const primarySkin = skins[0];

    if (primarySkin && Array.isArray(primarySkin.joints) && primarySkin.joints.length > 0) {
      const ibmData =
        primarySkin.inverseBindMatrices !== undefined
          ? GLBLoader.readAccessorFloat(gltf, binView, primarySkin.inverseBindMatrices)
          : null;

      // Indices 0 .. skinJointCount-1 match vertex JOINTS_0 directly
      for (let j = 0; j < primarySkin.joints.length; j++) {
        const nodeIdx = primarySkin.joints[j];
        nodeToJoint.set(nodeIdx, j);
      }

      // Collect any non-joint ancestor nodes (such as Armature with scale 0.01)
      const extraAncestorNodes: number[] = [];
      for (const nodeIdx of primarySkin.joints) {
        let p = nodeParent[nodeIdx];
        while (p >= 0 && !nodeToJoint.has(p)) {
          nodeToJoint.set(p, primarySkin.joints.length + extraAncestorNodes.length);
          extraAncestorNodes.push(p);
          p = nodeParent[p];
        }
      }

      const allJointNodes = [...primarySkin.joints, ...extraAncestorNodes];
      for (let j = 0; j < allJointNodes.length; j++) {
        const nodeIdx = allJointNodes[j];
        const gltfNode = gltfNodes[nodeIdx] || {};
        const pNode = nodeParent[nodeIdx];
        const parentJointIdx = pNode >= 0 && nodeToJoint.has(pNode) ? nodeToJoint.get(pNode)! : -1;

        const ibm = Mat4.create();
        if (ibmData && j < primarySkin.joints.length && (j + 1) * 16 <= ibmData.length) {
          ibm.set(ibmData.subarray(j * 16, j * 16 + 16));
        }

        const trs = nodeTRS[nodeIdx] || { t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
        const localMat = new Float32Array(nodeLocalMats[nodeIdx] || Mat4.create());
        const worldMat = new Float32Array(nodeBindWorldMats[nodeIdx] || Mat4.create());

        joints.push({
          name: gltfNode.name || `Joint_${j}`,
          parentIndex: parentJointIdx,
          inverseBindMatrix: ibm,
          localMatrix: localMat,
          worldMatrix: worldMat,
          initialTranslation: [...trs.t],
          initialRotation: [...trs.r],
          initialScale: [...trs.s],
        });
      }
    }

    // Helper: Convert GLTF material index to FlatMaterial + texture index
    const resolveMaterial = (matIdx: number | undefined): { material: FlatMaterial; textureImageIndex: number | null } => {
      if (matIdx === undefined || !gltf.materials || !gltf.materials[matIdx]) {
        return {
          material: {
            baseColor: [0.85, 0.85, 0.88, 1.0],
            emissiveColor: [0, 0, 0, 0],
            roughness: 0.55,
            metallic: 0.1,
            ao: 1.0,
            alphaCutoff: 0.5,
          },
          textureImageIndex: null,
        };
      }

      const m = gltf.materials[matIdx];
      const pbr = m.pbrMetallicRoughness || {};
      const bcf = pbr.baseColorFactor || [1, 1, 1, 1];
      const ef = m.emissiveFactor || [0, 0, 0];

      let textureImageIndex: number | null = null;
      if (pbr.baseColorTexture && gltf.textures) {
        const texDef = gltf.textures[pbr.baseColorTexture.index];
        if (texDef && texDef.source !== undefined) {
          textureImageIndex = texDef.source;
        }
      }

      let alphaCutoff = 0.0;
      if (m.alphaMode === 'MASK') {
        alphaCutoff = m.alphaCutoff ?? 0.5;
      } else if (m.alphaMode === 'BLEND') {
        alphaCutoff = 0.15;
      }

      return {
        material: {
          baseColor: [bcf[0] ?? 1, bcf[1] ?? 1, bcf[2] ?? 1, bcf[3] ?? 1],
          emissiveColor: [ef[0] ?? 0, ef[1] ?? 0, ef[2] ?? 0, (ef[0] || ef[1] || ef[2]) ? 1.0 : 0.0],
          roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 0.55,
          metallic: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 0.1,
          ao: 1.0,
          alphaCutoff,
        },
        textureImageIndex,
      };
    };

    // 4. Parse Primitives from Nodes (preserving mesh node transforms)
    interface RawPrimEntry {
      prim: ParsedGLBPrimitive;
      nodeIdx: number;
      isSkinned: boolean;
    }
    const rawEntries: RawPrimEntry[] = [];
    const meshesVisited = new Set<number>();

    const processMesh = (meshIdx: number, nodeIdx: number, hasNodeSkin: boolean) => {
      const mesh = gltf.meshes?.[meshIdx];
      if (!mesh || !Array.isArray(mesh.primitives)) return;
      meshesVisited.add(meshIdx);

      for (let pIdx = 0; pIdx < mesh.primitives.length; pIdx++) {
        const prim = mesh.primitives[pIdx];
        if (prim.extensions?.KHR_draco_mesh_compression) {
          throw new Error('Draco-compressed GLB meshes are not supported; please re-export without Draco compression.');
        }
        if (!prim.attributes || prim.attributes.POSITION === undefined) continue;
        if (prim.mode !== undefined && prim.mode !== 4) continue; // Only TRIANGLES (mode 4)

        const positions = GLBLoader.readAccessorFloat(gltf, binView, prim.attributes.POSITION);
        const vertCount = Math.floor(positions.length / 3);

        let indices: Uint32Array;
        if (prim.indices !== undefined) {
          indices = GLBLoader.readAccessorUint(gltf, binView, prim.indices);
        } else {
          indices = new Uint32Array(vertCount);
          for (let i = 0; i < vertCount; i++) indices[i] = i;
        }

        let normals: Float32Array;
        if (prim.attributes.NORMAL !== undefined) {
          normals = GLBLoader.readAccessorFloat(gltf, binView, prim.attributes.NORMAL);
        } else {
          normals = GLBLoader.computeNormals(positions, indices);
        }

        let uvs: Float32Array;
        if (prim.attributes.TEXCOORD_0 !== undefined) {
          uvs = GLBLoader.readAccessorFloat(gltf, binView, prim.attributes.TEXCOORD_0);
        } else {
          uvs = new Float32Array(vertCount * 2);
        }

        let primJoints: Uint32Array | undefined;
        let primWeights: Float32Array | undefined;
        let isSkinned = false;

        if (
          hasNodeSkin &&
          joints.length > 0 &&
          prim.attributes.JOINTS_0 !== undefined &&
          prim.attributes.WEIGHTS_0 !== undefined
        ) {
          primJoints = GLBLoader.readAccessorUint(gltf, binView, prim.attributes.JOINTS_0);
          primWeights = GLBLoader.readAccessorFloat(gltf, binView, prim.attributes.WEIGHTS_0);

          // Normalize weights and clamp joint indices safely within skeleton
          const maxJ = Math.max(0, joints.length - 1);
          for (let v = 0; v < vertCount; v++) {
            const o = v * 4;
            primJoints[o + 0] = Math.min(maxJ, primJoints[o + 0]);
            primJoints[o + 1] = Math.min(maxJ, primJoints[o + 1]);
            primJoints[o + 2] = Math.min(maxJ, primJoints[o + 2]);
            primJoints[o + 3] = Math.min(maxJ, primJoints[o + 3]);

            const sum = primWeights[o + 0] + primWeights[o + 1] + primWeights[o + 2] + primWeights[o + 3];
            if (sum > 1e-5) {
              primWeights[o + 0] /= sum;
              primWeights[o + 1] /= sum;
              primWeights[o + 2] /= sum;
              primWeights[o + 3] /= sum;
            }
          }
          isSkinned = true;
        } else if (joints.length > 0 && nodeIdx >= 0) {
          // Rigidly attach unskinned sub-mesh (e.g. eyes/hair parented to bone) to nearest ancestor joint
          let cur = nodeIdx;
          let attachedJointIdx = -1;
          while (cur >= 0) {
            if (nodeToJoint.has(cur)) {
              attachedJointIdx = nodeToJoint.get(cur)!;
              break;
            }
            cur = nodeParent[cur];
          }

          if (attachedJointIdx >= 0) {
            // Pre-transform into ancestor joint bind space: inv(bindWorld * IBM) * nodeBindWorld
            const jointWorld = joints[attachedJointIdx].worldMatrix;
            const jointIbm = joints[attachedJointIdx].inverseBindMatrix;
            const sBind = Mat4.create();
            Mat4.multiply(jointWorld, jointIbm, sBind);
            const invSBind = Mat4.create();
            if (!Mat4.invert(sBind, invSBind)) Mat4.identity(invSBind);

            const toBindSpace = Mat4.create();
            Mat4.multiply(invSBind, nodeBindWorldMats[nodeIdx], toBindSpace);

            for (let v = 0; v < vertCount; v++) {
              const p = Mat4.transformVec4([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], 1], toBindSpace);
              positions[v * 3] = p[0];
              positions[v * 3 + 1] = p[1];
              positions[v * 3 + 2] = p[2];

              const n = Mat4.transformVec4([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2], 0], toBindSpace);
              const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
              normals[v * 3] = n[0] / nLen;
              normals[v * 3 + 1] = n[1] / nLen;
              normals[v * 3 + 2] = n[2] / nLen;
            }

            primJoints = new Uint32Array(vertCount * 4);
            primWeights = new Float32Array(vertCount * 4);
            for (let v = 0; v < vertCount; v++) {
              primJoints[v * 4] = attachedJointIdx;
              primWeights[v * 4] = 1.0;
            }
            isSkinned = true;
          }
        }

        const { material, textureImageIndex } = resolveMaterial(prim.material);
        rawEntries.push({
          prim: {
            name: mesh.name ? `${mesh.name}_${pIdx}` : `GLB_Mesh_${rawEntries.length}`,
            positions,
            normals,
            uvs,
            indices,
            joints: primJoints,
            weights: primWeights,
            boundingRadius: 1.5,
            material,
            textureImageIndex,
          },
          nodeIdx,
          isSkinned,
        });
      }
    };

    for (let nIdx = 0; nIdx < nodeCount; nIdx++) {
      const node = gltfNodes[nIdx];
      if (node.mesh !== undefined) {
        processMesh(node.mesh, nIdx, node.skin !== undefined);
      }
    }

    if (Array.isArray(gltf.meshes)) {
      for (let mIdx = 0; mIdx < gltf.meshes.length; mIdx++) {
        if (!meshesVisited.has(mIdx)) {
          processMesh(mIdx, -1, false);
        }
      }
    }

    // 5. Compute Bind-Pose World Bounds & Normalize Character Scale/Origin
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const bindSkinMats: Float32Array[] = joints.map((j) => {
      const m = Mat4.create();
      Mat4.multiply(j.worldMatrix, j.inverseBindMatrix, m);
      return m;
    });

    for (const entry of rawEntries) {
      const { prim, nodeIdx, isSkinned } = entry;
      const vertCount = Math.floor(prim.positions.length / 3);
      const staticWorld = nodeIdx >= 0 ? nodeBindWorldMats[nodeIdx] : Mat4.create();

      for (let v = 0; v < vertCount; v++) {
        const px = prim.positions[v * 3];
        const py = prim.positions[v * 3 + 1];
        const pz = prim.positions[v * 3 + 2];

        let wx = px, wy = py, wz = pz;
        if (isSkinned && prim.joints && prim.weights) {
          let sx = 0, sy = 0, sz = 0;
          let wSum = 0;
          for (let k = 0; k < 4; k++) {
            const w = prim.weights[v * 4 + k];
            if (w <= 0.0001) continue;
            const jIdx = prim.joints[v * 4 + k];
            const m = bindSkinMats[jIdx];
            if (m) {
              sx += (m[0] * px + m[4] * py + m[8] * pz + m[12]) * w;
              sy += (m[1] * px + m[5] * py + m[9] * pz + m[13]) * w;
              sz += (m[2] * px + m[6] * py + m[10] * pz + m[14]) * w;
              wSum += w;
            }
          }
          if (wSum > 0.0001) {
            wx = sx; wy = sy; wz = sz;
          }
        } else {
          const p = Mat4.transformVec4([px, py, pz, 1], staticWorld);
          wx = p[0]; wy = p[1]; wz = p[2];
        }

        if (wx < minX) minX = wx;
        if (wy < minY) minY = wy;
        if (wz < minZ) minZ = wz;
        if (wx > maxX) maxX = wx;
        if (wy > maxY) maxY = wy;
        if (wz > maxZ) maxZ = wz;
      }
    }

    const rawHeight = Number.isFinite(maxY - minY) ? Math.max(0.0001, maxY - minY) : 1.75;
    let finalHeight = rawHeight;

    const primitives: ParsedGLBPrimitive[] = rawEntries.map((e) => e.prim);
    const hasSkinning = joints.length > 0 && rawEntries.some((e) => e.isSkinned);

    if (options.normalizeToHeight && rawEntries.length > 0 && Number.isFinite(minY)) {
      const targetHeight = options.normalizeToHeight;
      const scale = targetHeight / rawHeight;
      const cx = (minX + maxX) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const tx = -cx * scale;
      const ty = -minY * scale;
      const tz = -cz * scale;
      finalHeight = targetHeight;

      if (hasSkinning) {
        // Insert synthetic root joint so all skeletal vertices + animations scale cleanly to targetHeight at Y=0
        const normRootMat = Mat4.create();
        Mat4.fromTranslationRotationScale([tx, ty, tz], [0, 0, 0, 1], [scale, scale, scale], normRootMat);

        const normRootIdx = joints.length;
        for (const joint of joints) {
          if (joint.parentIndex < 0) {
            joint.parentIndex = normRootIdx;
          }
        }

        joints.push({
          name: '__Destroyer_NormRoot__',
          parentIndex: -1,
          inverseBindMatrix: Mat4.create(),
          localMatrix: normRootMat,
          worldMatrix: new Float32Array(normRootMat),
          initialTranslation: [tx, ty, tz],
          initialRotation: [0, 0, 0, 1],
          initialScale: [scale, scale, scale],
        });
      } else {
        // Static/unskinned GLB: bake nodeBindWorld + normalization directly into vertices
        const normMat = Mat4.create();
        Mat4.fromTranslationRotationScale([tx, ty, tz], [0, 0, 0, 1], [scale, scale, scale], normMat);

        for (const entry of rawEntries) {
          const { prim, nodeIdx } = entry;
          const nodeWorld = nodeIdx >= 0 ? nodeBindWorldMats[nodeIdx] : Mat4.create();
          const finalMat = Mat4.create();
          Mat4.multiply(normMat, nodeWorld, finalMat);

          const vertCount = Math.floor(prim.positions.length / 3);
          for (let v = 0; v < vertCount; v++) {
            const p = Mat4.transformVec4(
              [prim.positions[v * 3], prim.positions[v * 3 + 1], prim.positions[v * 3 + 2], 1],
              finalMat
            );
            prim.positions[v * 3] = p[0];
            prim.positions[v * 3 + 1] = p[1];
            prim.positions[v * 3 + 2] = p[2];

            const n = Mat4.transformVec4(
              [prim.normals[v * 3], prim.normals[v * 3 + 1], prim.normals[v * 3 + 2], 0],
              finalMat
            );
            const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
            prim.normals[v * 3] = n[0] / nLen;
            prim.normals[v * 3 + 1] = n[1] / nLen;
            prim.normals[v * 3 + 2] = n[2] / nLen;
          }
        }
      }
    } else if (!hasSkinning) {
      // Unskinned without forced normalization: still apply nodeBindWorld transforms
      for (const entry of rawEntries) {
        const { prim, nodeIdx } = entry;
        if (nodeIdx < 0) continue;
        const nodeWorld = nodeBindWorldMats[nodeIdx];
        const vertCount = Math.floor(prim.positions.length / 3);
        for (let v = 0; v < vertCount; v++) {
          const p = Mat4.transformVec4(
            [prim.positions[v * 3], prim.positions[v * 3 + 1], prim.positions[v * 3 + 2], 1],
            nodeWorld
          );
          prim.positions[v * 3] = p[0];
          prim.positions[v * 3 + 1] = p[1];
          prim.positions[v * 3 + 2] = p[2];

          const n = Mat4.transformVec4(
            [prim.normals[v * 3], prim.normals[v * 3 + 1], prim.normals[v * 3 + 2], 0],
            nodeWorld
          );
          const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
          prim.normals[v * 3] = n[0] / nLen;
          prim.normals[v * 3 + 1] = n[1] / nLen;
          prim.normals[v * 3 + 2] = n[2] / nLen;
        }
      }
    }

    // Recompute bounding radii
    for (const prim of primitives) {
      prim.boundingRadius = Math.max(1.5, finalHeight);
    }

    // 6. Parse Skeletal Animation Clips
    const clips: AnimationClip[] = [];
    if (Array.isArray(gltf.animations) && joints.length > 0) {
      for (let aIdx = 0; aIdx < gltf.animations.length; aIdx++) {
        const anim = gltf.animations[aIdx];
        const channels: AnimationChannel[] = [];
        let maxDuration = 0;

        if (Array.isArray(anim.channels) && Array.isArray(anim.samplers)) {
          for (const ch of anim.channels) {
            const targetNode = ch.target?.node;
            const path = ch.target?.path;
            if (targetNode === undefined) continue;
            if (path !== 'translation' && path !== 'rotation' && path !== 'scale') continue;

            const jointIdx = nodeToJoint.get(targetNode);
            if (jointIdx === undefined) continue;

            const sampler = anim.samplers[ch.sampler];
            if (!sampler) continue;

            const times = GLBLoader.readAccessorFloat(gltf, binView, sampler.input);
            let values = GLBLoader.readAccessorFloat(gltf, binView, sampler.output);
            const compCount = path === 'rotation' ? 4 : 3;

            // Convert CUBICSPLINE (inTangent, value, outTangent) -> packed LINEAR values
            if (sampler.interpolation === 'CUBICSPLINE' && values.length >= times.length * compCount * 3) {
              const packed = new Float32Array(times.length * compCount);
              for (let k = 0; k < times.length; k++) {
                const srcBase = (k * 3 + 1) * compCount;
                const dstBase = k * compCount;
                for (let c = 0; c < compCount; c++) {
                  packed[dstBase + c] = values[srcBase + c];
                }
              }
              values = packed;
            }

            if (path === 'rotation') {
              for (let k = 0; k < times.length; k++) {
                const base = k * 4;
                const qLen = Math.hypot(values[base], values[base + 1], values[base + 2], values[base + 3]) || 1;
                values[base] /= qLen;
                values[base + 1] /= qLen;
                values[base + 2] /= qLen;
                values[base + 3] /= qLen;
              }
            }

            if (times.length > 0) {
              const lastT = times[times.length - 1];
              if (lastT > maxDuration) maxDuration = lastT;
            }

            channels.push({
              targetNode: jointIdx,
              path,
              times,
              values,
              interpolation: sampler.interpolation === 'STEP' ? 'STEP' : 'LINEAR',
            });
          }
        }

        if (channels.length > 0) {
          clips.push({
            name: anim.name || `GLB_Animation_${aIdx}`,
            duration: maxDuration > 0 ? maxDuration : 1.0,
            channels,
          });
        }
      }
    }

    return {
      primitives,
      joints,
      clips,
      textures,
      hasSkinning,
      boundingHeight: finalHeight,
    };
  }
}
