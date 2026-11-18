/**
 * Destroyer Engine - Built-in High Quality Procedural Models
 * Pre-configured with Bone Skinning, Morph Targets, and PBR Materials
 */

import { AnimationClip, SkeletonJoint } from '../core/Types';
import { ParsedGLBPrimitive } from './GLBLoader';
import { OBJParser } from './OBJParser';
import { HUMAN_BODY_OBJ_DATA } from './HumanBodyOBJ';
import { BVHLoader } from './BVHLoader';

export interface BuildingColliderSpec {
  id: string;
  name: string;
  center: [number, number, number];
  size: [number, number, number];
  category: 'wall' | 'floor' | 'stair' | 'prop';
}

export interface SkyscraperFloorGeometry {
  floor: number;
  buildingMesh?: ParsedGLBPrimitive;
  metalTrimMesh?: ParsedGLBPrimitive;
  interiorAccentMesh?: ParsedGLBPrimitive;
  ceilingLightMesh?: ParsedGLBPrimitive;
  officeMesh?: ParsedGLBPrimitive;
  windowMesh?: ParsedGLBPrimitive;
}

export class ProceduralModels {

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

  /**
   * Generates a low-poly reinforced cargo crate mesh centered at [0,0,0] with full side size (default 0.9m)
   */
  static createPhysicsCrate(size = 0.9): ParsedGLBPrimitive {
    const prim = ProceduralModels.createCube(size * 0.5);
    return {
      ...prim,
      name: 'Moveable_Physics_Crate',
      boundingRadius: size * 0.9,
      material: {
        baseColor: [0.76, 0.48, 0.20, 1.0],
        emissiveColor: [0.06, 0.03, 0.0, 0.2],
        roughness: 0.62,
        metallic: 0.18,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };
  }

  /**
   * Generates a low-poly industrial drum/barrel mesh centered at [0,0,0]
   */
  static createPhysicsBarrel(radius = 0.38, height = 1.05, segments = 12): ParsedGLBPrimitive {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const halfH = height * 0.5;

    // Side faces
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const px = nx * radius;
      const pz = nz * radius;

      positions.push(px, -halfH, pz, px, halfH, pz);
      normals.push(nx, 0, nz, nx, 0, nz);
      uvs.push(i / segments, 0, i / segments, 1);
    }
    for (let i = 0; i < segments; i++) {
      const b0 = i * 2;
      const t0 = b0 + 1;
      const b1 = b0 + 2;
      const t1 = b0 + 3;
      indices.push(b0, b1, t0, t0, b1, t1);
    }

    // Top & bottom caps
    const addCap = (y: number, ny: number, flip: boolean) => {
      const centerIdx = positions.length / 3;
      positions.push(0, y, 0);
      normals.push(0, ny, 0);
      uvs.push(0.5, 0.5);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
        normals.push(0, ny, 0);
        uvs.push(0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
      }
      for (let i = 0; i < segments; i++) {
        const c1 = centerIdx + 1 + i;
        const c2 = centerIdx + 2 + i;
        if (flip) {
          indices.push(centerIdx, c1, c2);
        } else {
          indices.push(centerIdx, c2, c1);
        }
      }
    };
    addCap(halfH, 1, false);
    addCap(-halfH, -1, true);

    return {
      name: 'Moveable_Physics_Barrel',
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: Math.hypot(radius, halfH),
      material: {
        baseColor: [0.16, 0.62, 0.82, 1.0],
        emissiveColor: [0.02, 0.08, 0.14, 0.3],
        roughness: 0.34,
        metallic: 0.72,
        ao: 1.0,
        alphaCutoff: 0.5,
      },
    };
  }

  /**
   * Mid-level convex chamfered polyhedron cargo crate (~44 tris, mobile-optimized).
   * Generated from outward-facing flat/beveled convex hull rings so colliders remain pure AABBs.
   */
  static createConvexOctaCrate(size = 0.9): ParsedGLBPrimitive {
    const h = size * 0.5;
    const b = size * 0.34; // Inner bevel plateau
    const rings: { y: number; r: number }[] = [
      { y: -h, r: b },
      { y: -b, r: h },
      { y: b, r: h },
      { y: h, r: b },
    ];
    return ProceduralModels.buildConvexOctagonSolid(rings, 'Moveable_Convex_OctaCrate', {
      baseColor: [0.85, 0.56, 0.18, 1.0],
      emissiveColor: [0.05, 0.03, 0.0, 0.15],
      roughness: 0.44,
      metallic: 0.42,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
  }

  /**
   * Mid-level convex safety/traffic pylon cone (~48 tris, fast cylinder collider).
   */
  static createConvexHazardCone(radius = 0.34, height = 0.88): ParsedGLBPrimitive {
    const halfH = height * 0.5;
    const rings: { y: number; r: number }[] = [
      { y: -halfH, r: radius },
      { y: -halfH + 0.12, r: radius * 0.95 },
      { y: -halfH + 0.16, r: radius * 0.66 },
      { y: halfH, r: radius * 0.20 },
    ];
    return ProceduralModels.buildConvexOctagonSolid(rings, 'Moveable_Convex_HazardCone', {
      baseColor: [0.94, 0.38, 0.08, 1.0],
      emissiveColor: [0.12, 0.04, 0.01, 0.25],
      roughness: 0.48,
      metallic: 0.08,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
  }

  /**
   * Mid-level convex tapered hexagonal/octagonal office recycling bin (~32 tris).
   */
  static createConvexOfficeBin(radius = 0.30, height = 0.72): ParsedGLBPrimitive {
    const halfH = height * 0.5;
    const rings: { y: number; r: number }[] = [
      { y: -halfH, r: radius * 0.72 },
      { y: halfH - 0.08, r: radius },
      { y: halfH, r: radius * 0.92 },
    ];
    return ProceduralModels.buildConvexOctagonSolid(rings, 'Moveable_Convex_OfficeBin', {
      baseColor: [0.22, 0.52, 0.66, 1.0],
      emissiveColor: [0.01, 0.04, 0.06, 0.15],
      roughness: 0.38,
      metallic: 0.58,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
  }

  private static buildConvexOctagonSolid(
    rings: { y: number; r: number }[],
    name: string,
    material: NonNullable<ParsedGLBPrimitive['material']>
  ): ParsedGLBPrimitive {
    const sides = 8;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let maxR = 0;

    const pushTri = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      ua: [number, number],
      ub: [number, number],
      uc: [number, number]
    ) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const base = positions.length / 3;
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
      indices.push(base, base + 1, base + 2);
      for (const p of [a, b, c]) {
        const d = Math.hypot(p[0], p[1], p[2]);
        if (d > maxR) maxR = d;
      }
    };

    const ringPts = (ring: { y: number; r: number }): [number, number, number][] => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + Math.PI / 8;
        pts.push([Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r]);
      }
      return pts;
    };

    const allRings = rings.map(ringPts);

    // Side bands
    for (let r = 0; r < allRings.length - 1; r++) {
      const lower = allRings[r];
      const upper = allRings[r + 1];
      const v0 = r / (allRings.length - 1);
      const v1 = (r + 1) / (allRings.length - 1);
      for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        const u0 = i / sides;
        const u1 = (i + 1) / sides;
        pushTri(lower[i], lower[next], upper[i], [u0, v0], [u1, v0], [u0, v1]);
        pushTri(upper[i], lower[next], upper[next], [u0, v1], [u1, v0], [u1, v1]);
      }
    }

    // Bottom cap
    const bottomCenter: [number, number, number] = [0, rings[0].y, 0];
    const bottomPts = allRings[0];
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      pushTri(bottomCenter, bottomPts[next], bottomPts[i], [0.5, 0.5], [1, 0], [0, 0]);
    }

    // Top cap
    const topCenter: [number, number, number] = [0, rings[rings.length - 1].y, 0];
    const topPts = allRings[allRings.length - 1];
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      pushTri(topCenter, topPts[i], topPts[next], [0.5, 0.5], [0, 1], [1, 1]);
    }

