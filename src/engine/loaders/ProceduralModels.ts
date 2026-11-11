/**
 * Destroyer Engine - Built-in High Quality Procedural Models
 * Pre-configured with Bone Skinning, Morph Targets, and PBR Materials
 */

import { AnimationClip, MorphTargetData, SkeletonJoint } from '../core/Types';
import { ParsedGLBPrimitive } from './GLBLoader';
import { OBJParser } from './OBJParser';
import { HUMAN_BODY_OBJ_DATA } from './HumanBodyOBJ';
import { BVHLoader } from './BVHLoader';

export class ProceduralModels {
  /**
   * Generates a Skinned Sci-Fi Combat Mech with 4 skeletal joints and animation clip
   */
  static createSkinnedMech(): { primitive: ParsedGLBPrimitive; joints: SkeletonJoint[]; clip: AnimationClip } {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const jointsData: number[] = [];
    const weightsData: number[] = [];

    const addBox = (
      center: [number, number, number],
      size: [number, number, number],
      jointIdx: number
    ) => {
      const baseIdx = vertices.length / 3;
      const hx = size[0] * 0.5, hy = size[1] * 0.5, hz = size[2] * 0.5;

      const boxVerts = [
        // Front
        -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
        // Back
        -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,   hx, -hy, -hz,
        // Top
        -hx,  hy, -hz,  -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,
        // Bottom
        -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
        // Right
         hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,   hx, -hy,  hz,
        // Left
        -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
      ];

      const boxNorms = [
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
      ];

      for (let i = 0; i < boxVerts.length; i += 3) {
        vertices.push(boxVerts[i] + center[0], boxVerts[i + 1] + center[1], boxVerts[i + 2] + center[2]);
        normals.push(boxNorms[i], boxNorms[i + 1], boxNorms[i + 2]);
        uvs.push(i % 2, (i / 3) % 2);

        jointsData.push(jointIdx, 0, 0, 0);
        weightsData.push(1.0, 0.0, 0.0, 0.0);
      }

      for (let face = 0; face < 6; face++) {
        const offset = baseIdx + face * 4;
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
      }
    };

    // Joint 0: Pelvis & Legs
    addBox([0, 0.7, 0], [1.3, 0.4, 1.1], 0); // Pelvis core
    addBox([-0.65, 0.4, 0], [0.35, 0.55, 0.45], 0); // Left thigh
    addBox([0.65, 0.4, 0], [0.35, 0.55, 0.45], 0); // Right thigh
    addBox([-0.65, 0.1, 0.1], [0.55, 0.2, 0.85], 0); // Left foot
    addBox([0.65, 0.1, 0.1], [0.55, 0.2, 0.85], 0); // Right foot

    // Joint 1: Torso / Cockpit & Armor
    addBox([0, 1.5, 0], [1.7, 1.1, 1.5], 1); // Main cockpit
    addBox([0, 1.6, 0.6], [1.3, 0.6, 0.4], 1); // Angled chest plate
    addBox([0, 1.7, 0.82], [0.9, 0.18, 0.12], 1); // Cybernetic visor
    addBox([-1.15, 1.85, 0], [0.65, 0.4, 0.85], 1); // Left shoulder pauldron
    addBox([1.15, 1.85, 0], [0.65, 0.4, 0.85], 1); // Right shoulder pauldron
    addBox([-0.45, 1.75, -0.85], [0.35, 0.7, 0.45], 1); // Left exhaust thruster
    addBox([0.45, 1.75, -0.85], [0.35, 0.7, 0.45], 1); // Right exhaust thruster

    // Joint 2: Left Heavy Weapon (Rotary Vulcan Cannon)
    addBox([-1.4, 1.5, 0.2], [0.35, 0.35, 0.6], 2); // Arm actuator
    addBox([-1.4, 1.45, 0.85], [0.55, 0.55, 0.9], 2); // Gun housing
    addBox([-1.4, 1.45, 1.55], [0.3, 0.3, 0.85], 2); // Rotary barrels
    addBox([-1.75, 1.5, 0.75], [0.35, 0.55, 0.5], 2); // Ammo drum

    // Joint 3: Right Heavy Weapon (Plasma Railgun)
    addBox([1.4, 1.5, 0.2], [0.35, 0.35, 0.6], 3); // Arm actuator
    addBox([1.4, 1.5, 0.9], [0.5, 0.6, 1.3], 3); // Railgun chassis
    addBox([1.4, 1.65, 1.75], [0.12, 0.15, 1.1], 3); // Upper particle rail
    addBox([1.4, 1.35, 1.75], [0.12, 0.15, 1.1], 3); // Lower particle rail

    const joints: SkeletonJoint[] = [
      {
        name: 'Pelvis_Root',
        parentIndex: -1,
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]),
        worldMatrix: new Float32Array(16),
        initialTranslation: [0, 0, 0],
      },
      {
        name: 'Torso_Upper',
        parentIndex: 0,
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -1.15, 0, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 1.15, 0, 1]),
        worldMatrix: new Float32Array(16),
        initialTranslation: [0, 1.15, 0],
      },
      {
        name: 'Arm_Left',
        parentIndex: 1,
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  1.4, -1.5, -0.2, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -1.4, 0.35, 0.2, 1]),
        worldMatrix: new Float32Array(16),
        initialTranslation: [-1.4, 0.35, 0.2],
      },
      {
        name: 'Arm_Right',
        parentIndex: 1,
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -1.4, -1.5, -0.2, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  1.4, 0.35, 0.2, 1]),
        worldMatrix: new Float32Array(16),
        initialTranslation: [1.4, 0.35, 0.2],
      },
    ];

    const times = new Float32Array([0.0, 0.8, 1.6, 2.4, 3.2]);
    const torsoRotations = new Float32Array([
      0, 0, 0, 1,
      0, 0.18, 0, 0.983,
      0, 0, 0, 1,
      0, -0.18, 0, 0.983,
      0, 0, 0, 1,
    ]);
    const leftArmRotations = new Float32Array([
      0, 0, 0, 1,
      0.15, 0, 0, 0.988,
      0, 0, 0, 1,
      -0.12, 0, 0, 0.992,
      0, 0, 0, 1,
    ]);
    const rightArmRotations = new Float32Array([
      0, 0, 0, 1,
      -0.15, 0, 0, 0.988,
      0, 0, 0, 1,
      0.12, 0, 0, 0.992,
      0, 0, 0, 1,
    ]);

    const clip: AnimationClip = {
      name: 'Mech_Combat_Sentry',
      duration: 3.2,
      channels: [
        { targetNode: 1, path: 'rotation', times, values: torsoRotations, interpolation: 'LINEAR' },
        { targetNode: 2, path: 'rotation', times, values: leftArmRotations, interpolation: 'LINEAR' },
        { targetNode: 3, path: 'rotation', times, values: rightArmRotations, interpolation: 'LINEAR' },
      ],
    };

    const primitive: ParsedGLBPrimitive = {
      name: 'Combat_Mech_Rig',
      positions: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      joints: new Uint32Array(jointsData),
      weights: new Float32Array(weightsData),
      boundingRadius: 3.2,
      material: {
        baseColor: [0.15, 0.45, 0.85, 1.0], // Industrial cobalt blue
        emissiveColor: [0.0, 0.0, 0.0, 0.0], // Clean metallic body, no washed out glow
        roughness: 0.3,
        metallic: 0.8,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };

    return { primitive, joints, clip };
  }

  /**
   * Generates a high-tech Sci-Fi Grid Arena Floor
   */
  static createArenaFloor(size = 180, divisions = 30): ParsedGLBPrimitive {
    const half = size * 0.5;
    const step = size / divisions;
    const vertexCount = (divisions + 1) * (divisions + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(divisions * divisions * 6);

    let vIdx = 0;
    for (let z = 0; z <= divisions; z++) {
      for (let x = 0; x <= divisions; x++) {
        const px = -half + x * step;
        const pz = -half + z * step;
        positions[vIdx * 3 + 0] = px;
        positions[vIdx * 3 + 1] = 0.0;
        positions[vIdx * 3 + 2] = pz;

        normals[vIdx * 3 + 0] = 0.0;
        normals[vIdx * 3 + 1] = 1.0;
        normals[vIdx * 3 + 2] = 0.0;

        uvs[vIdx * 2 + 0] = x * 0.5;
        uvs[vIdx * 2 + 1] = z * 0.5;
        vIdx++;
      }
    }

    let iIdx = 0;
    for (let z = 0; z < divisions; z++) {
      for (let x = 0; x < divisions; x++) {
        const row1 = z * (divisions + 1);
        const row2 = (z + 1) * (divisions + 1);
        indices[iIdx++] = row1 + x;
        indices[iIdx++] = row2 + x;
        indices[iIdx++] = row1 + x + 1;

        indices[iIdx++] = row1 + x + 1;
        indices[iIdx++] = row2 + x;
        indices[iIdx++] = row2 + x + 1;
      }
    }

    return {
      name: 'Arena_Battle_Floor',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: half * 1.414,
      material: {
        baseColor: [0.12, 0.14, 0.18, 1.0],
        emissiveColor: [0.0, 0.0, 0.0, 0.0],
        roughness: 0.35,
        metallic: 0.6,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };
  }

  /**
   * Generates a Morphing Sci-Fi Geometric Core with 2 morph targets
   */
  static createMorphingCore(): { primitive: ParsedGLBPrimitive } {
    const t = (1.0 + Math.sqrt(5.0)) / 2.0;

    let initialVerts = [
      -1,  t,  0,   1,  t,  0,  -1, -t,  0,   1, -t,  0,
       0, -1,  t,   0,  1,  t,   0, -1, -t,   0,  1, -t,
       t,  0, -1,   t,  0,  1,  -t,  0, -1,  -t,  0,  1
    ];

    let initialIndices = [
      0, 11, 5,   0, 5, 1,   0, 1, 7,   0, 7, 10,  0, 10, 11,
      1, 5, 9,    5, 11, 4,  11, 10, 2, 10, 7, 6,   7, 1, 8,
      3, 9, 4,    3, 4, 2,   3, 2, 6,   3, 6, 8,   3, 8, 9,
      4, 9, 5,    2, 4, 11,  6, 2, 10,  8, 6, 7,   9, 8, 1
    ];

    for (let i = 0; i < initialVerts.length; i += 3) {
      const len = Math.hypot(initialVerts[i], initialVerts[i + 1], initialVerts[i + 2]);
      initialVerts[i] /= len;
      initialVerts[i + 1] /= len;
      initialVerts[i + 2] /= len;
    }

    const posCount = initialVerts.length / 3;
    const positions = new Float32Array(initialVerts);
    const normals = new Float32Array(initialVerts);
    const uvs = new Float32Array(posCount * 2);
    for (let i = 0; i < posCount; i++) {
      uvs[i * 2] = (positions[i * 3] + 1) * 0.5;
      uvs[i * 2 + 1] = (positions[i * 3 + 1] + 1) * 0.5;
    }

    const morphDelta0 = new Float32Array(positions.length);
    for (let i = 0; i < posCount; i++) {
      const factor = (i % 2 === 0) ? 1.4 : -0.3;
      morphDelta0[i * 3] = positions[i * 3] * factor;
      morphDelta0[i * 3 + 1] = positions[i * 3 + 1] * factor;
      morphDelta0[i * 3 + 2] = positions[i * 3 + 2] * factor;
    }

    const morphDelta1 = new Float32Array(positions.length);
    for (let i = 0; i < posCount; i++) {
      morphDelta1[i * 3] = -positions[i * 3 + 2] * 0.7;
      morphDelta1[i * 3 + 1] = Math.sin(positions[i * 3] * 4.0) * 0.6;
      morphDelta1[i * 3 + 2] = positions[i * 3] * 0.7;
    }

    const morphTargets: MorphTargetData[] = [
      { name: 'Spike_Expansion', deltaPositions: morphDelta0 },
      { name: 'Twist_Deformation', deltaPositions: morphDelta1 },
    ];

    const primitive: ParsedGLBPrimitive = {
      name: 'Morphing_Quantum_Core',
      positions,
      normals,
      uvs,
      indices: new Uint32Array(initialIndices),
      morphTargets,
      boundingRadius: 2.5,
      material: {
        baseColor: [0.95, 0.45, 0.15, 1.0], // Vibrant molten orange
        emissiveColor: [0.8, 0.3, 0.05, 0.5],
        roughness: 0.18,
        metallic: 0.92,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };

    return { primitive };
  }

  /**
   * Terrain grid for harmonic wave simulation
   */
  static createTerrainGrid(resolution = 48, size = 30): ParsedGLBPrimitive {
    const vertexCount = (resolution + 1) * (resolution + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(resolution * resolution * 6);

    const step = size / resolution;
    const halfSize = size * 0.5;

    let vIdx = 0;
    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const px = x * step - halfSize;
        const pz = z * step - halfSize;
        const py = Math.sin(px * 0.3) * Math.cos(pz * 0.3) * 0.8;

        positions[vIdx * 3] = px;
        positions[vIdx * 3 + 1] = py;
        positions[vIdx * 3 + 2] = pz;

        normals[vIdx * 3] = 0;
        normals[vIdx * 3 + 1] = 1;
        normals[vIdx * 3 + 2] = 0;

        uvs[vIdx * 2] = x / resolution;
        uvs[vIdx * 2 + 1] = z / resolution;

        vIdx++;
      }
    }

    let iIdx = 0;
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const row1 = z * (resolution + 1);
        const row2 = (z + 1) * (resolution + 1);

        indices[iIdx++] = row1 + x;
        indices[iIdx++] = row2 + x;
        indices[iIdx++] = row1 + x + 1;

        indices[iIdx++] = row1 + x + 1;
        indices[iIdx++] = row2 + x;
        indices[iIdx++] = row2 + x + 1;
      }
    }

    return {
      name: 'Harmonic_Wave_Grid',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: size * 0.75,
      material: {
        baseColor: [0.15, 0.55, 0.75, 1.0],
        emissiveColor: [0.05, 0.2, 0.4, 0.3],
        roughness: 0.15,
        metallic: 0.4,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };
  }

  static createCube(size = 1.5): ParsedGLBPrimitive {
    const positions = new Float32Array([
      -size, -size,  size,  size, -size,  size,  size,  size,  size, -size,  size,  size,
      -size, -size, -size, -size,  size, -size,  size,  size, -size,  size, -size, -size,
      -size,  size, -size, -size,  size,  size,  size,  size,  size,  size,  size, -size,
      -size, -size, -size,  size, -size, -size,  size, -size,  size, -size, -size,  size,
       size, -size, -size,  size,  size, -size,  size,  size,  size,  size, -size,  size,
      -size, -size, -size, -size, -size,  size, -size,  size,  size, -size,  size, -size,
    ]);

    const normals = new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]);

    const uvs = new Float32Array([
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
    ]);

    const indices = new Uint32Array([
      0, 1, 2,  0, 2, 3,
      4, 5, 6,  4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ]);

    return {
      name: 'Procedural_Cube',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: size * 1.732,
      material: {
        baseColor: [0.85, 0.25, 0.35, 1.0],
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.3,
        metallic: 0.8,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };
  }

  static createSphere(radius = 1.2, rings = 16, sectors = 16): ParsedGLBPrimitive {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const R = 1 / (rings - 1);
    const S = 1 / (sectors - 1);

    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < sectors; s++) {
        const y = Math.sin(-Math.PI / 2 + Math.PI * r * R);
        const x = Math.cos(2 * Math.PI * s * S) * Math.sin(Math.PI * r * R);
        const z = Math.sin(2 * Math.PI * s * S) * Math.sin(Math.PI * r * R);

        positions.push(x * radius, y * radius, z * radius);
        normals.push(x, y, z);
        uvs.push(s * S, r * R);
      }
    }

    for (let r = 0; r < rings - 1; r++) {
      for (let s = 0; s < sectors - 1; s++) {
        const i0 = r * sectors + s;
        const i1 = r * sectors + (s + 1);
        const i2 = (r + 1) * sectors + (s + 1);
        const i3 = (r + 1) * sectors + s;

        indices.push(i0, i1, i2);
        indices.push(i0, i2, i3);
      }
    }

    return {
      name: 'Procedural_Sphere',
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: radius,
      material: {
        baseColor: [0.2, 0.65, 0.95, 1.0],
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.22,
        metallic: 0.85,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };
  }

  static createSpotlightMesh(color: [number, number, number] = [1.0, 0.85, 0.4]): ParsedGLBPrimitive {
    const segments = 16;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const backR = 0.25;
    const frontR = 0.75;
    const length = 1.4;

    positions.push(0, 0, length * 0.5);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.5);

    positions.push(0, 0, -length * 0.5);
    normals.push(0, 0, -1);
    uvs.push(0.5, 0.5);

    const backRingStart = 2;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta) * backR;
      const y = Math.sin(theta) * backR;
      positions.push(x, y, length * 0.5);
      normals.push(Math.cos(theta) * 0.7, Math.sin(theta) * 0.7, 0.3);
      uvs.push((x / backR) * 0.5 + 0.5, (y / backR) * 0.5 + 0.5);
    }

    const frontRingStart = backRingStart + segments;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta) * frontR;
      const y = Math.sin(theta) * frontR;
      positions.push(x, y, -length * 0.5);
      normals.push(Math.cos(theta) * 0.8, Math.sin(theta) * 0.8, -0.2);
      uvs.push((x / frontR) * 0.5 + 0.5, (y / frontR) * 0.5 + 0.5);
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(0, backRingStart + i, backRingStart + next);
      indices.push(1, frontRingStart + next, frontRingStart + i);

      const b0 = backRingStart + i;
      const b1 = backRingStart + next;
      const f0 = frontRingStart + i;
      const f1 = frontRingStart + next;

      indices.push(b0, f0, f1);
      indices.push(b0, f1, b1);
    }

    return {
      name: 'Spotlight_Fixture',
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: Math.max(frontR, length * 0.5),
      material: {
        baseColor: [0.12, 0.12, 0.15, 1.0],
        emissiveColor: [color[0], color[1], color[2], 2.0],
        roughness: 0.2,
        metallic: 0.9,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };
  }

  static createAreaLightMesh(width = 2.5, height = 1.5, color: [number, number, number] = [0.4, 0.9, 1.0]): ParsedGLBPrimitive {
    const hw = width * 0.5;
    const hh = height * 0.5;
    const depth = 0.25;

    const positions = new Float32Array([
      -hw, -hh, -depth * 0.5,   hw, -hh, -depth * 0.5,   hw,  hh, -depth * 0.5,  -hw,  hh, -depth * 0.5,
      -hw, -hh,  depth * 0.5,  -hw,  hh,  depth * 0.5,   hw,  hh,  depth * 0.5,   hw, -hh,  depth * 0.5,
      -hw,  hh, -depth * 0.5,   hw,  hh, -depth * 0.5,   hw,  hh,  depth * 0.5,  -hw,  hh,  depth * 0.5,
      -hw, -hh, -depth * 0.5,  -hw, -hh,  depth * 0.5,   hw, -hh,  depth * 0.5,   hw, -hh, -depth * 0.5,
       hw, -hh, -depth * 0.5,   hw, -hh,  depth * 0.5,   hw,  hh,  depth * 0.5,   hw,  hh, -depth * 0.5,
      -hw, -hh, -depth * 0.5,  -hw,  hh, -depth * 0.5,  -hw,  hh,  depth * 0.5,  -hw, -hh,  depth * 0.5,
    ]);

    const normals = new Float32Array([
      0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
      0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
      0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
      0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
      1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    ]);

    const uvs = new Float32Array([
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
    ]);

    const indices = new Uint32Array([
      0, 1, 2,  0, 2, 3,
      4, 5, 6,  4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ]);

    return {
      name: 'AreaLight_Panel',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: Math.hypot(hw, hh),
      material: {
        baseColor: [0.1, 0.1, 0.12, 1.0],
        emissiveColor: [color[0], color[1], color[2], 1.5],
        roughness: 0.15,
        metallic: 0.95,
        ao: 1.0,
        alphaCutoff: 0.5
      }
    };
  }

  /**
   * Helper to construct a single box primitive centered at center with halfExtents
   */
  static createBoxPrimitive(
    center: [number, number, number],
    halfExtents: [number, number, number],
    name = 'Box_Primitive'
  ): ParsedGLBPrimitive {
    const [cx, cy, cz] = center;
    const [hx, hy, hz] = halfExtents;

    const positions = new Float32Array([
      // Front
      cx - hx, cy - hy, cz + hz,   cx + hx, cy - hy, cz + hz,   cx + hx, cy + hy, cz + hz,   cx - hx, cy + hy, cz + hz,
      // Back
      cx - hx, cy - hy, cz - hz,   cx - hx, cy + hy, cz - hz,   cx + hx, cy + hy, cz - hz,   cx + hx, cy - hy, cz - hz,
      // Top
      cx - hx, cy + hy, cz - hz,   cx - hx, cy + hy, cz + hz,   cx + hx, cy + hy, cz + hz,   cx + hx, cy + hy, cz - hz,
      // Bottom
      cx - hx, cy - hy, cz - hz,   cx + hx, cy - hy, cz - hz,   cx + hx, cy - hy, cz + hz,   cx - hx, cy - hy, cz + hz,
      // Right
      cx + hx, cy - hy, cz - hz,   cx + hx, cy + hy, cz - hz,   cx + hx, cy + hy, cz + hz,   cx + hx, cy - hy, cz + hz,
      // Left
      cx - hx, cy - hy, cz - hz,   cx - hx, cy - hy, cz + hz,   cx - hx, cy + hy, cz + hz,   cx - hx, cy + hy, cz - hz,
    ]);

    const normals = new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]);

    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
    ]);

    const indices = new Uint32Array([
      0, 1, 2,  0, 2, 3,
      4, 5, 6,  4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23,
    ]);

    return {
      name,
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: Math.hypot(hx, hy, hz),
    };
  }

  /**
   * Helper to merge multiple box primitives into a single combined static mesh
   */
  static combineBoxes(
    boxes: { center: [number, number, number]; size: [number, number, number] }[],
    name = 'Combined_Building_Mesh'
  ): ParsedGLBPrimitive {
    const allPositions: number[] = [];
    const allNormals: number[] = [];
    const allUVs: number[] = [];
    const allIndices: number[] = [];

    let vertexOffset = 0;
    let maxRadius = 0;

    for (const b of boxes) {
      const prim = ProceduralModels.createBoxPrimitive(b.center, b.size);
      
      // Calculate max distance from origin for this box
      const halfX = b.size[0] * 0.5;
      const halfY = b.size[1] * 0.5;
      const halfZ = b.size[2] * 0.5;
      const d = Math.hypot(
        Math.abs(b.center[0]) + halfX,
        Math.abs(b.center[1]) + halfY,
        Math.abs(b.center[2]) + halfZ
      );
      if (d > maxRadius) maxRadius = d;

      for (let i = 0; i < prim.positions.length; i++) {
        allPositions.push(prim.positions[i]);
      }
      for (let i = 0; i < prim.normals.length; i++) {
        allNormals.push(prim.normals[i]);
      }
      for (let i = 0; i < prim.uvs.length; i++) {
        allUVs.push(prim.uvs[i]);
      }
      for (let i = 0; i < prim.indices.length; i++) {
        allIndices.push(prim.indices[i] + vertexOffset);
      }
      vertexOffset += prim.positions.length / 3;
    }

    return {
      name,
      positions: new Float32Array(allPositions),
      normals: new Float32Array(allNormals),
      uvs: new Float32Array(allUVs),
      indices: new Uint32Array(allIndices),
      boundingRadius: maxRadius,
    };
  }

  /**
   * Generates a 3D extruded vector mesh for ASCII text labels in WebGPU world space
   */
  static create3DTextMesh(
    text: string,
    charHeight = 0.4,
    extrudeDepth = 0.06,
    name = '3D_Text_Mesh'
  ): ParsedGLBPrimitive {
    const boxes: { center: [number, number, number]; size: [number, number, number] }[] = [];

    const charWidth = charHeight * 0.6;
    const thickness = charHeight * 0.12;
    const spacing = charHeight * 0.75;
    const hx = thickness * 0.5;
    const hy = thickness * 0.5;
    const hz = extrudeDepth * 0.5;

    const uppercase = text.toUpperCase();

    for (let charIdx = 0; charIdx < uppercase.length; charIdx++) {
      const ch = uppercase[charIdx];
      const offsetX = charIdx * spacing - (uppercase.length * spacing) * 0.5;

      const addStroke = (x1: number, y1: number, x2: number, y2: number) => {
        const cx = offsetX + (x1 + x2) * 0.5 * charWidth;
        const cy = (y1 + y2) * 0.5 * charHeight;
        const sx = Math.max(hx, Math.abs(x2 - x1) * 0.5 * charWidth + hx);
        const sy = Math.max(hy, Math.abs(y2 - y1) * 0.5 * charHeight + hy);
        boxes.push({ center: [cx, cy, 0], size: [sx, sy, hz] });
      };

      switch (ch) {
        case '0':
        case 'O':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 1, 0);
          addStroke(0, 0, 0, 1);
          addStroke(1, 0, 1, 1);
          break;
        case '1':
        case 'I':
          addStroke(0.5, 0, 0.5, 1);
          break;
        case '2':
          addStroke(0, 1, 1, 1);
          addStroke(1, 0.5, 1, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(0, 0, 0, 0.5);
          addStroke(0, 0, 1, 0);
          break;
        case '3':
          addStroke(0, 1, 1, 1);
          addStroke(1, 0, 1, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(0, 0, 1, 0);
          break;
        case '4':
          addStroke(0, 0.5, 0, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(1, 0, 1, 1);
          break;
        case '5':
        case 'S':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0.5, 0, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(1, 0, 1, 0.5);
          addStroke(0, 0, 1, 0);
          break;
        case '6':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 0, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(1, 0, 1, 0.5);
          addStroke(0, 0, 1, 0);
          break;
        case '7':
          addStroke(0, 1, 1, 1);
          addStroke(1, 0, 1, 1);
          break;
        case '8':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 1, 0);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(0, 0, 0, 1);
          addStroke(1, 0, 1, 1);
          break;
        case '9':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0.5, 0, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(1, 0, 1, 1);
          addStroke(0, 0, 1, 0);
          break;
        case 'F':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 0, 1);
          addStroke(0, 0.5, 0.8, 0.5);
          break;
        case 'L':
          addStroke(0, 0, 0, 1);
          addStroke(0, 0, 1, 0);
          break;
        case 'R':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 0, 1);
          addStroke(0, 0.5, 1, 0.5);
          addStroke(1, 0.5, 1, 1);
          addStroke(0.5, 0, 1, 0.5);
          break;
        case 'E':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 0, 1);
          addStroke(0, 0.5, 0.8, 0.5);
          addStroke(0, 0, 1, 0);
          break;
        case 'A':
          addStroke(0, 1, 1, 1);
          addStroke(0, 0, 0, 1);
          addStroke(1, 0, 1, 1);
          addStroke(0, 0.5, 1, 0.5);
          break;
        case 'T':
          addStroke(0, 1, 1, 1);
          addStroke(0.5, 0, 0.5, 1);
          break;
        case '-':
          addStroke(0.2, 0.5, 0.8, 0.5);
          break;
        default:
          break;
      }
    }

    if (boxes.length === 0) {
      return ProceduralModels.createBoxPrimitive([0, 0, 0], [0.1, 0.1, 0.1], name);
    }

    return ProceduralModels.combineBoxes(boxes, name);
  }

  /**
   * Generates a 10-story skyscraper building with rooms, offices, windows, and furniture
   * Refined for accessibility with clear corridors and robust floor coverage.
   */
  static createSingleBuildingWithStairsAndElevator(): {
    buildingMesh: ParsedGLBPrimitive;
    groundSlabMesh: ParsedGLBPrimitive;
    floorButtonsMesh: ParsedGLBPrimitive;
    doorLeftMesh: ParsedGLBPrimitive;
    doorRightMesh: ParsedGLBPrimitive;
    elevatorMesh: ParsedGLBPrimitive;
    btnUpMesh: ParsedGLBPrimitive;
    btnDownMesh: ParsedGLBPrimitive;
    bannerMesh: ParsedGLBPrimitive;
    officeMesh: ParsedGLBPrimitive;
    windowMesh: ParsedGLBPrimitive;
  } {
    const buildingBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [];
    const officeBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [];
    const windowBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [];

    // 1. Massive Ground Slab
    const groundSlabMesh = ProceduralModels.createBoxPrimitive([0, -0.2, 0], [2000, 0.2, 2000], 'Massive_Ground_Slab');

    const totalFloors = 10;
    const floorHeight = 4.0;

    // 2. Build 10 Floors (Exterior & Inner Walls, Staircases, Windows)
    for (let k = 0; k < totalFloors; k++) {
      const wallY = k * floorHeight + 2.0;

      // EXTERIOR ENVELOPE (40x40m)
      buildingBoxes.push({ center: [0, wallY, -20], size: [20, 2.0, 0.4] });       // Rear
      buildingBoxes.push({ center: [-20, wallY, 0], size: [0.4, 2.0, 20] });       // Left
      buildingBoxes.push({ center: [20, wallY, 0], size: [0.4, 2.0, 20] });        // Right
      buildingBoxes.push({ center: [-12, wallY, 20], size: [8, 2.0, 0.4] });       // Front L
      buildingBoxes.push({ center: [12, wallY, 20], size: [8, 2.0, 0.4] });        // Front R
      buildingBoxes.push({ center: [0, k * floorHeight + 3.2, 20], size: [4, 0.8, 0.4] }); // Header

      // CENTRAL CORE PARTITIONS (Housing circulation) - With 3m Doorways
      // Back/Front Core Walls
      buildingBoxes.push({ center: [-5, wallY, -5], size: [2, 2.0, 0.2] });  // Back L
      buildingBoxes.push({ center: [5, wallY, -5], size: [2, 2.0, 0.2] });   // Back R
      buildingBoxes.push({ center: [-5, wallY, 15], size: [2, 2.0, 0.2] });  // Front L
      buildingBoxes.push({ center: [5, wallY, 15], size: [2, 2.0, 0.2] });   // Front R
      
      // Side Core Walls (Clearing Stair Exit)
      buildingBoxes.push({ center: [-7, wallY, 10], size: [0.2, 2.0, 5] });  // Core West (Front)
      buildingBoxes.push({ center: [7, wallY, 5], size: [0.2, 2.0, 10] });   // Core East

      // TENANT DIVIDERS (Moved to corners to clear stair path)
      buildingBoxes.push({ center: [-13, wallY, -10], size: [7, 2.0, 0.2] }); // Rear West Suite
      buildingBoxes.push({ center: [13, wallY, -10], size: [7, 2.0, 0.2] });  // Rear East Suite
      buildingBoxes.push({ center: [-15, wallY, 10], size: [5, 2.0, 0.2] });  // Front West Suite (Near Stairs but recessed)

      // WINDOW PANES
      for (let w = -15; w <= 15; w += 10) {
        if (w === 0 && k === 0) continue;
        windowBoxes.push({ center: [w, wallY, -20], size: [3.5, 1.4, 0.05] }); // Rear
        windowBoxes.push({ center: [-20, wallY, w], size: [0.05, 1.4, 3.5] }); // Left
        windowBoxes.push({ center: [20, wallY, w], size: [0.05, 1.4, 3.5] });  // Right
      }

      // OFFICE FURNITURE (Daylight Zones)
      const officePositions: [number, number][] = [
        [-17, -16], [17, -16], [-17, 16], [17, 16]
      ];

      for (const pos of officePositions) {
        const deskY = k * floorHeight + 0.75;
        officeBoxes.push({ center: [pos[0], deskY, pos[1]], size: [2.0, 0.1, 1.0] });
        officeBoxes.push({ center: [pos[0], k * floorHeight + 0.5, pos[1] + 1.2], size: [0.6, 0.1, 0.6] });
        officeBoxes.push({ center: [pos[0], deskY + 0.4, pos[1] - 0.3], size: [0.8, 0.5, 0.05] });
      }

      // STAIRCASE (X=-12, Clearing approach)
      const numSteps = 10;
      const stepRise = floorHeight / numSteps;
      const startZ = 7.0;

      for (let i = 0; i < numSteps; i++) {
        const stepY = k * floorHeight + (i + 1) * stepRise;
        const stepZ = startZ - i * 0.75;
        buildingBoxes.push({
          center: [-12.0, stepY - stepRise * 0.5, stepZ],
          size: [2.2, stepRise * 0.5, 0.375],
        });
      }
    }

    // 3. UPPER FLOOR SLABS (Robust coverage, with Stair Hole)
    for (let k = 1; k <= totalFloors; k++) {
      const slabY = k * floorHeight - 0.05;

      // Slab 1: North (Rear)
      buildingBoxes.push({ center: [0, slabY, -10.5], size: [20.0, 0.05, 9.5] });
      // Slab 2: South (Front)
      buildingBoxes.push({ center: [0, slabY, 17.5], size: [20.0, 0.05, 2.5] });
      
      // Slab 3: West Wing (Splitting for Stair Hole at X=-12, Z=[0,8])
      buildingBoxes.push({ center: [-17, slabY, 3.5], size: [3.0, 0.05, 4.5] }); // Perimeter West
      buildingBoxes.push({ center: [-12, slabY, -0.5], size: [2.2, 0.05, 0.5] }); // Bridge at stair bottom landing
      buildingBoxes.push({ center: [-8.5, slabY, 3.5], size: [1.5, 0.05, 4.5] }); // Strip between stairs and core
      
      // Slab 4: East (Elevator Wing)
      buildingBoxes.push({ center: [10, slabY, 10.0], size: [10.0, 0.05, 5.0] });
      // Slab 5: Center
      buildingBoxes.push({ center: [0, slabY, 3.5], size: [6.0, 0.05, 4.5] });
      buildingBoxes.push({ center: [0, slabY, 11.25], size: [20.0, 0.05, 3.75] });
    }

    const buildingMesh = ProceduralModels.combineBoxes(buildingBoxes, 'Physics_Skyscraper_Robust');
    const officeMesh = ProceduralModels.combineBoxes(officeBoxes, 'Office_Furniture_Collection');
    const windowMesh = ProceduralModels.combineBoxes(windowBoxes, 'Skyscraper_Windows_Glass');

    // Separate Floor Call Button Primitives - CORRIDOR side
    const floorButtonBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [];
    for (let k = 0; k < totalFloors; k++) {
      floorButtonBoxes.push({ center: [11.28, k * floorHeight + 1.6, 9.0], size: [0.05, 0.12, 0.12] });
    }
    const floorButtonsMesh = ProceduralModels.combineBoxes(floorButtonBoxes, 'Floor_Call_Buttons');

    // Dynamic Left/Right Door Panels
    const doorLeftMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [2.0, 2.0, 0.15], 'Sliding_Door_Left');
    const doorRightMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [2.0, 2.0, 0.15], 'Sliding_Door_Right');

    // Dynamic Enclosed Elevator Cab Mesh - ENLARGED
    const elevatorCabBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [
      { center: [0, 0, 0], size: [2.4, 0.15, 2.4] }, // Floor
      { center: [0, 1.4, -2.35], size: [2.4, 1.25, 0.08] }, // Rear
      { center: [-2.35, 1.4, 0], size: [0.08, 1.25, 2.4] }, // Left
      { center: [2.35, 1.4, 0], size: [0.08, 1.25, 2.4] }, // Right
      { center: [0, 2.7, 0], size: [2.4, 0.1, 2.4] }, // Roof
      { center: [-2.25, 1.4, 0.8], size: [0.05, 0.8, 0.3] },   // Panel Base on Left Wall
    ];
    const elevatorMesh = ProceduralModels.combineBoxes(elevatorCabBoxes, 'Elevator_Cab_Structure');

    const btnUpMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [0.08, 0.1, 0.1], 'Elevator_Btn_UP');
    const btnDownMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [0.08, 0.1, 0.1], 'Elevator_Btn_DOWN');

    // 5. "Workers" Banner
    const bannerMesh = ProceduralModels.create3DTextMesh('Workers', 1.0, 0.35, 'Entrance_Banner_Text');

    return {
      buildingMesh,
      groundSlabMesh,
      floorButtonsMesh,
      doorLeftMesh,
      doorRightMesh,
      elevatorMesh,
      btnUpMesh,
      btnDownMesh,
      bannerMesh,
      officeMesh,
      windowMesh,
    };
  }

  /**
   * Generates clean 4800x4800 Anarchy GTA City navigation ground plane (Asphalt Street Gray)
   */
  static createAnarchyCityGround(size = 4800): ParsedGLBPrimitive {
    const halfSize = size * 0.5;

    const positions = new Float32Array([
      -halfSize, 0, -halfSize,
       halfSize, 0, -halfSize,
       halfSize, 0,  halfSize,
      -halfSize, 0,  halfSize,
    ]);

    const normals = new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ]);

    const uvs = new Float32Array([
      0, 0,
      80, 0,
      80, 80,
      0, 80,
    ]);

    const indices = new Uint32Array([
      0, 1, 2,
      0, 2, 3,
    ]);

    return {
      name: 'Anarchy_City_NavMesh',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: halfSize * 1.414,
      material: {
        baseColor: [0.18, 0.19, 0.22, 1.0], // Noise street gray
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.82,
        metallic: 0.18,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };
  }

  /**
   * Generates a High-Rise Skyscraper / Building Block
   */
  static createSkyscraperBlock(width = 22, height = 60, depth = 22): ParsedGLBPrimitive {
    const hw = width * 0.5;
    const hh = height * 0.5;
    const hd = depth * 0.5;

    const positions = new Float32Array([
      // Front
      -hw, 0,  hd,   hw, 0,  hd,   hw, height,  hd,  -hw, height,  hd,
      // Back
      -hw, 0, -hd,  -hw, height, -hd,   hw, height, -hd,   hw, 0, -hd,
      // Top
      -hw, height, -hd,  -hw, height,  hd,   hw, height,  hd,   hw, height, -hd,
      // Right
       hw, 0, -hd,   hw, height, -hd,   hw, height,  hd,   hw, 0,  hd,
      // Left
      -hw, 0, -hd,  -hw, 0,  hd,  -hw, height,  hd,  -hw, height, -hd,
    ]);

    const normals = new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]);

    const uvs = new Float32Array([
      0, 0, 4, 0, 4, 12, 0, 12,
      0, 0, 4, 0, 4, 12, 0, 12,
      0, 0, 2, 0, 2, 2, 0, 2,
      0, 0, 4, 0, 4, 12, 0, 12,
      0, 0, 4, 0, 4, 12, 0, 12,
    ]);

    const indices = new Uint32Array([
      0, 1, 2,  0, 2, 3,
      4, 5, 6,  4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
    ]);

    return {
      name: 'City_Skyscraper_Block',
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: Math.hypot(hw, hh, hd),
      material: {
        baseColor: [0.14, 0.16, 0.22, 1.0],
        emissiveColor: [0.02, 0.04, 0.08, 0.5],
        roughness: 0.25,
        metallic: 0.8,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };
  }

  /**
   * Generates GTA Classic Muscle Car chassis geometry
   */
  static createMuscleCar(): ParsedGLBPrimitive {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const addBox = (
      center: [number, number, number],
      size: [number, number, number],
      normOverride?: [number, number, number]
    ) => {
      const baseIdx = positions.length / 3;
      const hx = size[0] * 0.5, hy = size[1] * 0.5, hz = size[2] * 0.5;

      const boxVerts = [
        -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
        -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,   hx, -hy, -hz,
        -hx,  hy, -hz,  -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,
        -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
         hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,   hx, -hy,  hz,
        -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
      ];

      for (let i = 0; i < boxVerts.length; i += 3) {
        positions.push(boxVerts[i] + center[0], boxVerts[i + 1] + center[1], boxVerts[i + 2] + center[2]);
        normals.push(normOverride ? normOverride[0] : 0, normOverride ? normOverride[1] : 1, normOverride ? normOverride[2] : 0);
        uvs.push(0, 0);
      }

      for (let face = 0; face < 6; face++) {
        const offset = baseIdx + face * 4;
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
      }
    };

    // Main Body Chassis
    addBox([0, 0.45, 0], [1.9, 0.5, 4.2]);
    // Cabin Hood / Roof
    addBox([0, 0.9, -0.2], [1.6, 0.45, 2.1]);
    // Wheels (4 corner wheels)
    addBox([-0.95, 0.3, 1.3], [0.3, 0.6, 0.6]);
    addBox([ 0.95, 0.3, 1.3], [0.3, 0.6, 0.6]);
    addBox([-0.95, 0.3, -1.3], [0.3, 0.6, 0.6]);
    addBox([ 0.95, 0.3, -1.3], [0.3, 0.6, 0.6]);

    return {
      name: 'GTA_Muscle_Car',
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: 2.5,
      material: {
        baseColor: [0.85, 0.18, 0.12, 1.0], // Crimson sport finish
        emissiveColor: [0, 0, 0, 0],
        roughness: 0.18,
        metallic: 0.88,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };
  }

  /**
   * Generates a 4-Joint Skeletal Pedestrian Character with Walk Cycle Clip
   */
  static createPedestrianHumanoid(): { primitive: ParsedGLBPrimitive; joints: SkeletonJoint[]; clip: AnimationClip } {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const jointsData: number[] = [];
    const weightsData: number[] = [];

    const addBox = (
      center: [number, number, number],
      size: [number, number, number],
      jointIdx: number
    ) => {
      const baseIdx = vertices.length / 3;
      const hx = size[0] * 0.5, hy = size[1] * 0.5, hz = size[2] * 0.5;

      const boxVerts = [
        -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
        -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,   hx, -hy, -hz,
        -hx,  hy, -hz,  -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,
        -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
         hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,   hx, -hy,  hz,
        -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
      ];

      for (let i = 0; i < boxVerts.length; i += 3) {
        vertices.push(boxVerts[i] + center[0], boxVerts[i + 1] + center[1], boxVerts[i + 2] + center[2]);
        normals.push(0, 1, 0);
        uvs.push(0, 0);
        jointsData.push(jointIdx, 0, 0, 0);
        weightsData.push(1.0, 0.0, 0.0, 0.0);
      }

      for (let face = 0; face < 6; face++) {
        const offset = baseIdx + face * 4;
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
      }
    };

    // Joint 0: Legs
    addBox([-0.2, 0.45, 0], [0.22, 0.9, 0.25], 0); // Left Leg
    addBox([ 0.2, 0.45, 0], [0.22, 0.9, 0.25], 0); // Right Leg

    // Joint 1: Torso & Head
    addBox([0, 1.25, 0], [0.55, 0.7, 0.35], 1); // Torso
    addBox([0, 1.75, 0], [0.35, 0.35, 0.35], 1); // Head

    // Joint 2: Left Arm
    addBox([-0.42, 1.25, 0], [0.18, 0.65, 0.2], 2);

    // Joint 3: Right Arm
    addBox([0.42, 1.25, 0], [0.18, 0.65, 0.2], 3);

    const idMat = () => new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]);

    const joints: SkeletonJoint[] = [
      { name: 'Pedestrian_Legs', parentIndex: -1, inverseBindMatrix: idMat(), localMatrix: idMat(), worldMatrix: idMat() },
      { name: 'Pedestrian_Torso', parentIndex: 0, inverseBindMatrix: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-1.2,0,1]), localMatrix: idMat(), worldMatrix: idMat() },
      { name: 'Pedestrian_LeftArm', parentIndex: 1, inverseBindMatrix: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0.4,-1.25,0,1]), localMatrix: idMat(), worldMatrix: idMat() },
      { name: 'Pedestrian_RightArm', parentIndex: 1, inverseBindMatrix: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -0.4,-1.25,0,1]), localMatrix: idMat(), worldMatrix: idMat() },
    ];

    const clip: AnimationClip = {
      name: 'Pedestrian_Walk_Cycle',
      duration: 1.0,
      channels: [
        {
          targetNode: 0, // Legs stride
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.25, 0.5, 0.75, 1.0]),
          values: new Float32Array([
            0, 0, 0, 1,
            0.15, 0, 0, 0.98,
            0, 0, 0, 1,
            -0.15, 0, 0, 0.98,
            0, 0, 0, 1,
          ]),
        },
        {
          targetNode: 2, // Left Arm swing
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.5, 1.0]),
          values: new Float32Array([
            -0.2, 0, 0, 0.98,
            0.2, 0, 0, 0.98,
            -0.2, 0, 0, 0.98,
          ]),
        },
        {
          targetNode: 3, // Right Arm swing
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.5, 1.0]),
          values: new Float32Array([
            0.2, 0, 0, 0.98,
            -0.2, 0, 0, 0.98,
            0.2, 0, 0, 0.98,
          ]),
        },
      ],
    };

    return {
      primitive: {
        name: 'Pedestrian_Humanoid',
        positions: new Float32Array(vertices),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
        joints: new Uint32Array(jointsData),
        weights: new Float32Array(weightsData),
        boundingRadius: 1.8,
      },
      joints,
      clip,
    };
  }

  /**
   * Generates a realistic skinned human body character mesh from Wavefront OBJ data.
   * Features anatomical human proportions: contoured head, neck, shoulders, deltoids,
   * arms, pectorals, ribcage, abdomen, pelvis, thighs, knees, calves, and feet.
   * Rigged with a 5-bone skeletal hierarchy and smooth joint weight blending.
   */
  static createHumanBodyFromOBJ(): {
    primitive: ParsedGLBPrimitive;
    joints: SkeletonJoint[];
    clip: AnimationClip;
    jumpClip: AnimationClip;
    idleClip: AnimationClip;
    allClips: AnimationClip[];
  } {
    const primitive = OBJParser.parse(HUMAN_BODY_OBJ_DATA, {
      name: 'Human_Body_Player',
      scale: 1.0,
      smoothNormals: true,
      humanRig: true,
    });

    const idMat = () => new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]);

    const joints: SkeletonJoint[] = [
      // Joint 0: Torso, Pelvis, Spine, Neck, Head (Root)
      {
        name: 'Human_TorsoPelvis',
        parentIndex: -1,
        inverseBindMatrix: idMat(),
        localMatrix: idMat(),
        worldMatrix: idMat(),
      },
      // Joint 1: Left Leg (Hip pivot at [-0.11, 0.86, 0])
      {
        name: 'Human_LeftLeg',
        parentIndex: 0,
        initialTranslation: [-0.11, 0.86, 0],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.11, -0.86, 0, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.11, 0.86, 0, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.11, 0.86, 0, 1]),
      },
      // Joint 2: Right Leg (Hip pivot at [0.11, 0.86, 0])
      {
        name: 'Human_RightLeg',
        parentIndex: 0,
        initialTranslation: [0.11, 0.86, 0],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.11, -0.86, 0, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.11, 0.86, 0, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.11, 0.86, 0, 1]),
      },
      // Joint 3: Left Arm (Shoulder pivot at [-0.32, 1.34, 0])
      {
        name: 'Human_LeftArm',
        parentIndex: 0,
        initialTranslation: [-0.32, 1.34, 0],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.32, -1.34, 0, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.32, 1.34, 0, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.32, 1.34, 0, 1]),
      },
      // Joint 4: Right Arm (Shoulder pivot at [0.32, 1.34, 0])
      {
        name: 'Human_RightArm',
        parentIndex: 0,
        initialTranslation: [0.32, 1.34, 0],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.32, -1.34, 0, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.32, 1.34, 0, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.32, 1.34, 0, 1]),
      },
    ];

    const clip: AnimationClip = {
      name: 'Human_Walk_Cycle',
      duration: 0.8,
      channels: [
        // Joint 1: Left Leg swings forward and backward
        {
          targetNode: 1,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.2, 0.4, 0.6, 0.8]),
          values: new Float32Array([
            0, 0, 0, 1,
            0.26, 0, 0, 0.965,
            0, 0, 0, 1,
            -0.26, 0, 0, 0.965,
            0, 0, 0, 1,
          ]),
        },
        // Joint 2: Right Leg swings backward and forward
        {
          targetNode: 2,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.2, 0.4, 0.6, 0.8]),
          values: new Float32Array([
            0, 0, 0, 1,
            -0.26, 0, 0, 0.965,
            0, 0, 0, 1,
            0.26, 0, 0, 0.965,
            0, 0, 0, 1,
          ]),
        },
        // Joint 3: Left Arm counter-swings
        {
          targetNode: 3,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.2, 0.4, 0.6, 0.8]),
          values: new Float32Array([
            0, 0, 0, 1,
            -0.28, 0, 0, 0.96,
            0, 0, 0, 1,
            0.28, 0, 0, 0.96,
            0, 0, 0, 1,
          ]),
        },
        // Joint 4: Right Arm counter-swings
        {
          targetNode: 4,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.2, 0.4, 0.6, 0.8]),
          values: new Float32Array([
            0, 0, 0, 1,
            0.28, 0, 0, 0.96,
            0, 0, 0, 1,
            -0.28, 0, 0, 0.96,
            0, 0, 0, 1,
          ]),
        },
      ],
    };

    const jumpClip = BVHLoader.createJumpClip();
    const idleClip = BVHLoader.createIdleClip();

    return {
      primitive,
      joints,
      clip,
      jumpClip,
      idleClip,
      allClips: [clip, jumpClip, idleClip],
    };
  }

  /**
   * Generates player character model using specialized human body OBJ data
   */
  static createSimpleHumanoidPlayer(): {
    primitive: ParsedGLBPrimitive;
    joints: SkeletonJoint[];
    clip: AnimationClip;
    jumpClip: AnimationClip;
    idleClip: AnimationClip;
    allClips: AnimationClip[];
  } {
    return ProceduralModels.createHumanBodyFromOBJ();
  }
}

