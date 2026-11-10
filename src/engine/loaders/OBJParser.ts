/**
 * Wavefront OBJ Parser & Geometry Factory
 * Parses standard OBJ text (v, vn, vt, f) into ParsedGLBPrimitive format with:
 * - Smooth normal recalculation via triangle cross-products
 * - Cylindrical/spherical UV mapping if missing
 * - Anatomical humanoid 5-joint skeletal skinning with smooth blending (hips, shoulders, limbs, torso)
 */

import { ParsedGLBPrimitive } from './GLBLoader';

export interface OBJParseOptions {
  name?: string;
  scale?: number;
  offset?: [number, number, number];
  smoothNormals?: boolean;
  humanRig?: boolean;
  defaultJointIndex?: number;
}

export class OBJParser {
  /**
   * Parse an OBJ format string into a ParsedGLBPrimitive ready for WebGPU buffering.
   */
  static parse(objText: string, options: OBJParseOptions = {}): ParsedGLBPrimitive {
    const scale = options.scale ?? 1.0;
    const offset = options.offset ?? [0, 0, 0];
    const defaultJoint = options.defaultJointIndex ?? 0;
    const isHumanRig = options.humanRig ?? true;
    const smoothNormals = options.smoothNormals ?? true;

    const rawPositions: number[] = [];
    const rawNormals: number[] = [];
    const rawUVs: number[] = [];

    const outPositions: number[] = [];
    const outNormals: number[] = [];
    const outUVs: number[] = [];
    const outIndices: number[] = [];
    const outJoints: number[] = [];
    const outWeights: number[] = [];

    // Map vertex keys "v/vt/vn" to output index to deduplicate vertices
    const vertexMap = new Map<string, number>();

    const lines = objText.split(/\r?\n/);

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l].trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      const cmd = parts[0];