    return {
      name,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: maxR,
      material,
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

  private static cachedSkyscraperColliderSpecs: BuildingColliderSpec[] | null = null;

  /**
   * Builds the shared architectural box layout AND matching physics colliders
   * for the modular 10-story business building (single source of truth).
   */
  private static buildSkyscraperBlueprint(): {
    floors: {
      floor: number;
      buildingBoxes: { center: [number, number, number]; size: [number, number, number] }[];
      metalTrimBoxes: { center: [number, number, number]; size: [number, number, number] }[];
      interiorAccentBoxes: { center: [number, number, number]; size: [number, number, number] }[];
      ceilingLightBoxes: { center: [number, number, number]; size: [number, number, number] }[];
      officeBoxes: { center: [number, number, number]; size: [number, number, number] }[];
      windowBoxes: { center: [number, number, number]; size: [number, number, number] }[];
    }[];
    colliders: BuildingColliderSpec[];
  } {
    type BoxSpec = { center: [number, number, number]; size: [number, number, number] };
    const totalFloors = 10;
    const floorHeight = 4.0;

    // 11 vertical story buckets: 0..9 interior stories + 10 rooftop slab/parapet/HVAC/helipad
    const floors = Array.from({ length: totalFloors + 1 }, (_, floor) => ({
      floor,
      buildingBoxes: [] as BoxSpec[],
      metalTrimBoxes: [] as BoxSpec[],
      interiorAccentBoxes: [] as BoxSpec[],
      ceilingLightBoxes: [] as BoxSpec[],
      officeBoxes: [] as BoxSpec[],
      windowBoxes: [] as BoxSpec[],
    }));
    const colliders: BuildingColliderSpec[] = [];

    const addPart = (
      visualList: BoxSpec[] | null,
      colliderCategory: BuildingColliderSpec['category'] | null,
      id: string,
      name: string,
      center: [number, number, number],
      size: [number, number, number]
    ) => {
      if (visualList) {
        visualList.push({ center, size });
      }
      if (colliderCategory) {
        colliders.push({ id, name, center, size, category: colliderCategory });
      }
    };

    // 0. Ground Entrance Plaza Apron & Portico Canopy (Floor 0)
    const f0 = floors[0];
    addPart(f0.buildingBoxes, 'floor', 'plaza_apron', 'Entrance Plaza Apron', [0, 0.04, 21.8], [6.0, 0.04, 1.8]);
    addPart(f0.metalTrimBoxes, 'wall', 'portico_canopy', 'Entrance Canopy', [0, 3.85, 22.0], [5.4, 0.14, 1.8]);
    addPart(f0.metalTrimBoxes, 'wall', 'portico_col_l', 'Portico Pillar L', [-4.8, 1.9, 23.2], [0.22, 1.9, 0.22]);
    addPart(f0.metalTrimBoxes, 'wall', 'portico_col_r', 'Portico Pillar R', [4.8, 1.9, 23.2], [0.22, 1.9, 0.22]);
    f0.ceilingLightBoxes.push({ center: [0, 3.69, 22.0], size: [3.8, 0.03, 0.2] });

    // Helper for segmented facade wall with real recessed window bays + mullions
    const addWindowedFacadeWall = (
      floorIdx: number,
      side: 'rear' | 'left' | 'right',
      fixedCoord: number
    ) => {
      const layer = floors[floorIdx];
      const baseY = floorIdx * floorHeight;
      const wallY = baseY + 2.0;
      const isZWall = side === 'rear';
      const makeCenter = (along: number, y: number): [number, number, number] =>
        isZWall ? [along, y, fixedCoord] : [fixedCoord, y, along];
      const makeSize = (halfAlong: number, halfY: number, halfThick: number): [number, number, number] =>
        isZWall ? [halfAlong, halfY, halfThick] : [halfThick, halfY, halfAlong];

      // Continuous sill & lintel header
      addPart(
        layer.buildingBoxes,
        'wall',
        `ext_${side}_sill_${floorIdx}`,
        `F${floorIdx} ${side} Sill`,
        makeCenter(0, baseY + 0.475),
        makeSize(20.4, 0.475, 0.4)
      );
      addPart(
        layer.buildingBoxes,
        'wall',
        `ext_${side}_lintel_${floorIdx}`,
        `F${floorIdx} ${side} Lintel`,
        makeCenter(0, baseY + 3.625),
        makeSize(20.4, 0.375, 0.4)
      );

      // 5 vertical structural piers framing 4 window bays at [-15, -5, 5, 15]
      const piers: { pos: number; halfW: number }[] = [
        { pos: -19.4, halfW: 1.0 },
        { pos: -10.0, halfW: 1.6 },
        { pos: 0.0, halfW: 1.6 },
        { pos: 10.0, halfW: 1.6 },
        { pos: 19.4, halfW: 1.0 },
      ];
      for (let pi = 0; pi < piers.length; pi++) {
        const p = piers[pi];
        addPart(
          layer.buildingBoxes,
          'wall',
          `ext_${side}_pier_${floorIdx}_${pi}`,
          `F${floorIdx} ${side} Pier ${pi}`,
          makeCenter(p.pos, baseY + 2.1),
          makeSize(p.halfW, 1.15, 0.4)
        );
        // Exterior vertical curtain fin on intermediate piers
        if (pi >= 1 && pi <= 3) {
          const finOffset = fixedCoord < 0 ? fixedCoord - 0.46 : fixedCoord + 0.46;
          const finCenter: [number, number, number] = isZWall
            ? [p.pos, wallY, finOffset]
            : [finOffset, wallY, p.pos];
          addPart(layer.metalTrimBoxes, null, `fin_${side}_${floorIdx}_${pi}`, '', finCenter, makeSize(0.14, 2.0, 0.08));
        }
      }

      // 4 recessed glass curtain bays with dark aluminum frames & center mullions
      const bayCenters = [-15, -5, 5, 15];
      for (let bi = 0; bi < bayCenters.length; bi++) {
        const w = bayCenters[bi];
        addPart(
          layer.windowBoxes,
          'wall',
          `win_${side}_${floorIdx}_${bi}`,
          `F${floorIdx} ${side} Glass ${bi}`,
          makeCenter(w, baseY + 2.1),
          makeSize(3.4, 1.15, 0.08)
        );
        // Frame rails + vertical mullions (flush within bay aperture)
        layer.metalTrimBoxes.push({ center: makeCenter(w, baseY + 0.99), size: makeSize(3.4, 0.05, 0.14) });
        layer.metalTrimBoxes.push({ center: makeCenter(w, baseY + 3.21), size: makeSize(3.4, 0.05, 0.14) });
        layer.metalTrimBoxes.push({ center: makeCenter(w, baseY + 2.1), size: makeSize(0.07, 1.15, 0.14) });
        layer.metalTrimBoxes.push({ center: makeCenter(w - 3.35, baseY + 2.1), size: makeSize(0.06, 1.15, 0.14) });
        layer.metalTrimBoxes.push({ center: makeCenter(w + 3.35, baseY + 2.1), size: makeSize(0.06, 1.15, 0.14) });
      }
    };

    // 1. Build 10 Floors
    for (let k = 0; k < totalFloors; k++) {
      const layer = floors[k];
      const baseY = k * floorHeight;
      const wallY = baseY + 2.0;

      // EXTERIOR FACADE WALLS (Rear, Left, Right with recessed windows)
      addWindowedFacadeWall(k, 'rear', -20);
      addWindowedFacadeWall(k, 'left', -20);
      addWindowedFacadeWall(k, 'right', 20);

      // FRONT FACADE WALL (Z = +20, with entrance opening at k=0 and sealed curtain bay at k>=1)
      // Left wing [-20.4..-4.0] and Right wing [4.0..20.4]
      for (const sideSign of [-1, 1] as const) {
        const tag = sideSign < 0 ? 'fl' : 'fr';
        addPart(
          layer.buildingBoxes,
          'wall',
          `ext_${tag}_sill_${k}`,
          `F${k} Front Sill`,
          [sideSign * 12.2, baseY + 0.475, 20],
          [8.2, 0.475, 0.4]
        );
        addPart(
          layer.buildingBoxes,
          'wall',
          `ext_${tag}_lintel_${k}`,
          `F${k} Front Lintel`,
          [sideSign * 12.2, baseY + 3.625, 20],
          [8.2, 0.375, 0.4]
        );
        // Piers along wing
        addPart(
          layer.buildingBoxes,
          'wall',
          `ext_${tag}_pier_outer_${k}`,
          `F${k} Front Pier Outer`,
          [sideSign * 19.4, baseY + 2.1, 20],
          [1.0, 1.15, 0.4]
        );
        addPart(
          layer.buildingBoxes,
          'wall',
          `ext_${tag}_pier_mid_${k}`,
          `F${k} Front Pier Mid`,
          [sideSign * 10.0, baseY + 2.1, 20],
          [1.6, 1.15, 0.4]
        );
        addPart(
          layer.buildingBoxes,
          'wall',
          `ext_${tag}_pier_door_${k}`,
          `F${k} Front Pier Door`,
          [sideSign * 4.8, baseY + 2.1, 20],
          [0.8, 1.15, 0.4]
        );
        layer.metalTrimBoxes.push({ center: [sideSign * 10.0, wallY, 20.46], size: [0.14, 2.0, 0.08] });

        // Outer bay window [+-15.0]
        addPart(
          layer.windowBoxes,
          'wall',
          `win_${tag}_outer_${k}`,
          `F${k} Front Glass Outer`,
          [sideSign * 15.0, baseY + 2.1, 20],
          [3.4, 1.15, 0.08]
        );
        layer.metalTrimBoxes.push({ center: [sideSign * 15.0, baseY + 0.99, 20], size: [3.4, 0.05, 0.14] });
        layer.metalTrimBoxes.push({ center: [sideSign * 15.0, baseY + 3.21, 20], size: [3.4, 0.05, 0.14] });
        layer.metalTrimBoxes.push({ center: [sideSign * 15.0, baseY + 2.1, 20], size: [0.07, 1.15, 0.14] });

        // Inner bay window [+-7.0, halfW=1.4]
        addPart(
          layer.windowBoxes,
          'wall',
          `win_${tag}_inner_${k}`,
          `F${k} Front Glass Inner`,
          [sideSign * 7.0, baseY + 2.1, 20],
          [1.4, 1.15, 0.08]
        );
        layer.metalTrimBoxes.push({ center: [sideSign * 7.0, baseY + 0.99, 20], size: [1.4, 0.05, 0.14] });
        layer.metalTrimBoxes.push({ center: [sideSign * 7.0, baseY + 3.21, 20], size: [1.4, 0.05, 0.14] });
        layer.metalTrimBoxes.push({ center: [sideSign * 7.0, baseY + 2.1, 20], size: [0.07, 1.15, 0.14] });
      }

      // Front center header [X = -4..4, Y = 2.4..4.0]
      addPart(layer.buildingBoxes, 'wall', `wall_arch_${k}`, `F${k} Front Arch`, [0, baseY + 3.2, 20], [4.0, 0.8, 0.4]);

      if (k === 0) {
        // Ground floor entrance side jambs leaving [-3.85..3.85] clear for sliding doors / walkway
        addPart(layer.metalTrimBoxes, 'wall', 'ent_jamb_l', 'Entrance Jamb L', [-3.92, baseY + 1.2, 20], [0.08, 1.2, 0.42]);
        addPart(layer.metalTrimBoxes, 'wall', 'ent_jamb_r', 'Entrance Jamb R', [3.92, baseY + 1.2, 20], [0.08, 1.2, 0.42]);
      } else {
        // Upper floors k=1..9: sealed front center curtain bay (no open 8m drop hole!)
        addPart(layer.buildingBoxes, 'wall', `wall_f_center_sill_${k}`, `F${k} Center Sill`, [0, baseY + 0.475, 20], [4.0, 0.475, 0.4]);
        addPart(layer.windowBoxes, 'wall', `win_f_center_${k}`, `F${k} Center Glass`, [0, baseY + 1.675, 20], [4.0, 0.725, 0.08]);
        layer.metalTrimBoxes.push({ center: [0, baseY + 0.99, 20], size: [4.0, 0.05, 0.14] });
        layer.metalTrimBoxes.push({ center: [0, baseY + 2.36, 20], size: [4.0, 0.05, 0.14] });
        layer.metalTrimBoxes.push({ center: [-1.5, baseY + 1.675, 20], size: [0.07, 0.725, 0.14] });
        layer.metalTrimBoxes.push({ center: [1.5, baseY + 1.675, 20], size: [0.07, 0.725, 0.14] });
      }

      // 4 Exterior Corner Pilasters & Horizontal Spandrel Trim Bands
      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          addPart(
            layer.metalTrimBoxes,
            'wall',
            `corner_pil_${k}_${sx}_${sz}`,
            `F${k} Corner Pilaster`,
            [sx * 20.15, wallY, sz * 20.15],
            [0.45, 2.0, 0.45]
          );
        }
      }
      if (k > 0) {
        // Horizontal architectural cornice band around floor line Y = k*4
        layer.metalTrimBoxes.push({ center: [0, baseY, -20.46], size: [20.55, 0.12, 0.08] });
        layer.metalTrimBoxes.push({ center: [0, baseY, 20.46], size: [20.55, 0.12, 0.08] });
        layer.metalTrimBoxes.push({ center: [-20.46, baseY, 0], size: [0.08, 0.12, 20.55] });
        layer.metalTrimBoxes.push({ center: [20.46, baseY, 0], size: [0.08, 0.12, 20.55] });
      }

      // CENTRAL CORE PARTITIONS (Housing circulation, 6m doorways at Z=-5 and Z=15)
      addPart(layer.buildingBoxes, 'wall', `core_bl_${k}`, `F${k} Core BL`, [-5, wallY, -5], [2.0, 2.0, 0.22]);
      addPart(layer.buildingBoxes, 'wall', `core_br_${k}`, `F${k} Core BR`, [5, wallY, -5], [2.0, 2.0, 0.22]);
      addPart(layer.buildingBoxes, 'wall', `core_fl_${k}`, `F${k} Core FL`, [-5, wallY, 15], [2.0, 2.0, 0.22]);
      addPart(layer.buildingBoxes, 'wall', `core_fr_${k}`, `F${k} Core FR`, [5, wallY, 15], [2.0, 2.0, 0.22]);
      addPart(layer.buildingBoxes, 'wall', `core_ws_${k}`, `F${k} Core W`, [-7, wallY, 10], [0.22, 2.0, 5.22]);
      addPart(layer.buildingBoxes, 'wall', `core_es_${k}`, `F${k} Core E`, [7, wallY, 5], [0.22, 2.0, 10.22]);

      // Core Doorway Headers & Slim Steel Jambs (leaves 5.76m wide doorways clear)
      for (const doorZ of [-5, 15]) {
        const tag = doorZ < 0 ? 'n' : 's';
        addPart(layer.buildingBoxes, 'wall', `core_hdr_${tag}_${k}`, `F${k} Core Header ${tag}`, [0, baseY + 3.4, doorZ], [3.0, 0.6, 0.22]);
        addPart(layer.metalTrimBoxes, 'wall', `core_jamb_l_${tag}_${k}`, `F${k} Jamb L`, [-2.96, baseY + 1.4, doorZ], [0.08, 1.4, 0.25]);
        addPart(layer.metalTrimBoxes, 'wall', `core_jamb_r_${tag}_${k}`, `F${k} Jamb R`, [2.96, baseY + 1.4, doorZ], [0.08, 1.4, 0.25]);
      }

      // TENANT DIVIDERS
      addPart(layer.buildingBoxes, 'wall', `div_nw_${k}`, `F${k} Div NW`, [-13, wallY, -10], [7.0, 2.0, 0.22]);
      addPart(layer.buildingBoxes, 'wall', `div_ne_${k}`, `F${k} Div NE`, [13, wallY, -10], [7.0, 2.0, 0.22]);
      addPart(layer.buildingBoxes, 'wall', `div_sw_${k}`, `F${k} Div SW`, [-15, wallY, 10], [5.0, 2.0, 0.22]);

      // INTERIOR STRUCTURAL COLUMNS
      const innerCols: [number, number][] = [[-7.0, -15.0], [7.0, -15.0], [-7.0, 17.5], [7.0, 17.5]];
      for (let ci = 0; ci < innerCols.length; ci++) {
        const [cx, cz] = innerCols[ci];
        addPart(layer.interiorAccentBoxes, 'wall', `int_col_${k}_${ci}`, `F${k} Column ${ci}`, [cx, wallY, cz], [0.32, 2.0, 0.32]);
        layer.metalTrimBoxes.push({ center: [cx, baseY + 0.08, cz], size: [0.36, 0.08, 0.36] });
        layer.metalTrimBoxes.push({ center: [cx, baseY + 3.92, cz], size: [0.36, 0.08, 0.36] });
      }

      // ELEVATOR CALL PANEL BACKING & SHAFT DOORWAY SURROUND
      addPart(layer.metalTrimBoxes, 'prop', `ele_panel_${k}`, `F${k} Elevator Panel`, [11.24, baseY + 1.5, 9.0], [0.08, 0.55, 0.24]);
      addPart(layer.buildingBoxes, 'wall', `ele_hdr_${k}`, `F${k} Elevator Header`, [14.0, baseY + 3.45, 12.6], [2.4, 0.55, 0.18]);
      layer.metalTrimBoxes.push({ center: [14.0, baseY + 3.85, 7.4], size: [2.4, 0.15, 0.15] });

      // OFFICE FURNITURE (Corner Executive Suites + Lounge + Filing Cabinets)
      const officePositions: [number, number][] = [[-17, -16], [17, -16], [-17, 16], [17, 16]];
      for (let i = 0; i < officePositions.length; i++) {
        const [oxp, ozp] = officePositions[i];
        const deskY = baseY + 0.75;
        addPart(layer.officeBoxes, 'prop', `desk_${k}_${i}`, `F${k} Desk ${i}`, [oxp, deskY, ozp], [2.0, 0.1, 1.0]);
        addPart(layer.metalTrimBoxes, 'prop', `desk_leg_l_${k}_${i}`, `F${k} Desk Leg L`, [oxp - 1.75, baseY + 0.325, ozp], [0.22, 0.325, 0.85]);
        addPart(layer.metalTrimBoxes, 'prop', `desk_leg_r_${k}_${i}`, `F${k} Desk Leg R`, [oxp + 1.75, baseY + 0.325, ozp], [0.22, 0.325, 0.85]);
        addPart(layer.officeBoxes, 'prop', `chair_${k}_${i}`, `F${k} Chair ${i}`, [oxp, baseY + 0.5, ozp + 1.2], [0.6, 0.1, 0.6]);
        addPart(layer.interiorAccentBoxes, 'prop', `chair_back_${k}_${i}`, `F${k} Chair Back`, [oxp, baseY + 0.85, ozp + 1.72], [0.55, 0.32, 0.08]);
        addPart(layer.officeBoxes, 'prop', `mon_${k}_${i}`, `F${k} Monitor`, [oxp, deskY + 0.4, ozp - 0.3], [0.8, 0.45, 0.06]);
      }

      // Reception counter on Floor 0; waiting bench on Floors 1..9
      if (k === 0) {
        addPart(layer.interiorAccentBoxes, 'prop', 'lobby_rec_base', 'Lobby Reception Base', [0, 0.52, 6.0], [1.8, 0.52, 0.55]);
        addPart(layer.officeBoxes, 'prop', 'lobby_rec_top', 'Lobby Reception Counter', [0, 1.09, 6.0], [1.9, 0.05, 0.65]);
      } else {
        addPart(layer.interiorAccentBoxes, 'prop', `atrium_bench_${k}`, `F${k} Atrium Bench`, [0, baseY + 0.25, 5.0], [1.6, 0.25, 0.5]);
      }

      // North Atrium Worktable + Filing Cabinets
      addPart(layer.officeBoxes, 'prop', `north_tbl_${k}`, `F${k} North Table`, [0, baseY + 0.38, -14.5], [2.0, 0.38, 0.75]);
      addPart(layer.metalTrimBoxes, 'prop', `cab_w_${k}`, `F${k} Cabinet W`, [-19.1, baseY + 0.9, -12.0], [0.45, 0.9, 1.1]);
      addPart(layer.metalTrimBoxes, 'prop', `cab_e_${k}`, `F${k} Cabinet E`, [19.1, baseY + 0.9, -12.0], [0.45, 0.9, 1.1]);

      // STAIRCASE (X=-12, Z=7.0 -> 0.25) + Side Safety Stringers/Curbs
      const numSteps = 10;
      const stepRise = floorHeight / numSteps;
      const startZ = 7.0;
      for (let i = 0; i < numSteps; i++) {
        const stepTopY = baseY + (i + 1) * stepRise;
        const stepZ = startZ - i * 0.75;
        addPart(
          layer.buildingBoxes,
          'stair',
          `stair_${k}_${i}`,
          `F${k} Step ${i}`,
          [-12.0, stepTopY - stepRise * 0.5, stepZ],
          [2.2, stepRise * 0.5, 0.375]
        );
        addPart(
          layer.metalTrimBoxes,
          'wall',
          `stair_rail_l_${k}_${i}`,
          `F${k} Stair Rail L ${i}`,
          [-14.25, stepTopY + 0.45, stepZ],
          [0.07, 0.45, 0.375]
        );
        addPart(
          layer.metalTrimBoxes,
          'wall',
          `stair_rail_r_${k}_${i}`,
          `F${k} Stair Rail R ${i}`,
          [-9.75, stepTopY + 0.45, stepZ],
          [0.07, 0.45, 0.375]
        );
      }

      // ELEVATOR SHAFT GUIDE COLUMNS per floor k (seamless vertical coverage 0..40, culled per floor)
      const shaftCols: [number, number][] = [
        [11.4, 7.4],
        [16.6, 7.4],
        [11.4, 12.6],
        [16.6, 12.6],
      ];
      for (let i = 0; i < shaftCols.length; i++) {
        const [sx, sz] = shaftCols[i];
        addPart(
          layer.metalTrimBoxes,
          'wall',
          `ele_col_${k}_${i}`,
          `F${k} Elevator Shaft Column ${i}`,
          [sx, baseY + 2.0, sz],
          [0.2, 2.0, 0.2]
        );
      }

      // CEILING LINEAR LED LIGHT STRIPS (Y = baseY + 3.88, uncollided high above head)
      layer.ceilingLightBoxes.push({ center: [0, baseY + 3.88, 1.0], size: [0.2, 0.04, 2.8] });
      layer.ceilingLightBoxes.push({ center: [0, baseY + 3.88, 10.5], size: [0.2, 0.04, 2.6] });
      layer.ceilingLightBoxes.push({ center: [14.0, baseY + 3.88, 16.5], size: [2.4, 0.04, 0.2] });
      layer.ceilingLightBoxes.push({ center: [-14.0, baseY + 3.88, -15.0], size: [2.4, 0.04, 0.2] });
      layer.ceilingLightBoxes.push({ center: [14.0, baseY + 3.88, -15.0], size: [2.4, 0.04, 0.2] });
      layer.ceilingLightBoxes.push({ center: [-14.0, baseY + 3.88, 15.5], size: [2.4, 0.04, 0.2] });
      layer.ceilingLightBoxes.push({ center: [14.0, baseY + 3.88, 15.5], size: [2.4, 0.04, 0.2] });
    }

