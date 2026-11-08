/**
 * Destroyer Engine - Built-in High Quality Procedural Models
 * Pre-configured with Bone Skinning, Morph Targets, and PBR Materials
 */

import { AnimationClip, MorphTargetData, SkeletonJoint } from '../core/Types';
import { ParsedGLBPrimitive } from './GLBLoader';

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
}