      if (cmd === 'v') {
        rawPositions.push(
          parseFloat(parts[1]) * scale + offset[0],
          parseFloat(parts[2]) * scale + offset[1],
          parseFloat(parts[3]) * scale + offset[2]
        );
      } else if (cmd === 'vn') {
        rawNormals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
      } else if (cmd === 'vt') {
        rawUVs.push(parseFloat(parts[1]), parseFloat(parts[2]));
      } else if (cmd === 'f') {
        // Face polygon: triangulate fan style for quads or n-gons
        const faceIndices: number[] = [];

        for (let i = 1; i < parts.length; i++) {
          const vertStr = parts[i];
          let outIdx = vertexMap.get(vertStr);

          if (outIdx === undefined) {
            const tokens = vertStr.split('/');
            const vIdx = parseInt(tokens[0], 10) - 1;
            const vtIdx = tokens.length > 1 && tokens[1] !== '' ? parseInt(tokens[1], 10) - 1 : -1;
            const vnIdx = tokens.length > 2 && tokens[2] !== '' ? parseInt(tokens[2], 10) - 1 : -1;

            outIdx = outPositions.length / 3;

            // Position
            const px = rawPositions[vIdx * 3 + 0] ?? 0;
            const py = rawPositions[vIdx * 3 + 1] ?? 0;
            const pz = rawPositions[vIdx * 3 + 2] ?? 0;
            outPositions.push(px, py, pz);

            // Normal
            if (vnIdx >= 0 && rawNormals.length >= (vnIdx + 1) * 3) {
              outNormals.push(
                rawNormals[vnIdx * 3 + 0],
                rawNormals[vnIdx * 3 + 1],
                rawNormals[vnIdx * 3 + 2]
              );
            } else {
              outNormals.push(0, 1, 0);
            }

            // UV coordinates
            if (vtIdx >= 0 && rawUVs.length >= (vtIdx + 1) * 2) {
              outUVs.push(rawUVs[vtIdx * 2 + 0], rawUVs[vtIdx * 2 + 1]);
            } else {
              // Cylindrical mapping around Y axis
              const u = Math.atan2(px, pz) / (Math.PI * 2) + 0.5;
              const v = Math.min(1.0, Math.max(0.0, py / 1.82));
              outUVs.push(u, v);
            }

            // Skinning assignment: determine joint by anatomical position
            let j0 = defaultJoint, j1 = 0, j2 = 0, j3 = 0;
            let w0 = 1.0, w1 = 0.0, w2 = 0.0, w3 = 0.0;

            if (isHumanRig) {
              // 5-Joint Rig:
              // 0: Human_TorsoPelvis (Root, Head, Spine, Clavicle)
              // 1: Human_LeftLeg
              // 2: Human_RightLeg
              // 3: Human_LeftArm
              // 4: Human_RightArm

              if (py < 0.86) {
                // Lower Body (Legs)
                if (px < -0.015) {
                  // Left Leg
                  if (py > 0.74) {
                    // Hip transition: blend left leg with pelvis
                    const t = (0.86 - py) / 0.12;
                    j0 = 1; w0 = t;
                    j1 = 0; w1 = 1.0 - t;
                  } else {
                    j0 = 1; w0 = 1.0;
                  }
                } else if (px > 0.015) {
                  // Right Leg
                  if (py > 0.74) {
                    // Hip transition: blend right leg with pelvis
                    const t = (0.86 - py) / 0.12;
                    j0 = 2; w0 = t;
                    j1 = 0; w1 = 1.0 - t;
                  } else {
                    j0 = 2; w0 = 1.0;
                  }
                } else {
                  // Crotch / pelvic seam
                  j0 = 0; w0 = 0.6;
                  j1 = 1; w1 = 0.2;
                  j2 = 2; w2 = 0.2;
                }
              } else if (Math.abs(px) >= 0.24 && py >= 0.65 && py <= 1.42) {
                // Arms
                if (px < 0) {
                  // Left Arm
                  if (Math.abs(px) < 0.29 && py > 1.28) {
                    const t = (Math.abs(px) - 0.24) / 0.05;
                    j0 = 3; w0 = t;
                    j1 = 0; w1 = 1.0 - t;
                  } else {
                    j0 = 3; w0 = 1.0;
                  }
                } else {
                  // Right Arm
                  if (Math.abs(px) < 0.29 && py > 1.28) {
                    const t = (Math.abs(px) - 0.24) / 0.05;
                    j0 = 4; w0 = t;
                    j1 = 0; w1 = 1.0 - t;
                  } else {
                    j0 = 4; w0 = 1.0;
                  }
                }
              } else {
                // Torso, Chest, Clavicle, Neck, Head
                j0 = 0;
                w0 = 1.0;
              }
            }

            outJoints.push(j0, j1, j2, j3);
            outWeights.push(w0, w1, w2, w3);

            vertexMap.set(vertStr, outIdx);
          }

          faceIndices.push(outIdx);
        }

        // Triangulate face fan: 0, 1, 2, then 0, 2, 3, etc.
        for (let t = 1; t < faceIndices.length - 1; t++) {
          outIndices.push(faceIndices[0], faceIndices[t], faceIndices[t + 1]);
        }
      }
    }

    // Compute smooth surface normals
    if (smoothNormals && outIndices.length > 0) {
      for (let i = 0; i < outNormals.length; i++) {
        outNormals[i] = 0;
      }

      for (let i = 0; i < outIndices.length; i += 3) {
        const idx0 = outIndices[i] * 3;
        const idx1 = outIndices[i + 1] * 3;
        const idx2 = outIndices[i + 2] * 3;

        const ax = outPositions[idx0], ay = outPositions[idx0 + 1], az = outPositions[idx0 + 2];
        const bx = outPositions[idx1], by = outPositions[idx1 + 1], bz = outPositions[idx1 + 2];
        const cx = outPositions[idx2], cy = outPositions[idx2 + 1], cz = outPositions[idx2 + 2];

        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;

        outNormals[idx0] += nx; outNormals[idx0 + 1] += ny; outNormals[idx0 + 2] += nz;
        outNormals[idx1] += nx; outNormals[idx1 + 1] += ny; outNormals[idx1 + 2] += nz;
        outNormals[idx2] += nx; outNormals[idx2 + 1] += ny; outNormals[idx2 + 2] += nz;
      }

      for (let i = 0; i < outNormals.length; i += 3) {
        const nx = outNormals[i], ny = outNormals[i + 1], nz = outNormals[i + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0.00001) {
          outNormals[i] = nx / len;
          outNormals[i + 1] = ny / len;
          outNormals[i + 2] = nz / len;
        } else {
          outNormals[i] = 0;
          outNormals[i + 1] = 1;
          outNormals[i + 2] = 0;
        }
      }
    }

    // Compute accurate bounding radius centered at humanoid midpoint
    let maxDistSq = 0;
    for (let i = 0; i < outPositions.length; i += 3) {
      const x = outPositions[i];
      const y = outPositions[i + 1] - 0.91; // mid-torso height
      const z = outPositions[i + 2];
      const dSq = x * x + y * y + z * z;
      if (dSq > maxDistSq) maxDistSq = dSq;
    }

    return {
      name: options.name || 'Human_Body_OBJ_Primitive',
      positions: new Float32Array(outPositions),
      normals: new Float32Array(outNormals),
      uvs: new Float32Array(outUVs),
      indices: new Uint32Array(outIndices),
      joints: new Uint32Array(outJoints),
      weights: new Float32Array(outWeights),
      boundingRadius: Math.max(1.2, Math.sqrt(maxDistSq)),
    };
  }
}
