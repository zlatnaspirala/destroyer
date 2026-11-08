/**
 * Destroyer Engine - Binary GLB Loader
 * Parses GLTF 2.0 binary containers into Flat GPU Primitives.
 */

import { FlatMaterial, MorphTargetData } from '../core/Types';

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
}

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

  static parse(arrayBuffer: ArrayBuffer): { primitives: ParsedGLBPrimitive[] } {
    const dataView = new DataView(arrayBuffer);
    const magic = dataView.getUint32(0, true);
    if (magic !== 0x46546c67) {
      throw new Error('Invalid GLB magic header. Expected 0x46546C67 (glTF)');
    }

    const version = dataView.getUint32(4, true);
    if (version !== 2) {
      throw new Error(`Unsupported glTF version ${version}. Only version 2.0 is supported.`);
    }

    // Chunk 0: JSON metadata
    const jsonChunkLength = dataView.getUint32(12, true);
    const jsonChunkType = dataView.getUint32(16, true);
    if (jsonChunkType !== 0x4e4f534a) {
      throw new Error('Expected JSON chunk at offset 12');
    }

    const jsonText = new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, jsonChunkLength));
    const gltf = JSON.parse(jsonText);

    // Chunk 1: Binary Buffer
    const binChunkOffset = 20 + jsonChunkLength;
    let binBuffer: ArrayBuffer | null = null;
    if (binChunkOffset < arrayBuffer.byteLength) {
      const binChunkLength = dataView.getUint32(binChunkOffset, true);
      binBuffer = arrayBuffer.slice(binChunkOffset + 8, binChunkOffset + 8 + binChunkLength);
    }

    const primitives: ParsedGLBPrimitive[] = [];

    const getAccessorData = (accessorIdx: number): { data: any; count: number; componentType: number; type: string } => {
      const acc = gltf.accessors[accessorIdx];
      const view = gltf.bufferViews[acc.bufferView];
      const byteOffset = (view.byteOffset || 0) + (acc.byteOffset || 0);

      if (!binBuffer) throw new Error('GLB missing BIN chunk');

      let data: any;
      if (acc.componentType === 5126) {
        data = new Float32Array(binBuffer, byteOffset, acc.count * (acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC4' ? 4 : 1));
      } else if (acc.componentType === 5123) {
        data = new Uint16Array(binBuffer, byteOffset, acc.count);
      } else if (acc.componentType === 5125) {
        data = new Uint32Array(binBuffer, byteOffset, acc.count);
      } else {
        data = new Uint8Array(binBuffer, byteOffset, acc.count);
      }

      return { data, count: acc.count, componentType: acc.componentType, type: acc.type };
    };

    if (gltf.meshes) {
      for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
          const posAcc = getAccessorData(prim.attributes.POSITION);
          const positions = posAcc.data instanceof Float32Array ? posAcc.data : new Float32Array(posAcc.data);

          let normals: Float32Array;
          if (prim.attributes.NORMAL !== undefined) {
            const normAcc = getAccessorData(prim.attributes.NORMAL);
            normals = normAcc.data instanceof Float32Array ? normAcc.data : new Float32Array(normAcc.data);
          } else {
            normals = new Float32Array(positions.length);
          }

          let uvs: Float32Array;
          if (prim.attributes.TEXCOORD_0 !== undefined) {
            const uvAcc = getAccessorData(prim.attributes.TEXCOORD_0);
            uvs = uvAcc.data instanceof Float32Array ? uvAcc.data : new Float32Array(uvAcc.data);
          } else {
            uvs = new Float32Array((positions.length / 3) * 2);
          }

          let indices: Uint32Array;
          if (prim.indices !== undefined) {
            const indAcc = getAccessorData(prim.indices);
            indices = indAcc.data instanceof Uint32Array ? indAcc.data : new Uint32Array(indAcc.data);
          } else {
            indices = new Uint32Array(positions.length / 3);
            for (let i = 0; i < indices.length; i++) indices[i] = i;
          }

          let joints: Uint32Array | undefined;
          let weights: Float32Array | undefined;
          if (prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined) {
            const jAcc = getAccessorData(prim.attributes.JOINTS_0);
            const wAcc = getAccessorData(prim.attributes.WEIGHTS_0);
            joints = jAcc.data instanceof Uint32Array ? jAcc.data : new Uint32Array(jAcc.data);
            weights = wAcc.data instanceof Float32Array ? wAcc.data : new Float32Array(wAcc.data);
          }

          let maxDist = 0;
          for (let i = 0; i < positions.length; i += 3) {
            const d = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
            if (d > maxDist) maxDist = d;
          }

          primitives.push({
            name: mesh.name || 'Imported_GLB_Mesh',
            positions,
            normals,
            uvs,
            indices,
            joints,
            weights,
            boundingRadius: maxDist || 1.0,
            material: {
              baseColor: [0.8, 0.8, 0.85, 1.0],
              emissiveColor: [0, 0, 0, 0],
              roughness: 0.35,
              metallic: 0.1,
              ao: 1.0,
              alphaCutoff: 0.5,
            },
          });
        }
      }
    }

    return { primitives };
  }
}