    // 2. UPPER FLOOR SLABS (Zero gaps, zero overlaps, clean stair opening X=[-14.2,-9.8], Z=[0,7.5])
    // Assigned to floor k (for k = 1..10): floor k's floor slab = floor (k-1)'s ceiling!
    for (let k = 1; k <= totalFloors; k++) {
      const layer = floors[k];
      const slabY = k * floorHeight - 0.05;
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_N`, `F${k} Slab North`, [0, slabY, -10.5], [20.0, 0.05, 9.5]);
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_S`, `F${k} Slab South`, [0, slabY, 17.5], [20.0, 0.05, 2.5]);
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_W1`, `F${k} Slab West 1`, [-17.1, slabY, 3.25], [2.9, 0.05, 4.25]);
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_W2`, `F${k} Slab West 2`, [-12.0, slabY, -0.5], [2.2, 0.05, 0.5]);
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_W3`, `F${k} Slab West 3`, [-8.4, slabY, 3.25], [1.4, 0.05, 4.25]);
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_EC`, `F${k} Slab EastCenter`, [6.5, slabY, 3.25], [13.5, 0.05, 4.25]);
      addPart(layer.buildingBoxes, 'floor', `f_slab_${k}_C2`, `F${k} Slab Center 2`, [0, slabY, 11.25], [20.0, 0.05, 3.75]);

      // Stairwell Side Balustrades on floors 1..9 (keeps Z=7.7 stair entrance clear!)
      if (k < totalFloors) {
        addPart(layer.metalTrimBoxes, 'wall', `sw_rail_w_${k}`, `F${k} Stairwell Rail W`, [-14.25, k * floorHeight + 0.55, 3.8], [0.08, 0.55, 3.9]);
        addPart(layer.metalTrimBoxes, 'wall', `sw_rail_e_${k}`, `F${k} Stairwell Rail E`, [-9.75, k * floorHeight + 0.55, 3.8], [0.08, 0.55, 3.9]);
      }
    }

    // 3. ROOFTOP PARAPET, STAIR BULKHEAD & MECHANICAL DETAILS (Floor 10, Y = 40.0+)
    const roofLayer = floors[totalFloors];
    const roofY = totalFloors * floorHeight;
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_para_n', 'Roof Parapet N', [0, roofY + 0.575, -20], [20.4, 0.575, 0.35]);
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_para_s', 'Roof Parapet S', [0, roofY + 0.575, 20], [20.4, 0.575, 0.35]);
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_para_w', 'Roof Parapet W', [-20, roofY + 0.575, 0], [0.35, 0.575, 20.4]);
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_para_e', 'Roof Parapet E', [20, roofY + 0.575, 0], [0.35, 0.575, 20.4]);
    roofLayer.metalTrimBoxes.push({ center: [0, roofY + 1.18, -20], size: [20.5, 0.05, 0.42] });
    roofLayer.metalTrimBoxes.push({ center: [0, roofY + 1.18, 20], size: [20.5, 0.05, 0.42] });
    roofLayer.metalTrimBoxes.push({ center: [-20, roofY + 1.18, 0], size: [0.42, 0.05, 20.5] });
    roofLayer.metalTrimBoxes.push({ center: [20, roofY + 1.18, 0], size: [0.42, 0.05, 20.5] });

    // Rooftop Stairwell Bulkhead (open doorway at North Z = -1.5)
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_bh_w', 'Bulkhead West', [-14.4, roofY + 1.6, 3.25], [0.25, 1.6, 4.75]);
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_bh_e', 'Bulkhead East', [-9.6, roofY + 1.6, 3.25], [0.25, 1.6, 4.75]);
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_bh_s', 'Bulkhead South', [-12.0, roofY + 1.6, 7.8], [2.4, 1.6, 0.25]);
    addPart(roofLayer.buildingBoxes, 'wall', 'roof_bh_top', 'Bulkhead Roof', [-12.0, roofY + 3.3, 3.25], [2.65, 0.15, 5.0]);

    // Rooftop HVAC Units, Helipad Pad & Beacon Mast
    addPart(roofLayer.metalTrimBoxes, 'prop', 'roof_hvac_1', 'Roof HVAC 1', [8.0, roofY + 0.85, -10.0], [2.4, 0.85, 1.9]);
    addPart(roofLayer.interiorAccentBoxes, 'prop', 'roof_hvac_fan1', 'Roof HVAC Fan 1', [8.0, roofY + 1.78, -10.0], [1.9, 0.08, 1.4]);
    addPart(roofLayer.metalTrimBoxes, 'prop', 'roof_hvac_2', 'Roof HVAC 2', [8.0, roofY + 0.85, -4.0], [2.4, 0.85, 1.9]);
    addPart(roofLayer.interiorAccentBoxes, 'prop', 'roof_hvac_fan2', 'Roof HVAC Fan 2', [8.0, roofY + 1.78, -4.0], [1.9, 0.08, 1.4]);
    addPart(roofLayer.interiorAccentBoxes, 'floor', 'roof_helipad', 'Roof Landing Pad', [0, roofY + 0.03, 10.0], [4.5, 0.03, 4.5]);
    addPart(roofLayer.metalTrimBoxes, 'wall', 'roof_mast', 'Roof Comms Mast', [17.5, roofY + 3.0, -17.5], [0.16, 3.0, 0.16]);
    roofLayer.ceilingLightBoxes.push({ center: [17.5, roofY + 6.15, -17.5], size: [0.22, 0.15, 0.22] });

    return {
      floors,
      colliders,
    };
  }

  /**
   * Returns exact synchronized static collider specs for a single skyscraper.
   */
  static getSkyscraperColliderSpecs(): BuildingColliderSpec[] {
    if (!ProceduralModels.cachedSkyscraperColliderSpecs) {
      ProceduralModels.cachedSkyscraperColliderSpecs = ProceduralModels.buildSkyscraperBlueprint().colliders;
    }
    return ProceduralModels.cachedSkyscraperColliderSpecs;
  }

  /**
   * Generates a 10-story skyscraper building segmented per floor (0..10) for Smart Floor Culling
   * with rooms, offices, windows, architectural trim, stairs, elevator, and furniture.
   */
  static createSingleBuildingWithStairsAndElevator(): {
    floors: SkyscraperFloorGeometry[];
    groundSlabMesh: ParsedGLBPrimitive;
    floorButtonMesh: ParsedGLBPrimitive;
    doorLeftMesh: ParsedGLBPrimitive;
    doorRightMesh: ParsedGLBPrimitive;
    elevatorMesh: ParsedGLBPrimitive;
    btnUpMesh: ParsedGLBPrimitive;
    btnDownMesh: ParsedGLBPrimitive;
    bannerMesh: ParsedGLBPrimitive;
  } {
    const bp = ProceduralModels.buildSkyscraperBlueprint();
    ProceduralModels.cachedSkyscraperColliderSpecs = bp.colliders;

    // 1. Massive Ground Slab
    const groundSlabMesh = ProceduralModels.createBoxPrimitive([0, -0.2, 0], [2000, 0.2, 2000], 'Massive_Ground_Slab');

    // 2. Per-Floor Geometry Primitives (stories 0..9 + rooftop 10)
    // Note: Names intentionally use "Story_S{k}" rather than "Floor" so shadow pass renders them.
    const floors: SkyscraperFloorGeometry[] = bp.floors.map((fb) => {
      const k = fb.floor;
      const entry: SkyscraperFloorGeometry = { floor: k };
      if (fb.buildingBoxes.length > 0) {
        entry.buildingMesh = ProceduralModels.combineBoxes(fb.buildingBoxes, `Skyscraper_S${k}_Building`);
      }
      if (fb.metalTrimBoxes.length > 0) {
        entry.metalTrimMesh = ProceduralModels.combineBoxes(fb.metalTrimBoxes, `Skyscraper_S${k}_MetalTrim`);
      }
      if (fb.interiorAccentBoxes.length > 0) {
        entry.interiorAccentMesh = ProceduralModels.combineBoxes(fb.interiorAccentBoxes, `Skyscraper_S${k}_InteriorAccent`);
      }
      if (fb.ceilingLightBoxes.length > 0) {
        entry.ceilingLightMesh = ProceduralModels.combineBoxes(fb.ceilingLightBoxes, `Skyscraper_S${k}_CeilingLights`);
      }
      if (fb.officeBoxes.length > 0) {
        entry.officeMesh = ProceduralModels.combineBoxes(fb.officeBoxes, `Skyscraper_S${k}_Office`);
      }
      if (fb.windowBoxes.length > 0) {
        entry.windowMesh = ProceduralModels.combineBoxes(fb.windowBoxes, `Skyscraper_S${k}_Windows`);
      }
      return entry;
    });

    // Single reusable call button primitive (instanced per floor at [11.32, k*4 + 1.6, 9.0])
    const floorButtonMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [0.04, 0.12, 0.12], 'Floor_Call_Button');

    // Dynamic Left/Right Door Panels (framed with subtle metal trim look)
    const doorLeftMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [1.96, 1.2, 0.15], 'Sliding_Door_Left');
    const doorRightMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [1.96, 1.2, 0.15], 'Sliding_Door_Right');

    // Dynamic Enclosed Elevator Cab Mesh
    const elevatorCabBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [
      { center: [0, 0, 0], size: [2.4, 0.15, 2.4] }, // Floor
      { center: [0, 1.4, -2.35], size: [2.4, 1.25, 0.08] }, // Rear
      { center: [-2.35, 1.4, 0], size: [0.08, 1.25, 2.4] }, // Left
      { center: [2.35, 1.4, 0], size: [0.08, 1.25, 2.4] }, // Right
      { center: [0, 2.7, 0], size: [2.4, 0.1, 2.4] }, // Roof
      { center: [-2.25, 1.4, 0.8], size: [0.05, 0.8, 0.3] }, // Panel Base on Left Wall
    ];
    const elevatorMesh = ProceduralModels.combineBoxes(elevatorCabBoxes, 'Elevator_Cab_Structure');

    const btnUpMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [0.08, 0.1, 0.1], 'Elevator_Btn_UP');
    const btnDownMesh = ProceduralModels.createBoxPrimitive([0, 0, 0], [0.08, 0.1, 0.1], 'Elevator_Btn_DOWN');

    // "Workers" Banner
    const bannerMesh = ProceduralModels.create3DTextMesh('Workers', 1.0, 0.35, 'Entrance_Banner_Text');

    return {
      floors,
      groundSlabMesh,
      floorButtonMesh,
      doorLeftMesh,
      doorRightMesh,
      elevatorMesh,
      btnUpMesh,
      btnDownMesh,
      bannerMesh,
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
    const punchClip = BVHLoader.createPunchClip();

    return {
      primitive,
      joints,
      clip,
      jumpClip,
      idleClip,
      allClips: [clip, jumpClip, idleClip, punchClip],
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

  /**
   * Procedural fallback for Seated Office Woman NPC (used if worker-woman-1.glb is absent).
   * Posed sitting on the desk edge facing +Z with hips at Y~0.44m and calves dangling down to Y=0.
   * Joint 0: Pelvis/Thighs, Joint 1: Torso (spine), Joint 2: Head+Hair, Joint 3: Arms.
   */
  static createSittingOfficeWorker(): {
    primitives: ParsedGLBPrimitive[];
    joints: SkeletonJoint[];
    clips: AnimationClip[];
  } {
    const buildJointedPart = (
      boxes: { center: [number, number, number]; half: [number, number, number]; joint: number }[],
      name: string,
      baseColor: [number, number, number, number],
      roughness = 0.55
    ): ParsedGLBPrimitive => {
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const joints: number[] = [];
      const weights: number[] = [];

      for (const b of boxes) {
        const prim = ProceduralModels.createBoxPrimitive(b.center, b.half, name);
        const vOff = positions.length / 3;
        for (let i = 0; i < prim.positions.length; i++) positions.push(prim.positions[i]);
        for (let i = 0; i < prim.normals.length; i++) normals.push(prim.normals[i]);
        for (let i = 0; i < prim.uvs.length; i++) uvs.push(prim.uvs[i]);
        for (let i = 0; i < prim.indices.length; i++) indices.push(prim.indices[i] + vOff);
        const vCount = prim.positions.length / 3;
        for (let v = 0; v < vCount; v++) {
          joints.push(b.joint, 0, 0, 0);
          weights.push(1.0, 0.0, 0.0, 0.0);
        }
      }

      return {
        name,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
        joints: new Uint32Array(joints),
        weights: new Float32Array(weights),
        boundingRadius: 1.4,
        material: {
          baseColor,
          emissiveColor: [0, 0, 0, 0],
          roughness,
          metallic: 0.08,
          ao: 1.0,
          alphaCutoff: 0.5,
        },
      };
    };

    // Skirt/Slacks & Calves (Joint 0: Pelvis/Legs)
    const lowerPrim = buildJointedPart(
      [
        { center: [0, 0.50, -0.02], half: [0.18, 0.09, 0.16], joint: 0 }, // Pelvis seated
        { center: [-0.09, 0.48, 0.18], half: [0.075, 0.065, 0.18], joint: 0 }, // Left thigh forward
        { center: [0.09, 0.48, 0.18], half: [0.075, 0.065, 0.18], joint: 0 }, // Right thigh forward
        { center: [-0.09, 0.24, 0.34], half: [0.055, 0.22, 0.06], joint: 0 }, // Left calf
        { center: [0.09, 0.24, 0.34], half: [0.055, 0.22, 0.06], joint: 0 }, // Right calf
        { center: [-0.09, 0.03, 0.38], half: [0.055, 0.03, 0.09], joint: 0 }, // Left shoe
        { center: [0.09, 0.03, 0.38], half: [0.055, 0.03, 0.09], joint: 0 }, // Right shoe
      ],
      'Worker_Slacks',
      [0.14, 0.16, 0.22, 1.0],
      0.65
    );

    // Blazer Torso (Joint 1) + Arms (Joint 3)
    const blazerPrim = buildJointedPart(
      [
        { center: [0, 0.78, -0.04], half: [0.17, 0.23, 0.11], joint: 1 }, // Jacket torso
        { center: [-0.21, 0.80, 0.04], half: [0.055, 0.16, 0.06], joint: 3 }, // Left upper arm
        { center: [0.21, 0.80, 0.04], half: [0.055, 0.16, 0.06], joint: 3 }, // Right upper arm
        { center: [-0.18, 0.64, 0.16], half: [0.048, 0.05, 0.13], joint: 3 }, // Left forearm resting
        { center: [0.18, 0.64, 0.16], half: [0.048, 0.05, 0.13], joint: 3 }, // Right forearm resting
      ],
      'Worker_Blazer',
      [0.62, 0.22, 0.30, 1.0],
      0.52
    );

    // Skin Head + Hands (Joint 2 Head, Joint 3 Hands)
    const skinPrim = buildJointedPart(
      [
        { center: [0, 1.06, -0.02], half: [0.055, 0.05, 0.055], joint: 2 }, // Neck
        { center: [0, 1.19, -0.01], half: [0.10, 0.11, 0.105], joint: 2 }, // Head
        { center: [-0.16, 0.64, 0.31], half: [0.04, 0.035, 0.05], joint: 3 }, // Left hand
        { center: [0.16, 0.64, 0.31], half: [0.04, 0.035, 0.05], joint: 3 }, // Right hand
      ],
      'Worker_Skin',
      [0.88, 0.72, 0.60, 1.0],
      0.48
    );

    // Hair & Bun (Joint 2)
    const hairPrim = buildJointedPart(
      [
        { center: [0, 1.24, -0.03], half: [0.11, 0.09, 0.115], joint: 2 }, // Hair cap
        { center: [0, 1.22, -0.15], half: [0.06, 0.06, 0.06], joint: 2 }, // Hair bun
      ],
      'Worker_Hair',
      [0.24, 0.14, 0.09, 1.0],
      0.42
    );

    const idMat = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const joints: SkeletonJoint[] = [
      {
        name: 'Worker_Pelvis',
        parentIndex: -1,
        initialTranslation: [0, 0, 0],
        initialRotation: [0, 0, 0, 1],
        initialScale: [1, 1, 1],
        inverseBindMatrix: idMat(),
        localMatrix: idMat(),
        worldMatrix: idMat(),
      },
      {
        name: 'Worker_Torso',
        parentIndex: 0,
        initialTranslation: [0, 0.56, -0.04],
        initialRotation: [0, 0, 0, 1],
        initialScale: [1, 1, 1],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.56, 0.04, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.56, -0.04, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.56, -0.04, 1]),
      },
      {
        name: 'Worker_Head',
        parentIndex: 1,
        initialTranslation: [0, 0.48, 0.02],
        initialRotation: [0, 0, 0, 1],
        initialScale: [1, 1, 1],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.04, 0.02, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.48, 0.02, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.04, -0.02, 1]),
      },
      {
        name: 'Worker_Arms',
        parentIndex: 1,
        initialTranslation: [0, 0.34, 0.02],
        initialRotation: [0, 0, 0, 1],
        initialScale: [1, 1, 1],
        inverseBindMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.90, 0.02, 1]),
        localMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.34, 0.02, 1]),
        worldMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.90, -0.02, 1]),
      },
    ];

    const idleClip: AnimationClip = {
      name: 'Worker_Sitting_Idle',
      duration: 2.6,
      channels: [
        {
          targetNode: 1,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 1.3, 2.6]),
          values: new Float32Array([
            0.02, 0, 0, 0.9998,
            -0.02, 0.02, 0, 0.9996,
            0.02, 0, 0, 0.9998,
          ]),
        },
        {
          targetNode: 2,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 1.3, 2.6]),
          values: new Float32Array([
            0.03, -0.08, 0, 0.9963,
            0.01, 0.08, 0, 0.9967,
            0.03, -0.08, 0, 0.9963,
          ]),
        },
      ],
    };

    // Getting-punched seated reaction (recoil backward + defensive arms up)
    const hitClip: AnimationClip = {
      name: 'Worker_Sitting_Punched',
      duration: 0.9,
      channels: [
        {
          targetNode: 1,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.12, 0.32, 0.65, 0.9]),
          values: new Float32Array([
            0.02, 0, 0, 0.9998,
            -0.38, -0.14, 0.08, 0.910,
            -0.44, -0.18, 0.10, 0.875,
            -0.14, -0.06, 0.03, 0.988,
            0.02, 0, 0, 0.9998,
          ]),
        },
        {
          targetNode: 2,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.12, 0.32, 0.65, 0.9]),
          values: new Float32Array([
            0, 0, 0, 1,
            -0.32, -0.22, 0.12, 0.914,
            -0.25, -0.16, 0.08, 0.951,
            -0.08, -0.06, 0, 0.995,
            0, 0, 0, 1,
          ]),
        },
        {
          targetNode: 3,
          path: 'rotation',
          interpolation: 'LINEAR',
          times: new Float32Array([0, 0.12, 0.35, 0.65, 0.9]),
          values: new Float32Array([
            0, 0, 0, 1,
            -0.65, 0, 0, 0.760,
            -0.55, 0, 0, 0.835,
            -0.20, 0, 0, 0.980,
            0, 0, 0, 1,
          ]),
        },
      ],
    };

    return {
      primitives: [lowerPrim, blazerPrim, skinPrim, hairPrim],
      joints,
      clips: [idleClip, hitClip],
    };
  }
}

