/**
 * Destroyer Engine - Modular Low-Poly Whole City Builder
 * Builds mobile-friendly instanced city districts surrounding the Business Towers:
 * - Asphalt Streets, Avenues, Concrete Sidewalks, Crosswalks, Road Stripes & Streetlamps
 * - Small Houses (cozy single-story cottages with pitched gable roofs & front porches)
 * - Living Houses (2-story enterable residential homes & balconies with furnished interiors)
 * - Gas Stations (forecourt canopy, 4 columns, 4 fuel pumps, neon totem, enterable mini-mart)
 * Every structural wall, roof, column, curb, pump, and furniture piece includes a 1:1 rotated AABB collider.
 */

import { FlatMaterial } from '../core/Types';
import { ParsedGLBPrimitive } from './GLBLoader';
import { BuildingColliderSpec, ProceduralModels } from './ProceduralModels';

export interface CityMeshDef {
  key: string;
  prim: ParsedGLBPrimitive;
  defaultMaterial: FlatMaterial;
  boundingRadius: number;
}

export interface CityPlacement {
  meshKey: string;
  materialKey?: string;
  position: [number, number, number];
  rotationY: number;
  scale?: [number, number, number];
  name: string;
  sphereRadius: number;
}

export interface CityMaterialDef {
  key: string;
  material: FlatMaterial;
}

export interface CityCarSpawn {
  id: string;
  name: string;
  position: [number, number, number];
  rotationY: number;
  paintMat: string;
  sector?: 'NORTH' | 'SOUTH';
  alwaysPatrol?: boolean;
}

export interface CityCCTVCamSpawn {
  id: string;
  name: string;
  pos: [number, number, number];
  baseRotY: number;
}

export interface CityBillboardSpawn {
  id: string;
  name: string;
  position: [number, number, number];
  rotationY: number;
}

export interface CityWorldData {
  meshes: CityMeshDef[];
  materials: CityMaterialDef[];
  placements: CityPlacement[];
  colliders: BuildingColliderSpec[];
  cars: CityCarSpawn[];
  policeCars: CityCarSpawn[];
  cctvCameras: CityCCTVCamSpawn[];
  billboards: CityBillboardSpawn[];
  gunShopCounterPos: [number, number, number];
  policeJailCellPos: [number, number, number];
  maxPrisonCellPos: [number, number, number];
  propSpawns: {
    kind: 'crate' | 'barrel' | 'octacrate' | 'cone' | 'bin';
    name: string;
    pos: [number, number, number];
    mass: number;
    restitution: number;
  }[];
}

export class CityBuilder {
  private static createBoxMesh(
    name: string,
    center: [number, number, number],
    size: [number, number, number]
  ): ParsedGLBPrimitive {
    const prim = ProceduralModels.createBoxPrimitive(center, size, name);
    const rad =
      Math.hypot(
        Math.abs(center[0]) + size[0],
        Math.abs(center[1]) + size[1],
        Math.abs(center[2]) + size[2]
      ) + 0.5;
    return { ...prim, boundingRadius: rad };
  }

  /**
   * Builds a double-sided billboard screen box with upright canvas-aligned UVs (v=0 at top, v=1 at bottom)
   * so dynamic WANTED posters & city ads render crisp and un-inverted.
   */
  private static createBillboardScreenMesh(
    name: string,
    centerY: number,
    halfW: number,
    halfH: number,
    halfD: number
  ): ParsedGLBPrimitive {
    const positions = new Float32Array([
      // Front (+Z): bottom-left, bottom-right, top-right, top-left
      -halfW, centerY - halfH, halfD,
       halfW, centerY - halfH, halfD,
       halfW, centerY + halfH, halfD,
      -halfW, centerY + halfH, halfD,
      // Back (-Z): bottom-right(-X?), looking from -Z: right=+X is left edge, left=-X is right edge
       halfW, centerY - halfH, -halfD,
      -halfW, centerY - halfH, -halfD,
      -halfW, centerY + halfH, -halfD,
       halfW, centerY + halfH, -halfD,
    ]);
    const normals = new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    ]);
    // Canvas top is row 0 (v=0), canvas bottom is row H (v=1); inset slightly from 1.0 so WGSL fract() never wraps
    const uvs = new Float32Array([
      0.002, 0.998,  0.998, 0.998,  0.998, 0.002,  0.002, 0.002,
      0.002, 0.998,  0.998, 0.998,  0.998, 0.002,  0.002, 0.002,
    ]);
    const indices = new Uint32Array([
      0, 1, 2,  0, 2, 3,
      4, 5, 6,  4, 6, 7,
    ]);
    return {
      name,
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: Math.hypot(halfW, halfH, halfD) + 1.0,
    };
  }

  /**
   * Builds a genuine low-poly 3D triangular gable roof prism centered around [centerX, baseY, centerZ]
   * with outward normals (24 triangles total).
   */
  private static createGableRoofMesh(
    name: string,
    halfWidthX: number,
    baseY: number,
    peakHeight: number,
    halfDepthZ: number
  ): ParsedGLBPrimitive {
    const hw = halfWidthX;
    const hd = halfDepthZ;
    const topY = baseY + peakHeight;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const pushTri = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number]
    ) => {
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      const baseIdx = positions.length / 3;
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      uvs.push(0, 0, 1, 0, 0.5, 1);
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    };

    const fl: [number, number, number] = [-hw, baseY, hd];
    const fr: [number, number, number] = [hw, baseY, hd];
    const bl: [number, number, number] = [-hw, baseY, -hd];
    const br: [number, number, number] = [hw, baseY, -hd];
    const fp: [number, number, number] = [0, topY, hd];
    const bp: [number, number, number] = [0, topY, -hd];

    // Front & Back gable triangles
    pushTri(fl, fr, fp);
    pushTri(br, bl, bp);

    // Left slope (fl, fp, bp, bl)
    pushTri(fl, fp, bp);
    pushTri(fl, bp, bl);

    // Right slope (fr, br, bp, fp)
    pushTri(fr, br, bp);
    pushTri(fr, bp, fp);

    // Bottom soffit cap
    pushTri(fl, bl, br);
    pushTri(fl, br, fr);

    return {
      name,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: Math.hypot(hw, topY, hd) + 0.5,
    };
  }

  /**
   * Generates a 3D prism sloped wedge (e.g. car windshield / fastback rear window)
   */
  private static createSlopedBlock(
    name: string,
    cx: number,
    yBot: number,
    yTop: number,
    zBotBack: number,
    zBotFront: number,
    zTopBack: number,
    zTopFront: number,
    halfW: number
  ): ParsedGLBPrimitive {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const pushQuad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number]
    ) => {
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      const base = positions.length / 3;
      positions.push(
        a[0], a[1], a[2],
        b[0], b[1], b[2],
        c[0], c[1], c[2],
        d[0], d[1], d[2]
      );
      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    const flb: [number, number, number] = [cx - halfW, yBot, zBotFront];
    const frb: [number, number, number] = [cx + halfW, yBot, zBotFront];
    const blb: [number, number, number] = [cx - halfW, yBot, zBotBack];
    const brb: [number, number, number] = [cx + halfW, yBot, zBotBack];

    const flt: [number, number, number] = [cx - halfW, yTop, zTopFront];
    const frt: [number, number, number] = [cx + halfW, yTop, zTopFront];
    const blt: [number, number, number] = [cx - halfW, yTop, zTopBack];
    const brt: [number, number, number] = [cx + halfW, yTop, zTopBack];

    pushQuad(flt, frt, brt, blt); // Roof
    pushQuad(flb, frb, frt, flt); // Sloped Front Windshield
    pushQuad(brb, blb, blt, brt); // Sloped Rear Window
    pushQuad(blb, flb, flt, blt); // Left Side
    pushQuad(frb, brb, brt, frt); // Right Side
    pushQuad(blb, brb, frb, flb); // Bottom

    return {
      name,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: Math.hypot(halfW, yTop, Math.max(Math.abs(zBotFront), Math.abs(zBotBack))) + 0.3,
    };
  }

  /**
   * Generates a horizontal X-aligned wheel cylinder mesh at specified positions & radius/width
   */
  private static createWheelsMesh(
    name: string,
    wheelCenters: [number, number, number][],
    radius: number,
    halfWidthX: number,
    segments = 14
  ): ParsedGLBPrimitive {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (const [cx, cy, cz] of wheelCenters) {
      const startBase = positions.length / 3;
      // Outer tread cylinder ring
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const ny = Math.sin(a);
        const nz = Math.cos(a);
        const py = cy + ny * radius;
        const pz = cz + nz * radius;
        positions.push(cx - halfWidthX, py, pz, cx + halfWidthX, py, pz);
        normals.push(0, ny, nz, 0, ny, nz);
        uvs.push(i / segments, 0, i / segments, 1);
      }
      for (let i = 0; i < segments; i++) {
        const b0 = startBase + i * 2;
        const b1 = b0 + 1;
        const n0 = b0 + 2;
        const n1 = b0 + 3;
        indices.push(b0, b1, n0, n0, b1, n1);
      }

      // Left & Right Wheel Sidewalls
      for (const side of [-1, 1] as const) {
        const capX = cx + side * halfWidthX;
        const cIdx = positions.length / 3;
        positions.push(capX, cy, cz);
        normals.push(side, 0, 0);
        uvs.push(0.5, 0.5);
        for (let i = 0; i <= segments; i++) {
          const a = (i / segments) * Math.PI * 2;
          const ny = Math.sin(a);
          const nz = Math.cos(a);
          positions.push(capX, cy + ny * radius, cz + nz * radius);
          normals.push(side, 0, 0);
          uvs.push(0.5 + 0.5 * nz, 0.5 + 0.5 * ny);
        }
        for (let i = 0; i < segments; i++) {
          const p1 = cIdx + 1 + i;
          const p2 = cIdx + 2 + i;
          if (side > 0) indices.push(cIdx, p1, p2);
          else indices.push(cIdx, p2, p1);
        }
      }
    }

    return {
      name,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint32Array(indices),
      boundingRadius: 2.5,
    };
  }

  private static mergePrimitives(prims: ParsedGLBPrimitive[], name: string): ParsedGLBPrimitive {
    let totalVerts = 0;
    let totalIdx = 0;
    for (const p of prims) {
      totalVerts += p.positions.length / 3;
      totalIdx += p.indices.length;
    }
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const indices = new Uint32Array(totalIdx);

    let vOff = 0;
    let iOff = 0;
    let maxR = 1.0;
    for (const p of prims) {
      positions.set(p.positions, vOff * 3);
      normals.set(p.normals, vOff * 3);
      uvs.set(p.uvs, vOff * 2);
      for (let i = 0; i < p.indices.length; i++) {
        indices[iOff + i] = p.indices[i] + vOff;
      }
      vOff += p.positions.length / 3;
      iOff += p.indices.length;
      if (p.boundingRadius > maxR) maxR = p.boundingRadius;
    }

    return {
      name,
      positions,
      normals,
      uvs,
      indices,
      boundingRadius: maxR,
    };
  }

  /**
   * Transform a local collider box by world translation + Y rotation (exact AABB for 90-deg city grid angles)
   */
  private static transformCollider(
    prefix: string,
    spec: BuildingColliderSpec,
    pos: [number, number, number],
    rotY: number
  ): BuildingColliderSpec {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const [lx, ly, lz] = spec.center;
    const [hx, hy, hz] = spec.size;

    const wx = pos[0] + lx * c + lz * s;
    const wy = pos[1] + ly;
    const wz = pos[2] - lx * s + lz * c;

    const rhx = Math.abs(hx * c) + Math.abs(hz * s);
    const rhz = Math.abs(hx * s) + Math.abs(hz * c);

    return {
      id: `${prefix}_${spec.id}`,
      name: `${prefix} ${spec.name}`,
      center: [wx, wy, wz],
      size: [rhx, hy, rhz],
      category: spec.category,
    };
  }

  static buildWholeCity(): CityWorldData {
    const meshes: CityMeshDef[] = [];
    const materials: CityMaterialDef[] = [];
    const placements: CityPlacement[] = [];
    const colliders: BuildingColliderSpec[] = [];

    const regMat = (key: string, material: FlatMaterial) => {
      materials.push({ key, material });
    };

    // ==================== 1. SHARED CHEAP CITY MATERIALS ====================
    regMat('asphalt', {
      baseColor: [0.085, 0.09, 0.105, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.90,
      metallic: 0.02,
      ao: 1.0,
      alphaCutoff: 0.5,
      flags: 8,
    });
    regMat('sidewalk', {
      baseColor: [0.70, 0.72, 0.76, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.80,
      metallic: 0.04,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('road_white', {
      baseColor: [0.95, 0.96, 0.98, 1.0],
      emissiveColor: [0.08, 0.08, 0.08, 0.12],
      roughness: 0.55,
      metallic: 0.0,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('road_yellow', {
      baseColor: [0.96, 0.76, 0.14, 1.0],
      emissiveColor: [0.12, 0.08, 0.0, 0.18],
      roughness: 0.55,
      metallic: 0.0,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('lamp_pole', {
      baseColor: [0.22, 0.25, 0.29, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.35,
      metallic: 0.85,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('lamp_glow', {
      baseColor: [1.0, 0.94, 0.78, 1.0],
      emissiveColor: [1.0, 0.88, 0.55, 1.3],
      roughness: 0.2,
      metallic: 0.1,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    // House walls (cream stucco, warm brick, cool blue-gray, sage plaster)
    regMat('wall_cream', {
      baseColor: [0.88, 0.84, 0.75, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.78,
      metallic: 0.02,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('wall_sage', {
      baseColor: [0.68, 0.77, 0.70, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.76,
      metallic: 0.02,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('wall_slate', {
      baseColor: [0.64, 0.70, 0.78, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.74,
      metallic: 0.05,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('wall_terracotta', {
      baseColor: [0.80, 0.58, 0.48, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.78,
      metallic: 0.02,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    // Roofs & Trim
    regMat('roof_terracotta', {
      baseColor: [0.66, 0.28, 0.20, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.72,
      metallic: 0.05,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('roof_slate', {
      baseColor: [0.24, 0.28, 0.34, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.65,
      metallic: 0.15,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('wood_door', {
      baseColor: [0.42, 0.24, 0.14, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.62,
      metallic: 0.05,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('window_warm', {
      baseColor: [0.55, 0.74, 0.88, 1.0],
      emissiveColor: [0.45, 0.38, 0.22, 0.35],
      roughness: 0.15,
      metallic: 0.8,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    // Gas Station Materials
    regMat('gas_canopy', {
      baseColor: [0.92, 0.94, 0.97, 1.0],
      emissiveColor: [0.06, 0.08, 0.12, 0.2],
      roughness: 0.32,
      metallic: 0.55,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('gas_brand_red', {
      baseColor: [0.88, 0.16, 0.18, 1.0],
      emissiveColor: [0.45, 0.06, 0.06, 0.55],
      roughness: 0.35,
      metallic: 0.25,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('gas_brand_cyan', {
      baseColor: [0.12, 0.76, 0.92, 1.0],
      emissiveColor: [0.05, 0.45, 0.58, 0.65],
      roughness: 0.28,
      metallic: 0.3,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('tree_foliage', {
      baseColor: [0.22, 0.52, 0.24, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.85,
      metallic: 0.02,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('sofa_fabric', {
      baseColor: [0.26, 0.38, 0.52, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.85,
      metallic: 0.02,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    // Urban Mid-Rise Towers & Shops Materials
    regMat('tower_glass_blue', {
      baseColor: [0.22, 0.34, 0.46, 1.0],
      emissiveColor: [0.05, 0.10, 0.18, 0.2],
      roughness: 0.14,
      metallic: 0.85,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('tower_stone_gray', {
      baseColor: [0.56, 0.58, 0.62, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.70,
      metallic: 0.12,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('tower_stone_tan', {
      baseColor: [0.72, 0.66, 0.56, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.72,
      metallic: 0.08,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('shop_awning_green', {
      baseColor: [0.16, 0.58, 0.38, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.55,
      metallic: 0.05,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    // Automotive Car Materials
    regMat('car_paint_crimson', {
      baseColor: [0.86, 0.12, 0.16, 1.0],
      emissiveColor: [0.04, 0.0, 0.0, 0.1],
      roughness: 0.18,
      metallic: 0.82,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_paint_cobalt', {
      baseColor: [0.12, 0.44, 0.88, 1.0],
      emissiveColor: [0.0, 0.02, 0.06, 0.1],
      roughness: 0.18,
      metallic: 0.82,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_paint_silver', {
      baseColor: [0.78, 0.82, 0.87, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.22,
      metallic: 0.88,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_glass_tint', {
      baseColor: [0.10, 0.16, 0.24, 1.0],
      emissiveColor: [0.03, 0.06, 0.10, 0.2],
      roughness: 0.08,
      metallic: 0.90,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_rubber_tire', {
      baseColor: [0.08, 0.08, 0.09, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.92,
      metallic: 0.04,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_chrome_alloy', {
      baseColor: [0.84, 0.86, 0.90, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.20,
      metallic: 0.95,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_headlight', {
      baseColor: [1.0, 0.98, 0.90, 1.0],
      emissiveColor: [1.0, 0.96, 0.82, 2.2],
      roughness: 0.12,
      metallic: 0.2,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('car_taillight', {
      baseColor: [0.95, 0.08, 0.08, 1.0],
      emissiveColor: [0.95, 0.08, 0.08, 1.6],
      roughness: 0.18,
      metallic: 0.2,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    // Police Cruiser, Precinct, CCTV & Citizen Mobile Phone Materials
    regMat('police_black', {
      baseColor: [0.06, 0.08, 0.12, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.20,
      metallic: 0.78,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('police_white', {
      baseColor: [0.94, 0.96, 0.99, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.22,
      metallic: 0.45,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('police_light_red', {
      baseColor: [1.0, 0.12, 0.14, 1.0],
      emissiveColor: [1.0, 0.12, 0.14, 2.4],
      roughness: 0.14,
      metallic: 0.1,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('police_light_blue', {
      baseColor: [0.12, 0.48, 1.0, 1.0],
      emissiveColor: [0.12, 0.52, 1.0, 2.5],
      roughness: 0.14,
      metallic: 0.1,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('police_sign_blue', {
      baseColor: [0.14, 0.46, 0.95, 1.0],
      emissiveColor: [0.08, 0.36, 0.90, 1.2],
      roughness: 0.25,
      metallic: 0.35,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('cctv_body', {
      baseColor: [0.84, 0.87, 0.92, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.32,
      metallic: 0.65,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('cctv_lens', {
      baseColor: [0.06, 0.08, 0.12, 1.0],
      emissiveColor: [0.02, 0.06, 0.10, 0.25],
      roughness: 0.10,
      metallic: 0.92,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('cctv_led', {
      baseColor: [1.0, 0.15, 0.15, 1.0],
      emissiveColor: [1.0, 0.10, 0.10, 2.2],
      roughness: 0.15,
      metallic: 0.1,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('phone_screen', {
      baseColor: [0.18, 0.72, 1.0, 1.0],
      emissiveColor: [0.16, 0.68, 1.0, 1.8],
      roughness: 0.12,
      metallic: 0.35,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    // Gun Shop, Max Security Prison & Billboard Materials
    regMat('gunshop_wall', {
      baseColor: [0.22, 0.23, 0.27, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.78,
      metallic: 0.20,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('gunshop_red', {
      baseColor: [0.85, 0.14, 0.12, 1.0],
      emissiveColor: [0.75, 0.12, 0.08, 1.15],
      roughness: 0.28,
      metallic: 0.25,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('gun_metal', {
      baseColor: [0.14, 0.16, 0.19, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.30,
      metallic: 0.88,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('gun_pad_glow', {
      baseColor: [0.12, 0.90, 0.52, 1.0],
      emissiveColor: [0.10, 0.88, 0.45, 1.8],
      roughness: 0.22,
      metallic: 0.20,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('prison_concrete', {
      baseColor: [0.36, 0.37, 0.39, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.88,
      metallic: 0.08,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('prison_bars', {
      baseColor: [0.20, 0.24, 0.28, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.34,
      metallic: 0.86,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('prison_beacon_amber', {
      baseColor: [1.0, 0.52, 0.08, 1.0],
      emissiveColor: [1.0, 0.48, 0.06, 2.3],
      roughness: 0.16,
      metallic: 0.15,
      ao: 1.0,
      alphaCutoff: 0.5,
    });
    regMat('billboard_steel', {
      baseColor: [0.16, 0.18, 0.22, 1.0],
      emissiveColor: [0, 0, 0, 0],
      roughness: 0.45,
      metallic: 0.82,
      ao: 1.0,
      alphaCutoff: 0.5,
    });

    const getMatDef = (key: string): FlatMaterial =>
      materials.find((m) => m.key === key)?.material ?? materials[0].material;

    const addMesh = (key: string, prim: ParsedGLBPrimitive, matKey: string) => {
      meshes.push({
        key,
        prim,
        defaultMaterial: getMatDef(matKey),
        boundingRadius: prim.boundingRadius,
      });
    };

    // ==================== 2. SHARED MODULAR CITY MESHES ====================
    // 2a. Street, Sidewalk, Crosswalk & Tree meshes (stacked cleanly above Ground Y=0.0)
    addMesh('road_1x1', CityBuilder.createBoxMesh('City_Road_Unit', [0, 0.03, 0], [0.5, 0.03, 0.5]), 'asphalt');
    addMesh('sidewalk_1x1', CityBuilder.createBoxMesh('City_Sidewalk_Unit', [0, 0.09, 0], [0.5, 0.09, 0.5]), 'sidewalk');
    addMesh('stripe_ew', CityBuilder.createBoxMesh('City_Lane_EW', [0, 0.066, 0], [1.6, 0.006, 0.12]), 'road_yellow');
    addMesh('stripe_ns', CityBuilder.createBoxMesh('City_Lane_NS', [0, 0.066, 0], [0.12, 0.006, 1.6]), 'road_yellow');
    addMesh('crosswalk_bar', CityBuilder.createBoxMesh('City_Crosswalk_Bar', [0, 0.067, 0], [0.30, 0.006, 1.45]), 'road_white');

    // Streetlamp (post + arm + glowing head centered at [0, 0, 0] extending toward +Z)
    addMesh(
      'lamp_post',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 0.15, 0], size: [0.22, 0.15, 0.22] },
          { center: [0, 2.35, 0], size: [0.09, 2.2, 0.09] },
          { center: [0, 4.45, 0.45], size: [0.07, 0.07, 0.52] },
        ],
        'City_StreetLamp_Pole'
      ),
      'lamp_pole'
    );
    addMesh('lamp_bulb', CityBuilder.createBoxMesh('City_StreetLamp_Bulb', [0, 4.35, 0.82], [0.22, 0.07, 0.34]), 'lamp_glow');

    // Street Tree (low-poly trunk + layered canopy cubes)
    addMesh(
      'tree_trunk',
      CityBuilder.createBoxMesh('City_Tree_Trunk', [0, 1.1, 0], [0.22, 1.1, 0.22]),
      'wood_door'
    );
    addMesh(
      'tree_leaves',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 2.75, 0], size: [1.35, 1.0, 1.35] },
          { center: [0, 3.85, 0], size: [0.95, 0.75, 0.95] },
        ],
        'City_Tree_Canopy'
      ),
      'tree_foliage'
    );

    // 2b. Small House Blueprint (8.4m wide x 7.0m deep, solid single-story home facing +Z)
    const smallHouseWalls: BuildingColliderSpec[] = [
      { id: 'floor_porch', name: 'Porch', center: [0, 0.08, 3.95], size: [1.9, 0.08, 0.55], category: 'floor' },
      { id: 'main_hull', name: 'Walls', center: [0, 1.65, 0], size: [4.2, 1.65, 3.5], category: 'wall' },
      { id: 'chimney', name: 'Chimney', center: [2.6, 3.8, -1.8], size: [0.42, 1.2, 0.42], category: 'wall' },
      { id: 'roof_cap', name: 'Roof Collider', center: [0, 4.0, 0], size: [4.55, 0.75, 3.85], category: 'wall' },
    ];
    addMesh(
      'small_house_body',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 1.65, 0], size: [4.2, 1.65, 3.5] },
          { center: [2.6, 3.8, -1.8], size: [0.42, 1.2, 0.42] },
        ],
        'SmallHouse_Body'
      ),
      'wall_cream'
    );
    addMesh(
      'small_house_porch',
      CityBuilder.createBoxMesh('SmallHouse_Porch', [0, 0.08, 3.95], [1.9, 0.08, 0.55]),
      'sidewalk'
    );
    addMesh(
      'small_house_trim',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 1.15, 3.53], size: [0.65, 1.05, 0.06] }, // Front door
          { center: [0, 0.14, 0], size: [4.26, 0.14, 3.56] }, // Foundation plinth
        ],
        'SmallHouse_DoorTrim'
      ),
      'wood_door'
    );
    addMesh(
      'small_house_windows',
      ProceduralModels.combineBoxes(
        [
          { center: [-2.1, 1.75, 3.53], size: [0.85, 0.65, 0.05] },
          { center: [2.1, 1.75, 3.53], size: [0.85, 0.65, 0.05] },
          { center: [-4.23, 1.75, 0], size: [0.05, 0.65, 1.1] },
          { center: [4.23, 1.75, 0], size: [0.05, 0.65, 1.1] },
          { center: [0, 1.75, -3.53], size: [1.4, 0.65, 0.05] },
        ],
        'SmallHouse_Windows'
      ),
      'window_warm'
    );
    addMesh(
      'small_house_roof',
      CityBuilder.createGableRoofMesh('SmallHouse_GableRoof', 4.6, 3.3, 1.85, 3.85),
      'roof_terracotta'
    );

    // 2c. Living House Blueprint (Enterable 2-Story Townhouse / Apartment Home: 12m wide x 9m deep facing +Z)
    // Doorway opening on Front wall (+Z = +4.5): X from -1.2 to +1.2, Y = 0.16..2.75 is OPEN for walk-in entry!
    const livingHouseSpecs: {
      walls: { center: [number, number, number]; size: [number, number, number]; name: string; cat: 'wall' | 'floor' }[];
      trim: { center: [number, number, number]; size: [number, number, number] }[];
      windows: { center: [number, number, number]; size: [number, number, number] }[];
      furniture: { center: [number, number, number]; size: [number, number, number]; name: string }[];
    } = {
      walls: [
        // Ground floor slab & front step
        { center: [0, 0.08, 0], size: [6.0, 0.08, 4.5], name: 'Living_GroundFloor', cat: 'floor' },
        { center: [0, 0.07, 5.05], size: [1.8, 0.07, 0.55], name: 'Living_FrontStep', cat: 'floor' },
        // Ground exterior walls (front has 2.4m doorway at X=-1.2..1.2)
        { center: [-3.6, 1.75, 4.35], size: [2.4, 1.75, 0.18], name: 'Living_Wall_FL', cat: 'wall' },
        { center: [3.6, 1.75, 4.35], size: [2.4, 1.75, 0.18], name: 'Living_Wall_FR', cat: 'wall' },
        { center: [0, 3.10, 4.35], size: [1.25, 0.40, 0.18], name: 'Living_Wall_Header', cat: 'wall' },
        { center: [0, 1.75, -4.35], size: [6.0, 1.75, 0.18], name: 'Living_Wall_Back', cat: 'wall' },
        { center: [-5.82, 1.75, 0], size: [0.18, 1.75, 4.35], name: 'Living_Wall_Left', cat: 'wall' },
        { center: [5.82, 1.75, 0], size: [0.18, 1.75, 4.35], name: 'Living_Wall_Right', cat: 'wall' },
        // Interior room partition wall inside ground floor (with wide doorway gap)
        { center: [-3.0, 1.75, -0.8], size: [2.75, 1.75, 0.14], name: 'Living_Interior_Divider', cat: 'wall' },
        // 2nd Story Floor + Upper Envelope + Balcony
        { center: [0, 3.55, 0], size: [6.0, 0.15, 4.5], name: 'Living_Floor2_Slab', cat: 'floor' },
        { center: [0, 5.20, 0], size: [6.0, 1.50, 4.5], name: 'Living_UpperStory_Block', cat: 'wall' },
        { center: [0, 3.55, 5.25], size: [3.2, 0.12, 0.75], name: 'Living_Balcony_Deck', cat: 'wall' },
        // Rooftop parapet slab
        { center: [0, 6.82, 0], size: [6.25, 0.18, 4.75], name: 'Living_Roof_Slab', cat: 'wall' },
      ],
      trim: [
        // Balcony rails + doorframe + interior kitchen counter
        { center: [0, 4.10, 5.95], size: [3.2, 0.45, 0.06] },
        { center: [-3.15, 4.10, 5.25], size: [0.06, 0.45, 0.72] },
        { center: [3.15, 4.10, 5.25], size: [0.06, 0.45, 0.72] },
        { center: [0, 0.55, -3.5], size: [2.4, 0.45, 0.45] }, // Kitchen counter along rear
      ],
      windows: [
        // Ground living-room windows
        { center: [-3.6, 1.85, 4.56], size: [1.2, 0.75, 0.04] },
        { center: [3.6, 1.85, 4.56], size: [1.2, 0.75, 0.04] },
        // 2nd floor apartment glowing windows
        { center: [-3.6, 5.15, 4.55], size: [1.3, 0.80, 0.05] },
        { center: [0, 5.15, 4.55], size: [1.5, 0.85, 0.05] },
        { center: [3.6, 5.15, 4.55], size: [1.3, 0.80, 0.05] },
        { center: [-6.03, 5.15, 0], size: [0.04, 0.80, 2.2] },
        { center: [6.03, 5.15, 0], size: [0.04, 0.80, 2.2] },
        { center: [0, 5.15, -4.55], size: [3.4, 0.80, 0.05] },
      ],
      furniture: [
        // Ground floor living room sofa & coffee table
        { center: [-3.8, 0.45, 1.8], size: [1.1, 0.38, 0.45], name: 'Living_Sofa' },
        { center: [-3.8, 0.34, 0.6], size: [0.65, 0.22, 0.35], name: 'Living_CoffeeTable' },
        { center: [3.8, 0.55, -2.5], size: [1.2, 0.48, 0.42], name: 'Living_Table' },
      ],
    };

    const livingColliders: BuildingColliderSpec[] = [
      ...livingHouseSpecs.walls.map((w, i) => ({
        id: `lw_${i}`,
        name: w.name,
        center: w.center,
        size: w.size,
        category: w.cat,
      })),
      ...livingHouseSpecs.furniture.map((f, i) => ({
        id: `lf_${i}`,
        name: f.name,
        center: f.center,
        size: f.size,
        category: 'wall' as const,
      })),
      // Kitchen counter trim collider
      { id: 'lk_counter', name: 'Kitchen Counter', center: [0, 0.55, -3.5], size: [2.4, 0.45, 0.45], category: 'wall' },
    ];

    addMesh(
      'living_house_shell',
      ProceduralModels.combineBoxes(
        livingHouseSpecs.walls.map((w) => ({ center: w.center, size: w.size })),
        'LivingHouse_Shell'
      ),
      'wall_slate'
    );
    addMesh(
      'living_house_trim',
      ProceduralModels.combineBoxes(livingHouseSpecs.trim, 'LivingHouse_Trim'),
      'wood_door'
    );
    addMesh(
      'living_house_windows',
      ProceduralModels.combineBoxes(livingHouseSpecs.windows, 'LivingHouse_Windows'),
      'window_warm'
    );
    addMesh(
      'living_house_furniture',
      ProceduralModels.combineBoxes(
        livingHouseSpecs.furniture.map((f) => ({ center: f.center, size: f.size })),
        'LivingHouse_Furniture'
      ),
      'sofa_fabric'
    );
    addMesh(
      'living_house_roof',
      CityBuilder.createGableRoofMesh('LivingHouse_Roof', 6.3, 7.0, 1.9, 4.8),
      'roof_slate'
    );

    // 2d. Gas Station Blueprint (22m wide x 18m deep, front forecourt facing +Z)
    // Local layout: Canopy centered at Z = +3.5, Shop Mini-Mart behind at Z = -5.5 (enterable front door!)
    const gasStaticSpecs: {
      center: [number, number, number];
      size: [number, number, number];
      name: string;
      cat: 'wall' | 'floor';
    }[] = [
      // Forecourt Concrete Slab (drive-in ramp)
      { center: [0, 0.05, 0.5], size: [11.0, 0.05, 9.0], name: 'Gas_Forecourt_Pad', cat: 'floor' },
      // Canopy Roof & 4 Steel Columns
      { center: [0, 4.75, 3.5], size: [7.6, 0.30, 4.4], name: 'Gas_Canopy_Roof', cat: 'wall' },
      { center: [-5.4, 2.30, 1.1], size: [0.26, 2.25, 0.26], name: 'Gas_Pillar_BL', cat: 'wall' },
      { center: [5.4, 2.30, 1.1], size: [0.26, 2.25, 0.26], name: 'Gas_Pillar_BR', cat: 'wall' },
      { center: [-5.4, 2.30, 5.9], size: [0.26, 2.25, 0.26], name: 'Gas_Pillar_FL', cat: 'wall' },
      { center: [5.4, 2.30, 5.9], size: [0.26, 2.25, 0.26], name: 'Gas_Pillar_FR', cat: 'wall' },
      // Fuel Pump Concrete Islands (Left island & Right island)
      { center: [-3.2, 0.18, 3.5], size: [1.8, 0.14, 0.65], name: 'Gas_Island_L', cat: 'floor' },
      { center: [3.2, 0.18, 3.5], size: [1.8, 0.14, 0.65], name: 'Gas_Island_R', cat: 'floor' },
      // Mini-Mart Shop Shell (rear Z = -2.2..-8.4, open front doorway at X = -1.6..+1.6, Z = -2.2)
      { center: [-4.3, 1.9, -2.2], size: [2.7, 1.85, 0.18], name: 'Gas_Shop_FrontL', cat: 'wall' },
      { center: [4.3, 1.9, -2.2], size: [2.7, 1.85, 0.18], name: 'Gas_Shop_FrontR', cat: 'wall' },
      { center: [0, 3.25, -2.2], size: [1.65, 0.50, 0.18], name: 'Gas_Shop_Header', cat: 'wall' },
      { center: [0, 1.9, -8.3], size: [7.0, 1.85, 0.18], name: 'Gas_Shop_Back', cat: 'wall' },
      { center: [-6.82, 1.9, -5.25], size: [0.18, 1.85, 3.05], name: 'Gas_Shop_Left', cat: 'wall' },
      { center: [6.82, 1.9, -5.25], size: [0.18, 1.85, 3.05], name: 'Gas_Shop_Right', cat: 'wall' },
      { center: [0, 3.85, -5.25], size: [7.2, 0.18, 3.3], name: 'Gas_Shop_Roof', cat: 'wall' },
      // Cashier Counter + Totem Pole
      { center: [-3.5, 0.58, -6.5], size: [1.8, 0.52, 0.45], name: 'Gas_Counter', cat: 'wall' },
      { center: [9.4, 2.2, 8.2], size: [0.22, 2.2, 0.22], name: 'Gas_Totem_Pole', cat: 'wall' },
    ];

    const gasPumpLocs: [number, number, number][] = [
      [-4.1, 0.92, 3.5],
      [-2.3, 0.92, 3.5],
      [2.3, 0.92, 3.5],
      [4.1, 0.92, 3.5],
    ];

    const gasColliders: BuildingColliderSpec[] = [
      ...gasStaticSpecs.map((s, i) => ({
        id: `gs_${i}`,
        name: s.name,
        center: s.center,
        size: s.size,
        category: s.cat,
      })),
      ...gasPumpLocs.map((p, i) => ({
        id: `gpump_${i}`,
        name: `Gas_Pump_${i}`,
        center: [p[0], 0.92, p[2]] as [number, number, number],
        size: [0.42, 0.72, 0.34] as [number, number, number],
        category: 'wall' as const,
      })),
    ];

    addMesh(
      'gas_station_structure',
      ProceduralModels.combineBoxes(
        gasStaticSpecs.map((s) => ({ center: s.center, size: s.size })),
        'GasStation_Structure'
      ),
      'gas_canopy'
    );
    addMesh(
      'gas_station_fascia',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 4.90, 7.92], size: [7.62, 0.22, 0.06] }, // Front canopy neon strip
          { center: [0, 4.90, -0.92], size: [7.62, 0.22, 0.06] },
          { center: [-7.62, 4.90, 3.5], size: [0.06, 0.22, 4.42] },
          { center: [7.62, 4.90, 3.5], size: [0.06, 0.22, 4.42] },
          { center: [0, 3.92, -1.93], size: [7.22, 0.18, 0.06] }, // Mini-mart strip
          { center: [9.4, 3.95, 8.2], size: [1.1, 0.95, 0.28] }, // Price totem billboard
        ],
        'GasStation_Fascia'
      ),
      'gas_brand_red'
    );
    addMesh(
      'gas_station_pumps',
      ProceduralModels.combineBoxes(
        [
          ...gasPumpLocs.map((p) => ({ center: p, size: [0.42, 0.70, 0.34] as [number, number, number] })),
          // Glowing screen accents on canopy & totem
          { center: [9.4, 3.95, 8.50], size: [0.85, 0.65, 0.04] },
          { center: [9.4, 3.95, 7.90], size: [0.85, 0.65, 0.04] },
        ],
        'GasStation_Pumps'
      ),
      'gas_brand_cyan'
    );
    addMesh(
      'gas_station_windows',
      ProceduralModels.combineBoxes(
        [
          { center: [-4.3, 1.95, -2.0], size: [1.8, 0.95, 0.04] },
          { center: [4.3, 1.95, -2.0], size: [1.8, 0.95, 0.04] },
        ],
        'GasStation_Windows'
      ),
      'window_warm'
    );

    // 2e. Mid-Rise Commercial / Apartment Towers (16m x 22m height x 14m, outer skyline blocks)
    const midriseSpecs: { center: [number, number, number]; size: [number, number, number] }[] = [
      { center: [0, 1.9, 0], size: [8.0, 1.9, 7.0] },     // Ground podium
      { center: [0, 12.0, 0], size: [7.4, 8.2, 6.4] },    // Main tower shaft
      { center: [0, 20.6, 0], size: [7.7, 0.45, 6.7] },   // Crown parapet
      { center: [2.2, 22.0, -1.6], size: [1.6, 0.95, 1.5] }, // Rooftop mechanical penthouse
    ];
    addMesh('midrise_body', ProceduralModels.combineBoxes(midriseSpecs, 'MidRise_Tower_Body'), 'tower_stone_gray');

    const midWinBoxes: { center: [number, number, number]; size: [number, number, number] }[] = [];
    for (let fl = 1; fl <= 5; fl++) {
      const wy = 2.6 + fl * 3.1;
      midWinBoxes.push({ center: [0, wy, 6.44], size: [6.0, 0.95, 0.05] });
      midWinBoxes.push({ center: [0, wy, -6.44], size: [6.0, 0.95, 0.05] });
      midWinBoxes.push({ center: [-7.44, wy, 0], size: [0.05, 0.95, 5.0] });
      midWinBoxes.push({ center: [7.44, wy, 0], size: [0.05, 0.95, 5.0] });
    }
    addMesh('midrise_windows', ProceduralModels.combineBoxes(midWinBoxes, 'MidRise_Tower_Windows'), 'tower_glass_blue');
    addMesh(
      'midrise_trim',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 3.85, 7.1], size: [8.1, 0.16, 0.12] },
          { center: [0, 2.0, 7.05], size: [2.4, 1.6, 0.06] }, // Lobby glass doors
          { center: [0, 23.4, -1.6], size: [0.12, 1.6, 0.12] }, // Roof spire
        ],
        'MidRise_Tower_Trim'
      ),
      'lamp_pole'
    );

    // 2f. Corner Commercial Shop / Cafe Block (11m x 5.2m x 8.5m facing +Z)
    addMesh(
      'shop_body',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 2.5, 0], size: [5.5, 2.5, 4.2] },
          { center: [0, 5.15, 0], size: [5.75, 0.20, 4.45] },
        ],
        'City_Corner_Shop_Body'
      ),
      'wall_terracotta'
    );
    addMesh(
      'shop_awning',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 3.15, 4.85], size: [5.4, 0.18, 0.72] },
          { center: [0, 3.95, 4.35], size: [3.2, 0.42, 0.12] },
        ],
        'City_Corner_Shop_Awning'
      ),
      'shop_awning_green'
    );
    addMesh(
      'shop_windows',
      ProceduralModels.combineBoxes(
        [
          { center: [-2.6, 1.65, 4.24], size: [1.65, 1.05, 0.05] },
          { center: [2.6, 1.65, 4.24], size: [1.65, 1.05, 0.05] },
          { center: [0, 1.55, 4.24], size: [0.8, 1.25, 0.05] },
        ],
        'City_Corner_Shop_Windows'
      ),
      'window_warm'
    );

    // 2g. Hero 3D Car Model (~4.5m long Z, 1.96m wide X, 1.44m tall Y, wheels resting at Y=0)
    const carBodyUpper = CityBuilder.createSlopedBlock('Car_RoofHull', 0, 0.76, 1.38, -1.25, 0.65, -0.82, 0.12, 0.78);
    const carBodyLower = ProceduralModels.combineBoxes(
      [
        { center: [0, 0.50, 0.02], size: [0.96, 0.28, 2.18] },     // Lower sculpted chassis
        { center: [0, 0.68, 1.45], size: [0.88, 0.12, 0.74] },     // Front hood deck
        { center: [0, 0.72, -1.62], size: [0.88, 0.12, 0.56] },    // Rear trunk deck
        { center: [0, 0.92, -2.04], size: [0.86, 0.04, 0.14] },    // Sport rear wing blade
        { center: [-0.98, 0.86, 0.52], size: [0.11, 0.06, 0.07] }, // Left mirror
        { center: [0.98, 0.86, 0.52], size: [0.11, 0.06, 0.07] },  // Right mirror
      ],
      'Car_LowerChassis'
    );
    addMesh('car_body', CityBuilder.mergePrimitives([carBodyLower, carBodyUpper], 'City_Car_Body'), 'car_paint_crimson');

    addMesh(
      'car_glass',
      CityBuilder.mergePrimitives(
        [
          CityBuilder.createSlopedBlock('Car_GlassWindshield', 0, 0.80, 1.33, -1.27, 0.67, -0.84, 0.14, 0.73),
          CityBuilder.createBoxMesh('Car_SideGlass', [0, 1.06, -0.34], [0.80, 0.22, 0.68]),
        ],
        'City_Car_Glass'
      ),
      'car_glass_tint'
    );

    const carWheelPos: [number, number, number][] = [
      [-0.92, 0.35, 1.38],
      [0.92, 0.35, 1.38],
      [-0.92, 0.35, -1.36],
      [0.92, 0.35, -1.36],
    ];
    addMesh('car_tires', CityBuilder.createWheelsMesh('City_Car_Tires', carWheelPos, 0.35, 0.14, 14), 'car_rubber_tire');
    addMesh(
      'car_rims',
      CityBuilder.mergePrimitives(
        [
          CityBuilder.createWheelsMesh('City_Car_AlloyHubs', carWheelPos, 0.21, 0.15, 10),
          ProceduralModels.combineBoxes(
            [
              { center: [0, 0.27, 2.21], size: [0.94, 0.10, 0.06] },  // Front splitter bumper
              { center: [0, 0.28, -2.18], size: [0.94, 0.11, 0.06] }, // Rear bumper
              { center: [0, 0.48, 2.21], size: [0.46, 0.12, 0.04] },  // Front chrome grille
              { center: [-0.55, 0.24, -2.21], size: [0.07, 0.04, 0.05] }, // Exhaust L
              { center: [0.55, 0.24, -2.21], size: [0.07, 0.04, 0.05] },  // Exhaust R
            ],
            'Car_ChromeTrim'
          ),
        ],
        'City_Car_Trim'
      ),
      'car_chrome_alloy'
    );

    addMesh(
      'car_headlights',
      ProceduralModels.combineBoxes(
        [
          { center: [-0.66, 0.56, 2.21], size: [0.18, 0.07, 0.04] },
          { center: [0.66, 0.56, 2.21], size: [0.18, 0.07, 0.04] },
        ],
        'City_Car_Headlights'
      ),
      'car_headlight'
    );

    addMesh(
      'car_taillights',
      ProceduralModels.combineBoxes(
        [
          { center: [-0.66, 0.58, -2.17], size: [0.22, 0.07, 0.04] },
          { center: [0.66, 0.58, -2.17], size: [0.22, 0.07, 0.04] },
        ],
        'City_Car_Taillights'
      ),
      'car_taillight'
    );

    const carColliders: BuildingColliderSpec[] = [
      { id: 'car_base', name: 'Car Chassis', center: [0, 0.39, 0], size: [1.02, 0.39, 2.22], category: 'floor' },
      { id: 'car_cab', name: 'Car Roof', center: [0, 1.06, -0.25], size: [0.84, 0.34, 1.05], category: 'floor' },
    ];

    // 2h. Police Cruiser Extra Livery (White Roof & Doors + Red/Blue Lightbar Pods)
    addMesh(
      'police_doors_roof',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 1.385, -0.35], size: [0.76, 0.025, 0.48] },  // White cruiser roof panel
          { center: [-0.965, 0.54, 0.06], size: [0.02, 0.24, 0.74] }, // Left white door panel
          { center: [0.965, 0.54, 0.06], size: [0.02, 0.24, 0.74] },  // Right white door panel
        ],
        'Police_Cruiser_White'
      ),
      'police_white'
    );
    addMesh(
      'police_bar_red',
      CityBuilder.createBoxMesh('Police_Lightbar_Red', [-0.30, 1.48, -0.28], [0.28, 0.065, 0.13]),
      'police_light_red'
    );
    addMesh(
      'police_bar_blue',
      CityBuilder.createBoxMesh('Police_Lightbar_Blue', [0.30, 1.48, -0.28], [0.28, 0.065, 0.13]),
      'police_light_blue'
    );

    // 2i. City 0 Police Station (20m wide x 16m deep, enterable lobby + dispatch desk + rooftop 3D sign, facing +Z)
    const policeStationSpecs: { center: [number, number, number]; size: [number, number, number]; name: string; cat: 'wall' | 'floor' }[] = [
      // Concrete foundation & front steps
      { center: [0, 0.06, 0], size: [10.0, 0.06, 8.0], name: 'Precinct_FloorSlab', cat: 'floor' },
      { center: [0, 0.06, 8.9], size: [3.2, 0.06, 0.9], name: 'Precinct_Steps', cat: 'floor' },
      // Exterior walls (front has wide 3.4m double glass doorway centered X = -1.7..+1.7, Z = 7.8)
      { center: [-5.75, 2.35, 7.8], size: [4.05, 2.35, 0.22], name: 'Precinct_Wall_FL', cat: 'wall' },
      { center: [5.75, 2.35, 7.8], size: [4.05, 2.35, 0.22], name: 'Precinct_Wall_FR', cat: 'wall' },
      { center: [0, 3.95, 7.8], size: [1.75, 0.75, 0.22], name: 'Precinct_Door_Header', cat: 'wall' },
      { center: [0, 2.35, -7.8], size: [10.0, 2.35, 0.22], name: 'Precinct_Wall_Back', cat: 'wall' },
      { center: [-9.78, 2.35, 0], size: [0.22, 2.35, 7.8], name: 'Precinct_Wall_Left', cat: 'wall' },
      { center: [9.78, 2.35, 0], size: [0.22, 2.35, 7.8], name: 'Precinct_Wall_Right', cat: 'wall' },
      // Interior Dispatch Desk & Holding Cell Partition
      { center: [0, 0.62, -2.5], size: [3.6, 0.55, 0.55], name: 'Precinct_Dispatch_Desk', cat: 'wall' },
      { center: [-5.8, 2.35, -2.2], size: [3.8, 2.35, 0.16], name: 'Precinct_Cell_Divider', cat: 'wall' },
      // Second Story Command Deck & Roof Parapet
      { center: [0, 4.85, 0], size: [10.35, 0.22, 8.35], name: 'Precinct_RoofDeck', cat: 'floor' },
      { center: [0, 6.25, -2.0], size: [8.4, 1.25, 5.2], name: 'Precinct_UpperCommand', cat: 'wall' },
      { center: [0, 7.62, -2.0], size: [8.65, 0.16, 5.45], name: 'Precinct_UpperRoof', cat: 'floor' },
    ];
    addMesh(
      'police_station_shell',
      ProceduralModels.combineBoxes(
        policeStationSpecs.map((s) => ({ center: s.center, size: s.size })),
        'PoliceStation_Shell'
      ),
      'tower_stone_gray'
    );
    addMesh(
      'police_station_fascia',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 4.86, 8.42], size: [10.4, 0.26, 0.08] },
          { center: [0, 4.86, -8.42], size: [10.4, 0.26, 0.08] },
          { center: [-10.42, 4.86, 0], size: [0.08, 0.26, 8.4] },
          { center: [10.42, 4.86, 0], size: [0.08, 0.26, 8.4] },
          { center: [-2.2, 1.9, 8.08], size: [0.22, 1.9, 0.12] },
          { center: [2.2, 1.9, 8.08], size: [0.22, 1.9, 0.12] },
        ],
        'PoliceStation_BlueFascia'
      ),
      'police_sign_blue'
    );
    addMesh(
      'police_station_windows',
      ProceduralModels.combineBoxes(
        [
          { center: [-5.8, 2.3, 8.05], size: [2.4, 1.1, 0.05] },
          { center: [5.8, 2.3, 8.05], size: [2.4, 1.1, 0.05] },
          { center: [0, 6.3, 3.24], size: [5.8, 0.72, 0.05] },
          { center: [-10.02, 2.3, 0], size: [0.05, 1.1, 4.5] },
          { center: [10.02, 2.3, 0], size: [0.05, 1.1, 4.5] },
        ],
        'PoliceStation_Windows'
      ),
      'tower_glass_blue'
    );
    addMesh(
      'police_station_beacons',
      ProceduralModels.combineBoxes(
        [
          { center: [-2.2, 3.92, 8.15], size: [0.22, 0.22, 0.22] },
          { center: [4.2, 7.95, 2.9], size: [0.35, 0.24, 0.35] },
        ],
        'PoliceStation_BeaconBlue'
      ),
      'police_light_blue'
    );
    addMesh(
      'police_station_beacons_red',
      ProceduralModels.combineBoxes(
        [
          { center: [2.2, 3.92, 8.15], size: [0.22, 0.22, 0.22] },
          { center: [-4.2, 7.95, 2.9], size: [0.35, 0.24, 0.35] },
        ],
        'PoliceStation_BeaconRed'
      ),
      'police_light_red'
    );
    addMesh(
      'police_station_sign',
      ProceduralModels.create3DTextMesh('POLICE', 0.85, 0.22, 'PoliceStation_Sign3D'),
      'police_sign_blue'
    );
    // Steel Holding Cell Bars + Locking Cell Door inside Police Station NW quadrant (local X:-9.6..-5.6, Z:-7.8..-2.2)
    addMesh(
      'police_jail_bars',
      ProceduralModels.combineBoxes(
        [
          { center: [-5.6, 1.85, -7.2], size: [0.07, 1.85, 0.07] },
          { center: [-5.6, 1.85, -6.4], size: [0.07, 1.85, 0.07] },
          { center: [-5.6, 1.85, -5.6], size: [0.07, 1.85, 0.07] },
          { center: [-5.6, 1.85, -4.8], size: [0.07, 1.85, 0.07] },
          { center: [-5.6, 1.85, -4.0], size: [0.07, 1.85, 0.07] },
          { center: [-5.6, 1.85, -3.2], size: [0.07, 1.85, 0.07] },
          { center: [-5.6, 1.85, -2.4], size: [0.07, 1.85, 0.07] },
          // Cell bunk bed along back wall
          { center: [-8.3, 0.42, -6.9], size: [1.1, 0.14, 0.5] },
        ],
        'PoliceStation_HoldingCell_Bars'
      ),
      'prison_bars'
    );
    addMesh(
      'police_jail_gate',
      ProceduralModels.combineBoxes(
        [
          { center: [-7.55, 1.85, -2.2], size: [0.05, 1.85, 0.05] },
          { center: [-7.10, 1.85, -2.2], size: [0.05, 1.85, 0.05] },
          { center: [-6.65, 1.85, -2.2], size: [0.05, 1.85, 0.05] },
          { center: [-6.20, 1.85, -2.2], size: [0.05, 1.85, 0.05] },
          { center: [-6.85, 1.85, -2.2], size: [1.05, 0.07, 0.07] },
        ],
        'PoliceStation_JailGate'
      ),
      'prison_bars'
    );

    // 2j. City 0 CCTV Surveillance Camera Meshes (Wall/Pole Bracket + Rotating Camera Head + Recording LED)
    addMesh(
      'cctv_mount',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 0, -0.35], size: [0.06, 0.06, 0.35] },
          { center: [0, 0, -0.68], size: [0.14, 0.14, 0.05] },
        ],
        'City_CCTV_Bracket'
      ),
      'lamp_pole'
    );
    addMesh(
      'cctv_cam_head',
      CityBuilder.mergePrimitives(
        [
          CityBuilder.createBoxMesh('CCTV_Body', [0, 0, 0.14], [0.12, 0.11, 0.26]),
          CityBuilder.createBoxMesh('CCTV_Sunhood', [0, 0.11, 0.22], [0.14, 0.025, 0.30]),
        ],
        'City_CCTV_Head'
      ),
      'cctv_body'
    );
    addMesh(
      'cctv_cam_led',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 0, 0.42], size: [0.065, 0.065, 0.04] },
          { center: [0.08, 0.08, 0.38], size: [0.025, 0.025, 0.025] },
        ],
        'City_CCTV_LED'
      ),
      'cctv_led'
    );

    // 2k. Citizen Handheld Mobile Phone & Equippable Pistol Meshes
    addMesh(
      'citizen_mobile_phone',
      CityBuilder.createBoxMesh('Citizen_Smartphone', [0, 0, 0], [0.048, 0.088, 0.014]),
      'phone_screen'
    );
    addMesh(
      'weapon_pistol',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 0.035, 0.09], size: [0.022, 0.026, 0.12] },
          { center: [0, -0.025, -0.01], size: [0.020, 0.055, 0.028] },
        ],
        'Downtown_Pistol'
      ),
      'gun_metal'
    );

    // 2l. Downtown Billboards (Steel Tower + Floodlight Frame + Upright UV Display Screen)
    addMesh(
      'billboard_frame',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 2.2, 0], size: [0.35, 2.2, 0.35] },
          { center: [0, 6.2, 0], size: [4.35, 2.25, 0.18] },
          { center: [-2.6, 8.58, 0.42], size: [0.22, 0.06, 0.42] },
          { center: [2.6, 8.58, 0.42], size: [0.22, 0.06, 0.42] },
        ],
        'Downtown_Billboard_Frame'
      ),
      'billboard_steel'
    );
    addMesh(
      'billboard_screen',
      CityBuilder.createBillboardScreenMesh('Downtown_Billboard_Screen', 6.2, 4.10, 2.02, 0.21),
      'wall_cream'
    );

    // 2m. Downtown Gun Shop (12m wide x 10m deep enterable tactical store + counter + weapon racks)
    const gunShopSpecs: { center: [number, number, number]; size: [number, number, number]; name: string; cat: 'wall' | 'floor' }[] = [
      { center: [0, 0.06, 0], size: [6.0, 0.06, 5.0], name: 'GunShop_Slab', cat: 'floor' },
      { center: [-3.85, 2.25, 4.78], size: [2.15, 2.25, 0.22], name: 'GunShop_Wall_FL', cat: 'wall' },
      { center: [3.85, 2.25, 4.78], size: [2.15, 2.25, 0.22], name: 'GunShop_Wall_FR', cat: 'wall' },
      { center: [0, 3.85, 4.78], size: [1.75, 0.65, 0.22], name: 'GunShop_DoorHeader', cat: 'wall' },
      { center: [0, 2.25, -4.78], size: [6.0, 2.25, 0.22], name: 'GunShop_Wall_Back', cat: 'wall' },
      { center: [-5.78, 2.25, 0], size: [0.22, 2.25, 4.78], name: 'GunShop_Wall_Left', cat: 'wall' },
      { center: [5.78, 2.25, 0], size: [0.22, 2.25, 4.78], name: 'GunShop_Wall_Right', cat: 'wall' },
      { center: [0, 4.62, 0], size: [6.3, 0.20, 5.3], name: 'GunShop_Roof', cat: 'floor' },
      { center: [0, 0.56, -1.5], size: [2.8, 0.52, 0.50], name: 'GunShop_Counter', cat: 'wall' },
    ];
    addMesh(
      'gunshop_shell',
      ProceduralModels.combineBoxes(
        gunShopSpecs.map((s) => ({ center: s.center, size: s.size })),
        'GunShop_Shell'
      ),
      'gunshop_wall'
    );
    addMesh(
      'gunshop_accent',
      ProceduralModels.combineBoxes(
        [
          { center: [0, 4.68, 5.45], size: [6.35, 0.26, 0.14] },
          { center: [0, 3.35, 5.42], size: [6.15, 0.14, 0.68] },
          { center: [-5.1, 1.85, 5.02], size: [0.16, 1.85, 0.08] },
          { center: [5.1, 1.85, 5.02], size: [0.16, 1.85, 0.08] },
        ],
        'GunShop_CrimsonAccent'
      ),
      'gunshop_red'
    );
    addMesh(
      'gunshop_weapons_display',
      ProceduralModels.combineBoxes(
        [
          // Wall-mounted rifles & handguns inside counter wall
          { center: [-2.4, 2.35, -4.45], size: [0.85, 0.09, 0.08] },
          { center: [0.0, 2.35, -4.45], size: [0.85, 0.09, 0.08] },
          { center: [2.4, 2.35, -4.45], size: [0.85, 0.09, 0.08] },
          { center: [-1.4, 1.72, -4.45], size: [0.60, 0.08, 0.08] },
          { center: [1.4, 1.72, -4.45], size: [0.60, 0.08, 0.08] },
          // Counter display pistols
          { center: [-0.8, 1.12, -1.5], size: [0.22, 0.05, 0.14] },
          { center: [0.8, 1.12, -1.5], size: [0.22, 0.05, 0.14] },
        ],
        'GunShop_WeaponRacks'
      ),
      'gun_metal'
    );
    addMesh(
      'gunshop_pickup_pad',
      CityBuilder.createBoxMesh('GunShop_PickupPad', [0, 0.14, -0.35], [1.15, 0.03, 0.55]),
      'gun_pad_glow'
    );
    addMesh(
      'gunshop_sign',
      ProceduralModels.create3DTextMesh('GUN SHOP', 0.78, 0.22, 'GunShop_Sign3D'),
      'gunshop_red'
    );

    // 2n. Out-of-City Maximum Security Prison Compound (44m wide x 40m deep fortress, watchtowers & cellblock)
    const maxPrisonSpecs: { center: [number, number, number]; size: [number, number, number]; name: string; cat: 'wall' | 'floor' }[] = [
      // Outer compound concrete floor slab
      { center: [0, 0.07, 0], size: [22.0, 0.07, 20.0], name: 'MaxPrison_YardSlab', cat: 'floor' },
      // 7m High Perimeter Blast Walls (6m opening on South wall Z=+19.4 facing Civic Street)
      { center: [-12.5, 3.6, 19.4], size: [9.5, 3.6, 0.55], name: 'MaxPrison_Wall_SL', cat: 'wall' },
      { center: [12.5, 3.6, 19.4], size: [9.5, 3.6, 0.55], name: 'MaxPrison_Wall_SR', cat: 'wall' },
      { center: [0, 6.2, 19.4], size: [3.4, 1.0, 0.55], name: 'MaxPrison_Gate_Arch', cat: 'wall' },
      { center: [0, 3.6, -19.4], size: [22.0, 3.6, 0.55], name: 'MaxPrison_Wall_North', cat: 'wall' },
      { center: [-21.4, 3.6, 0], size: [0.55, 3.6, 19.4], name: 'MaxPrison_Wall_West', cat: 'wall' },
      { center: [21.4, 3.6, 0], size: [0.55, 3.6, 19.4], name: 'MaxPrison_Wall_East', cat: 'wall' },
      // 4 Corner Guard Watchtowers (11m tall concrete shafts)
      { center: [-20.5, 5.5, 18.5], size: [2.2, 5.5, 2.2], name: 'MaxPrison_Tower_SW', cat: 'wall' },
      { center: [20.5, 5.5, 18.5], size: [2.2, 5.5, 2.2], name: 'MaxPrison_Tower_SE', cat: 'wall' },
      { center: [-20.5, 5.5, -18.5], size: [2.2, 5.5, 2.2], name: 'MaxPrison_Tower_NW', cat: 'wall' },
      { center: [20.5, 5.5, -18.5], size: [2.2, 5.5, 2.2], name: 'MaxPrison_Tower_NE', cat: 'wall' },
      // Central Maximum Security Cellblock Hall (doorway at Z=+5.5 facing South yard)
      { center: [-6.4, 2.9, 5.5], size: [4.6, 2.9, 0.35], name: 'MaxPrison_Block_FL', cat: 'wall' },
      { center: [6.4, 2.9, 5.5], size: [4.6, 2.9, 0.35], name: 'MaxPrison_Block_FR', cat: 'wall' },
      { center: [0, 4.9, 5.5], size: [2.0, 0.9, 0.35], name: 'MaxPrison_Block_Header', cat: 'wall' },
      { center: [0, 2.9, -6.5], size: [11.0, 2.9, 0.35], name: 'MaxPrison_Block_Back', cat: 'wall' },
      { center: [-10.65, 2.9, -0.5], size: [0.35, 2.9, 6.0], name: 'MaxPrison_Block_W', cat: 'wall' },
      { center: [10.65, 2.9, -0.5], size: [0.35, 2.9, 6.0], name: 'MaxPrison_Block_E', cat: 'wall' },
      { center: [0, 6.0, -0.5], size: [11.4, 0.25, 6.4], name: 'MaxPrison_Block_Roof', cat: 'floor' },
    ];
    addMesh(
      'maxprison_shell',
      ProceduralModels.combineBoxes(
        maxPrisonSpecs.map((s) => ({ center: s.center, size: s.size })),
        'MaxSecurityPrison_Shell'
      ),
      'prison_concrete'
    );
    addMesh(
      'maxprison_bars_doors',
      ProceduralModels.combineBoxes(
        [
          // Watchtower observation windows
          { center: [-20.5, 9.6, 18.5], size: [2.5, 0.65, 2.5] },
          { center: [20.5, 9.6, 18.5], size: [2.5, 0.65, 2.5] },
          { center: [-20.5, 9.6, -18.5], size: [2.5, 0.65, 2.5] },
          { center: [20.5, 9.6, -18.5], size: [2.5, 0.65, 2.5] },
          // Cellblock interior steel bars
          { center: [-6.0, 2.2, -1.0], size: [0.08, 2.1, 4.2] },
          { center: [6.0, 2.2, -1.0], size: [0.08, 2.1, 4.2] },
        ],
        'MaxSecurityPrison_Steel'
      ),
      'prison_bars'
    );
    addMesh(
      'maxprison_beacons',
      ProceduralModels.combineBoxes(
        [
          { center: [-20.5, 11.4, 18.5], size: [0.55, 0.45, 0.55] },
          { center: [20.5, 11.4, 18.5], size: [0.55, 0.45, 0.55] },
          { center: [-20.5, 11.4, -18.5], size: [0.55, 0.45, 0.55] },
          { center: [20.5, 11.4, -18.5], size: [0.55, 0.45, 0.55] },
          { center: [-3.4, 7.6, 19.6], size: [0.40, 0.40, 0.40] },
          { center: [3.4, 7.6, 19.6], size: [0.40, 0.40, 0.40] },
        ],
        'MaxSecurityPrison_Beacons'
      ),
      'prison_beacon_amber'
    );
    addMesh(
      'maxprison_sign',
      ProceduralModels.create3DTextMesh('MAX PRISON', 0.95, 0.24, 'MaxPrison_Sign3D'),
      'prison_beacon_amber'
    );

    // ==================== 3. PLACE MEGA CITY STREETS & SIDEWALKS ====================
    const placeRoad = (cx: number, cz: number, widthX: number, depthZ: number, name: string) => {
      // Subdivide long avenues/streets cleanly so frustum culling skips off-screen segments
      const segsX = Math.max(1, Math.ceil(widthX / 38));
      const segsZ = Math.max(1, Math.ceil(depthZ / 38));
      const chunkW = widthX / segsX;
      const chunkD = depthZ / segsZ;
      const startX = cx - widthX * 0.5 + chunkW * 0.5;
      const startZ = cz - depthZ * 0.5 + chunkD * 0.5;
      const rad = Math.hypot(chunkW * 0.5, chunkD * 0.5) + 0.5;

      for (let ix = 0; ix < segsX; ix++) {
        for (let iz = 0; iz < segsZ; iz++) {
          const px = startX + ix * chunkW;
          const pz = startZ + iz * chunkD;
          placements.push({
            meshKey: 'road_1x1',
            materialKey: 'asphalt',
            position: [px, 0, pz],
            rotationY: 0,
            scale: [chunkW, 1, chunkD],
            name: segsX === 1 && segsZ === 1 ? name : `${name}_Seg_${ix}_${iz}`,
            sphereRadius: rad,
          });
        }
      }
    };

    const placeSidewalk = (cx: number, cz: number, widthX: number, depthZ: number, name: string) => {
      const segsX = Math.max(1, Math.ceil(widthX / 26));
      const segsZ = Math.max(1, Math.ceil(depthZ / 26));
      const chunkW = widthX / segsX;
      const chunkD = depthZ / segsZ;
      const startX = cx - widthX * 0.5 + chunkW * 0.5;
      const startZ = cz - depthZ * 0.5 + chunkD * 0.5;
      const rad = Math.hypot(chunkW * 0.5, chunkD * 0.5) + 0.5;

      for (let ix = 0; ix < segsX; ix++) {
        for (let iz = 0; iz < segsZ; iz++) {
          placements.push({
            meshKey: 'sidewalk_1x1',
            materialKey: 'sidewalk',
            position: [startX + ix * chunkW, 0, startZ + iz * chunkD],
            rotationY: 0,
            scale: [chunkW, 1, chunkD],
            name: segsX === 1 && segsZ === 1 ? name : `${name}_Seg_${ix}_${iz}`,
            sphereRadius: rad,
          });
        }
      }

      colliders.push({
        id: `sw_${name}`,
        name,
        center: [cx, 0.09, cz],
        size: [widthX * 0.5, 0.09, depthZ * 0.5],
        category: 'floor',
      });
    };

    // 5 Mega City East-West Avenues (width = 13m: Z = -104, -34, +34, +104, +174)
    const ewAvenues = [
      { z: -104, name: 'FarNorth_Parkway' },
      { z: -34, name: 'North_Avenue' },
      { z: 34, name: 'Main_Boulevard' },
      { z: 104, name: 'South_Boulevard' },
      { z: 174, name: 'Metro_Ring_South' },
    ];
    for (const av of ewAvenues) {
      placeRoad(32, av.z, 420, 13, av.name);
      for (let x = -168; x <= 232; x += 8) {
        placements.push({
          meshKey: 'stripe_ew',
          materialKey: 'road_yellow',
          position: [x, 0, av.z],
          rotationY: 0,
          name: `${av.name}_Stripe_${x}`,
          sphereRadius: 2.0,
        });
      }
    }

    // Highway spur extending Civic Street north out of city directly to Maximum Security Prison Gate (Z: -116..-194)
    placeRoad(-32, -155, 13, 84, 'Prison_Access_Highway');
    for (let z = -190; z <= -116; z += 8) {
      placements.push({
        meshKey: 'stripe_ns',
        materialKey: 'road_yellow',
        position: [-32, 0, z],
        rotationY: 0,
        name: `Prison_Hwy_Stripe_${z}`,
        sphereRadius: 2.0,
      });
    }

    // 7 Mega City North-South Streets (width = 13m: X = -160, -96, -32, +30, +96, +160, +224)
    const nsStreets = [
      { x: -160, name: 'West_Perimeter_Hwy' },
      { x: -96, name: 'West_Avenue' },
      { x: -32, name: 'Civic_Street' },
      { x: 30, name: 'Commerce_Street' },
      { x: 96, name: 'Market_Street' },
      { x: 160, name: 'East_Boulevard' },
      { x: 224, name: 'Harbor_Expressway' },
    ];
    for (const st of nsStreets) {
      placeRoad(st.x, 34, 13, 300, st.name);
      for (let z = -108; z <= 176; z += 8) {
        if (
          Math.abs(z - 34) < 8 ||
          Math.abs(z + 34) < 8 ||
          Math.abs(z - 104) < 8 ||
          Math.abs(z + 104) < 8 ||
          Math.abs(z - 174) < 8
        ) {
          continue;
        }
        placements.push({
          meshKey: 'stripe_ns',
          materialKey: 'road_yellow',
          position: [st.x, 0, z],
          rotationY: 0,
          name: `${st.name}_Stripe_${z}`,
          sphereRadius: 2.0,
        });
      }
    }

    // Zebra Crosswalks at busy Main Boulevard & North/South intersections
    for (const crossX of [-88, -24, 22, 38, 88, 104, 152]) {
      for (let off = -4.2; off <= 4.2; off += 1.4) {
        placements.push({
          meshKey: 'crosswalk_bar',
          materialKey: 'road_white',
          position: [crossX, 0, 34 + off],
          rotationY: Math.PI * 0.5,
          name: `Crosswalk_Main_${crossX}_${off.toFixed(1)}`,
          sphereRadius: 1.8,
        });
      }
    }
    for (const crossX of [-24, 22, 38, 88]) {
      for (let off = -4.2; off <= 4.2; off += 1.4) {
        placements.push({
          meshKey: 'crosswalk_bar',
          materialKey: 'road_white',
          position: [crossX, 0, 104 + off],
          rotationY: Math.PI * 0.5,
          name: `Crosswalk_South_${crossX}_${off.toFixed(1)}`,
          sphereRadius: 1.8,
        });
      }
    }

    // Sidewalks framing downtown & outer blocks cleanly outside Main Tower entrance plaza (X: -12..12)
    placeSidewalk(-17, 26.2, 14, 2.6, 'MainBlvd_North_SW_L');
    placeSidewalk(18, 26.2, 12, 2.6, 'MainBlvd_North_SW_R');
    placeSidewalk(60, 26.2, 46, 2.6, 'SecondaryTower_North_SW');
    placeSidewalk(128, 26.2, 50, 2.6, 'East_North_SW');
    placeSidewalk(192, 26.2, 50, 2.6, 'FarEast_North_SW');
    placeSidewalk(-64, 26.2, 50, 2.6, 'West_North_SW');
    placeSidewalk(-128, 26.2, 50, 2.6, 'FarWest_North_SW');

    placeSidewalk(-1, 41.8, 48, 2.8, 'MainBlvd_South_Central_SW');
    placeSidewalk(60, 41.8, 48, 2.8, 'MainBlvd_South_East_SW');
    placeSidewalk(-64, 41.8, 50, 2.8, 'MainBlvd_South_West_SW');
    placeSidewalk(-128, 41.8, 50, 2.8, 'MainBlvd_South_FarWest_SW');
    placeSidewalk(128, 41.8, 50, 2.8, 'MainBlvd_South_FarEast_SW');
    placeSidewalk(192, 41.8, 50, 2.8, 'MainBlvd_South_Harbor_SW');

    placeSidewalk(-1, -26.2, 48, 2.4, 'NorthAve_Tower_SW');
    placeSidewalk(60, -26.2, 48, 2.4, 'NorthAve_Secondary_SW');
    placeSidewalk(-128, -41.8, 50, 2.8, 'NorthAve_FarWest_SW');
    placeSidewalk(-64, -41.8, 50, 2.8, 'NorthAve_Houses_West_SW');
    placeSidewalk(-1, -41.8, 48, 2.8, 'NorthAve_Houses_Central_SW');
    placeSidewalk(60, -41.8, 48, 2.8, 'NorthAve_Houses_East_SW');
    placeSidewalk(128, -41.8, 50, 2.8, 'NorthAve_Houses_FarEast_SW');
    placeSidewalk(192, -41.8, 50, 2.8, 'NorthAve_Houses_Harbor_SW');

    placeSidewalk(-64, 96.2, 50, 2.6, 'SouthBlvd_West_SW');
    placeSidewalk(-1, 96.2, 48, 2.6, 'SouthBlvd_Central_SW');
    placeSidewalk(60, 96.2, 48, 2.6, 'SouthBlvd_East_SW');
    placeSidewalk(128, 96.2, 50, 2.6, 'SouthBlvd_FarEast_SW');

    // Streetlamps across Mega City
    const placeStreetLamp = (x: number, z: number, rotY: number, idx: number) => {
      placements.push({
        meshKey: 'lamp_post',
        materialKey: 'lamp_pole',
        position: [x, 0, z],
        rotationY: rotY,
        name: `StreetLamp_Pole_${idx}`,
        sphereRadius: 5.0,
      });
      placements.push({
        meshKey: 'lamp_bulb',
        materialKey: 'lamp_glow',
        position: [x, 0, z],
        rotationY: rotY,
        name: `StreetLamp_Bulb_${idx}`,
        sphereRadius: 5.0,
      });
      colliders.push({
        id: `lamp_${idx}`,
        name: `StreetLamp_${idx}`,
        center: [x, 2.2, z],
        size: [0.16, 2.2, 0.16],
        category: 'wall',
      });
    };

    let lampIdx = 0;
    for (const lx of [-144, -112, -80, -48, -18, 16, 44, 76, 112, 144, 176, 208]) {
      placeStreetLamp(lx, 26.8, 0, lampIdx++);
      placeStreetLamp(lx, 41.2, Math.PI, lampIdx++);
    }
    for (const lx of [-136, -72, -14, 48, 118, 184]) {
      placeStreetLamp(lx, -26.8, Math.PI, lampIdx++);
      placeStreetLamp(lx, 96.8, 0, lampIdx++);
      placeStreetLamp(lx, 111.2, Math.PI, lampIdx++);
    }

    // Roadside Shade Trees along Mega City Boulevards & Suburbs
    const treePositions: [number, number][] = [
      [-146, 42.0], [-112, 42.0], [-84, 42.0], [-42, 42.0], [10, 42.0], [40, 42.0], [84, 42.0], [108, 42.0], [176, 42.0], [208, 42.0],
      [-146, -42.0], [-112, -42.0], [-84, -42.0], [-44, -42.0], [-20, -42.0], [42, -42.0], [82, -42.0], [110, -42.0], [178, -42.0],
      [-146, 96.0], [-84, 96.0], [-44, 96.0], [4, 96.0], [38, 96.0], [82, 96.0], [142, 96.0], [182, 96.0],
      [-80, 140.0], [-12, 140.0], [54, 140.0], [122, 140.0],
    ];
    treePositions.forEach(([tx, tz], i) => {
      placements.push({
        meshKey: 'tree_trunk',
        materialKey: 'wood_door',
        position: [tx, 0, tz],
        rotationY: 0,
        name: `City_Tree_Trunk_${i}`,
        sphereRadius: 3.5,
      });
      placements.push({
        meshKey: 'tree_leaves',
        materialKey: 'tree_foliage',
        position: [tx, 0, tz],
        rotationY: (i % 4) * (Math.PI * 0.5),
        name: `City_Tree_Leaves_${i}`,
        sphereRadius: 3.5,
      });
      colliders.push({
        id: `city_tree_${i}`,
        name: `Tree_${i}`,
        center: [tx, 1.2, tz],
        size: [0.30, 1.2, 0.30],
        category: 'wall',
      });
    });

    // ==================== 4. MID-RISE URBAN TOWERS & SHOPS (Mega City Skyline) ====================
    const midriseConfigs: {
      pos: [number, number, number];
      rotY: number;
      bodyMat: string;
      name: string;
    }[] = [
      // West Downtown District
      { pos: [-64, 0, 0], rotY: 0, bodyMat: 'tower_stone_gray', name: 'MidRise_CivicWest_01' },
      { pos: [-128, 0, 0], rotY: Math.PI * 0.5, bodyMat: 'tower_stone_tan', name: 'MidRise_FarWest_01' },
      { pos: [-128, 0, -68], rotY: 0, bodyMat: 'tower_stone_gray', name: 'MidRise_FarWest_North' },
      // East Downtown Commercial District
      { pos: [128, 0, 0], rotY: 0, bodyMat: 'tower_stone_tan', name: 'MidRise_EastPlaza_01' },
      { pos: [192, 0, 0], rotY: -Math.PI * 0.5, bodyMat: 'tower_stone_gray', name: 'MidRise_Harbor_01' },
      { pos: [192, 0, 68], rotY: Math.PI, bodyMat: 'tower_stone_tan', name: 'MidRise_Harbor_South' },
      // Far North & South Downtown Anchors
      { pos: [-1, 0, -138], rotY: 0, bodyMat: 'tower_stone_gray', name: 'MidRise_Parkway_Central' },
      { pos: [60, 0, -138], rotY: 0, bodyMat: 'tower_stone_tan', name: 'MidRise_Parkway_East' },
      { pos: [-64, 0, -138], rotY: 0, bodyMat: 'tower_stone_tan', name: 'MidRise_Parkway_West' },
      { pos: [128, 0, 138], rotY: Math.PI, bodyMat: 'tower_stone_gray', name: 'MidRise_SouthRing_East' },
      { pos: [-1, 0, 138], rotY: Math.PI, bodyMat: 'tower_stone_tan', name: 'MidRise_SouthRing_Central' },
      { pos: [60, 0, 138], rotY: Math.PI, bodyMat: 'tower_stone_gray', name: 'MidRise_SouthRing_Mid' },
    ];

    const midriseColliderSpecs: BuildingColliderSpec[] = midriseSpecs.map((s, idx) => ({
      id: `mr_${idx}`,
      name: `MidRise Part ${idx}`,
      center: s.center,
      size: s.size,
      category: 'wall',
    }));

    for (const mr of midriseConfigs) {
      placements.push(
        {
          meshKey: 'midrise_body',
          materialKey: mr.bodyMat,
          position: mr.pos,
          rotationY: mr.rotY,
          name: `${mr.name}_Body`,
          sphereRadius: 19.0,
        },
        {
          meshKey: 'midrise_windows',
          materialKey: 'tower_glass_blue',
          position: mr.pos,
          rotationY: mr.rotY,
          name: `${mr.name}_Windows`,
          sphereRadius: 19.0,
        },
        {
          meshKey: 'midrise_trim',
          materialKey: 'lamp_pole',
          position: mr.pos,
          rotationY: mr.rotY,
          name: `${mr.name}_Trim`,
          sphereRadius: 19.0,
        }
      );
      for (const spec of midriseColliderSpecs) {
        colliders.push(CityBuilder.transformCollider(mr.name, spec, mr.pos, mr.rotY));
      }
    }

    // Streetfront Shops & Cafes
    const shopConfigs: { pos: [number, number, number]; rotY: number; wallMat: string; name: string }[] = [
      { pos: [110, 0, 56], rotY: Math.PI, wallMat: 'wall_terracotta', name: 'CornerCafe_East' },
      { pos: [-114, 0, 56], rotY: Math.PI, wallMat: 'wall_cream', name: 'CornerMarket_West' },
      { pos: [178, 0, 56], rotY: Math.PI, wallMat: 'wall_slate', name: 'HarborBistro_01' },
      { pos: [128, 0, 14], rotY: Math.PI * 0.5, wallMat: 'wall_terracotta', name: 'MidtownBookstore_01' },
      { pos: [-64, 0, 16], rotY: 0, wallMat: 'wall_sage', name: 'CivicDeli_01' },
      { pos: [14, 0, 134], rotY: 0, wallMat: 'wall_cream', name: 'SouthAve_Bakery_01' },
    ];
    const shopColliders: BuildingColliderSpec[] = [
      { id: 'shop_hull', name: 'Shop Building', center: [0, 2.5, 0], size: [5.5, 2.5, 4.2], category: 'wall' },
    ];
    for (const sh of shopConfigs) {
      placements.push(
        { meshKey: 'shop_body', materialKey: sh.wallMat, position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Body`, sphereRadius: 9.0 },
        { meshKey: 'shop_awning', materialKey: 'shop_awning_green', position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Awning`, sphereRadius: 9.0 },
        { meshKey: 'shop_windows', materialKey: 'window_warm', position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Windows`, sphereRadius: 9.0 }
      );
      for (const spec of shopColliders) {
        colliders.push(CityBuilder.transformCollider(sh.name, spec, sh.pos, sh.rotY));
      }
    }

    // ==================== 5. SMALL HOUSES (22 Cozy Suburb Bungalows) ====================
    const smallHouseConfigs: {
      pos: [number, number, number];
      rotY: number;
      wallMat: string;
      roofMat: string;
      name: string;
    }[] = [
      // South-West Residential Block
      { pos: [-54, 0, 52], rotY: Math.PI, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_SW_01' },
      { pos: [-74, 0, 52], rotY: Math.PI, wallMat: 'wall_sage', roofMat: 'roof_slate', name: 'SmallHouse_SW_02' },
      { pos: [-54, 0, 86], rotY: 0, wallMat: 'wall_terracotta', roofMat: 'roof_slate', name: 'SmallHouse_SW_03' },
      { pos: [-74, 0, 86], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_SW_04' },
      // Far-West Suburb
      { pos: [-118, 0, 86], rotY: 0, wallMat: 'wall_sage', roofMat: 'roof_slate', name: 'SmallHouse_FW_01' },
      { pos: [-138, 0, 86], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_FW_02' },
      { pos: [-138, 0, 52], rotY: Math.PI, wallMat: 'wall_slate', roofMat: 'roof_slate', name: 'SmallHouse_FW_03' },
      // North-West Residential Block
      { pos: [-54, 0, -52], rotY: 0, wallMat: 'wall_slate', roofMat: 'roof_slate', name: 'SmallHouse_NW_01' },
      { pos: [-74, 0, -52], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_NW_02' },
      { pos: [-64, 0, -80], rotY: Math.PI, wallMat: 'wall_sage', roofMat: 'roof_terracotta', name: 'SmallHouse_NW_03' },
      { pos: [-118, 0, -52], rotY: 0, wallMat: 'wall_terracotta', roofMat: 'roof_slate', name: 'SmallHouse_NW_04' },
      { pos: [-138, 0, -52], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_NW_05' },
      // North-East Residential Block
      { pos: [116, 0, -52], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_NE_01' },
      { pos: [138, 0, -52], rotY: 0, wallMat: 'wall_terracotta', roofMat: 'roof_slate', name: 'SmallHouse_NE_02' },
      { pos: [127, 0, -80], rotY: Math.PI, wallMat: 'wall_sage', roofMat: 'roof_slate', name: 'SmallHouse_NE_03' },
      { pos: [182, 0, -52], rotY: 0, wallMat: 'wall_slate', roofMat: 'roof_slate', name: 'SmallHouse_NE_04' },
      { pos: [204, 0, -52], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_NE_05' },
      // Outer South Suburbs (along South Blvd -> Metro Ring)
      { pos: [-54, 0, 124], rotY: Math.PI, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_OS_01' },
      { pos: [-74, 0, 124], rotY: Math.PI, wallMat: 'wall_sage', roofMat: 'roof_slate', name: 'SmallHouse_OS_02' },
      { pos: [-64, 0, 152], rotY: 0, wallMat: 'wall_slate', roofMat: 'roof_terracotta', name: 'SmallHouse_OS_03' },
      { pos: [182, 0, 124], rotY: Math.PI, wallMat: 'wall_terracotta', roofMat: 'roof_slate', name: 'SmallHouse_ES_01' },
      { pos: [202, 0, 124], rotY: Math.PI, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'SmallHouse_ES_02' },
    ];

    for (const sh of smallHouseConfigs) {
      placements.push(
        { meshKey: 'small_house_body', materialKey: sh.wallMat, position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Body`, sphereRadius: 7.5 },
        { meshKey: 'small_house_porch', materialKey: 'sidewalk', position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Porch`, sphereRadius: 7.5 },
        { meshKey: 'small_house_trim', materialKey: 'wood_door', position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Door`, sphereRadius: 7.5 },
        { meshKey: 'small_house_windows', materialKey: 'window_warm', position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Windows`, sphereRadius: 7.5 },
        { meshKey: 'small_house_roof', materialKey: sh.roofMat, position: sh.pos, rotationY: sh.rotY, name: `${sh.name}_Roof`, sphereRadius: 7.5 }
      );

      for (const spec of smallHouseWalls) {
        colliders.push(CityBuilder.transformCollider(sh.name, spec, sh.pos, sh.rotY));
      }
    }

    // ==================== 6. LIVING HOUSES (15 Enterable 2-Story Homes) ====================
    const livingHouseConfigs: {
      pos: [number, number, number];
      rotY: number;
      wallMat: string;
      roofMat: string;
      name: string;
    }[] = [
      // South-Central Block (across Main Boulevard beside Gas Station #1)
      { pos: [14, 0, 56], rotY: Math.PI, wallMat: 'wall_cream', roofMat: 'roof_slate', name: 'LivingHouse_Main_01' },
      { pos: [14, 0, 84], rotY: 0, wallMat: 'wall_sage', roofMat: 'roof_terracotta', name: 'LivingHouse_Main_02' },
      // South-East Residential Block (shifted cleanly east to give Downtown Gun Shop prime Main Blvd frontage)
      { pos: [63, 0, 56], rotY: Math.PI, wallMat: 'wall_slate', roofMat: 'roof_slate', name: 'LivingHouse_SE_01' },
      { pos: [80, 0, 56], rotY: Math.PI, wallMat: 'wall_terracotta', roofMat: 'roof_slate', name: 'LivingHouse_SE_02' },
      { pos: [50, 0, 84], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'LivingHouse_SE_03' },
      { pos: [74, 0, 84], rotY: 0, wallMat: 'wall_slate', roofMat: 'roof_terracotta', name: 'LivingHouse_SE_04' },
      // North Residential Avenue (behind Business Towers)
      { pos: [-10, 0, -54], rotY: 0, wallMat: 'wall_sage', roofMat: 'roof_slate', name: 'LivingHouse_North_01' },
      { pos: [14, 0, -54], rotY: 0, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'LivingHouse_North_02' },
      { pos: [60, 0, -54], rotY: 0, wallMat: 'wall_slate', roofMat: 'roof_slate', name: 'LivingHouse_North_03' },
      { pos: [-10, 0, -84], rotY: Math.PI, wallMat: 'wall_cream', roofMat: 'roof_terracotta', name: 'LivingHouse_North_04' },
      { pos: [14, 0, -84], rotY: Math.PI, wallMat: 'wall_terracotta', roofMat: 'roof_slate', name: 'LivingHouse_North_05' },
      { pos: [60, 0, -84], rotY: Math.PI, wallMat: 'wall_sage', roofMat: 'roof_slate', name: 'LivingHouse_North_06' },
      // Harbor East & South Districts
      { pos: [192, 0, 52], rotY: Math.PI, wallMat: 'wall_cream', roofMat: 'roof_slate', name: 'LivingHouse_Harbor_01' },
      { pos: [192, 0, 86], rotY: 0, wallMat: 'wall_sage', roofMat: 'roof_terracotta', name: 'LivingHouse_Harbor_02' },
      { pos: [-128, 0, 124], rotY: Math.PI, wallMat: 'wall_slate', roofMat: 'roof_slate', name: 'LivingHouse_FarWest_01' },
    ];

    for (const lh of livingHouseConfigs) {
      placements.push(
        { meshKey: 'living_house_shell', materialKey: lh.wallMat, position: lh.pos, rotationY: lh.rotY, name: `${lh.name}_Shell`, sphereRadius: 11.5 },
        { meshKey: 'living_house_trim', materialKey: 'wood_door', position: lh.pos, rotationY: lh.rotY, name: `${lh.name}_Trim`, sphereRadius: 11.5 },
        { meshKey: 'living_house_windows', materialKey: 'window_warm', position: lh.pos, rotationY: lh.rotY, name: `${lh.name}_Windows`, sphereRadius: 11.5 },
        { meshKey: 'living_house_furniture', materialKey: 'sofa_fabric', position: lh.pos, rotationY: lh.rotY, name: `${lh.name}_Furniture`, sphereRadius: 11.5 },
        { meshKey: 'living_house_roof', materialKey: lh.roofMat, position: lh.pos, rotationY: lh.rotY, name: `${lh.name}_Roof`, sphereRadius: 11.5 }
      );

      for (const spec of livingColliders) {
        colliders.push(CityBuilder.transformCollider(lh.name, spec, lh.pos, lh.rotY));
      }
    }

    // ==================== 7. GAS STATIONS (3 Full Service Stations) ====================
    const gasStationConfigs: {
      pos: [number, number, number];
      rotY: number;
      accentMat: string;
      name: string;
    }[] = [
      { pos: [-10, 0, 56], rotY: Math.PI, accentMat: 'gas_brand_red', name: 'GasStation_MainBlvd' },
      { pos: [128, 0, 56], rotY: Math.PI, accentMat: 'gas_brand_red', name: 'GasStation_EastSide' },
      { pos: [-128, 0, -138], rotY: 0, accentMat: 'gas_brand_red', name: 'GasStation_NorthWest' },
    ];

    for (const gs of gasStationConfigs) {
      placements.push(
        { meshKey: 'gas_station_structure', materialKey: 'gas_canopy', position: gs.pos, rotationY: gs.rotY, name: `${gs.name}_Structure`, sphereRadius: 16.0 },
        { meshKey: 'gas_station_fascia', materialKey: gs.accentMat, position: gs.pos, rotationY: gs.rotY, name: `${gs.name}_Fascia`, sphereRadius: 16.0 },
        { meshKey: 'gas_station_pumps', materialKey: 'gas_brand_cyan', position: gs.pos, rotationY: gs.rotY, name: `${gs.name}_Pumps`, sphereRadius: 16.0 },
        { meshKey: 'gas_station_windows', materialKey: 'window_warm', position: gs.pos, rotationY: gs.rotY, name: `${gs.name}_Windows`, sphereRadius: 16.0 }
      );

      for (const spec of gasColliders) {
        colliders.push(CityBuilder.transformCollider(gs.name, spec, gs.pos, gs.rotY));
      }
    }

    // ==================== 8. CITY 0 POLICE STATION + HOLDING CELL (Block [-11, 0, 82]) ====================
    const policeStationPos: [number, number, number] = [-11, 0, 82];
    const policeJailCellPos: [number, number, number] = [-18.0, 0.14, 77.2];
    placements.push(
      { meshKey: 'police_station_shell', materialKey: 'tower_stone_gray', position: policeStationPos, rotationY: 0, name: 'City0_PoliceStation_Shell', sphereRadius: 15.0 },
      { meshKey: 'police_station_fascia', materialKey: 'police_sign_blue', position: policeStationPos, rotationY: 0, name: 'City0_PoliceStation_Fascia', sphereRadius: 15.0 },
      { meshKey: 'police_station_windows', materialKey: 'tower_glass_blue', position: policeStationPos, rotationY: 0, name: 'City0_PoliceStation_Windows', sphereRadius: 15.0 },
      { meshKey: 'police_station_beacons', materialKey: 'police_light_blue', position: policeStationPos, rotationY: 0, name: 'City0_PoliceStation_BeaconBlue', sphereRadius: 15.0 },
      { meshKey: 'police_station_beacons_red', materialKey: 'police_light_red', position: policeStationPos, rotationY: 0, name: 'City0_PoliceStation_BeaconRed', sphereRadius: 15.0 },
      { meshKey: 'police_station_sign', materialKey: 'police_sign_blue', position: [-11, 5.55, 90.3], rotationY: 0, name: 'City0_PoliceStation_Sign3D', sphereRadius: 8.0 },
      { meshKey: 'police_jail_bars', materialKey: 'prison_bars', position: policeStationPos, rotationY: 0, name: 'City0_PoliceStation_CellBars', sphereRadius: 12.0 }
    );
    for (let i = 0; i < policeStationSpecs.length; i++) {
      const sp = policeStationSpecs[i];
      colliders.push(
        CityBuilder.transformCollider(
          'City0_PoliceStation',
          { id: `ps_${i}`, name: sp.name, center: sp.center, size: sp.size, category: sp.cat },
          policeStationPos,
          0
        )
      );
    }
    // Cell side bars & lockable jail cell gate (starts unlocked as trigger until arrested!)
    colliders.push(
      { id: 'City0_PoliceStation_CellBarsSide', name: 'Police Cell Side Bars', center: [-16.6, 1.85, 77.0], size: [0.15, 1.85, 2.8], category: 'wall' },
      { id: 'City0_PoliceStation_JailGate', name: 'Police Jail Cell Gate', center: [-17.85, 1.85, 79.8], size: [1.3, 1.85, 0.16], category: 'wall', isTrigger: true }
    );

    // ==================== 8b. DOWNTOWN GUN SHOP ([44, 0, 52], facing Main Blvd) ====================
    const gunShopPos: [number, number, number] = [44, 0, 52];
    const gunShopCounterPos: [number, number, number] = [44, 0.12, 52.4];
    placements.push(
      { meshKey: 'gunshop_shell', materialKey: 'gunshop_wall', position: gunShopPos, rotationY: Math.PI, name: 'City0_GunShop_Shell', sphereRadius: 10.0 },
      { meshKey: 'gunshop_accent', materialKey: 'gunshop_red', position: gunShopPos, rotationY: Math.PI, name: 'City0_GunShop_Accent', sphereRadius: 10.0 },
      { meshKey: 'gunshop_weapons_display', materialKey: 'gun_metal', position: gunShopPos, rotationY: Math.PI, name: 'City0_GunShop_Weapons', sphereRadius: 9.0 },
      { meshKey: 'gunshop_pickup_pad', materialKey: 'gun_pad_glow', position: gunShopPos, rotationY: Math.PI, name: 'City0_GunShop_PickupPad', sphereRadius: 4.0 },
      { meshKey: 'gunshop_sign', materialKey: 'gunshop_red', position: [44, 5.25, 46.5], rotationY: Math.PI, name: 'City0_GunShop_Sign3D', sphereRadius: 7.0 }
    );
    for (let i = 0; i < gunShopSpecs.length; i++) {
      const sp = gunShopSpecs[i];
      colliders.push(
        CityBuilder.transformCollider(
          'City0_GunShop',
          { id: `gs_shop_${i}`, name: sp.name, center: sp.center, size: sp.size, category: sp.cat },
          gunShopPos,
          Math.PI
        )
      );
    }

    // ==================== 8c. OUT-OF-CITY MAXIMUM SECURITY PRISON ([-32, 0, -220]) ====================
    const maxPrisonPos: [number, number, number] = [-32, 0, -220];
    const maxPrisonCellPos: [number, number, number] = [-32.0, 0.18, -221.5];
    placements.push(
      { meshKey: 'maxprison_shell', materialKey: 'prison_concrete', position: maxPrisonPos, rotationY: 0, name: 'MaxSecurityPrison_Shell', sphereRadius: 34.0 },
      { meshKey: 'maxprison_bars_doors', materialKey: 'prison_bars', position: maxPrisonPos, rotationY: 0, name: 'MaxSecurityPrison_Steel', sphereRadius: 34.0 },
      { meshKey: 'maxprison_beacons', materialKey: 'prison_beacon_amber', position: maxPrisonPos, rotationY: 0, name: 'MaxSecurityPrison_Beacons', sphereRadius: 34.0 },
      { meshKey: 'maxprison_sign', materialKey: 'prison_beacon_amber', position: [-32, 7.65, -200.0], rotationY: 0, name: 'MaxSecurityPrison_Sign3D', sphereRadius: 12.0 }
    );
    for (let i = 0; i < maxPrisonSpecs.length; i++) {
      const sp = maxPrisonSpecs[i];
      colliders.push(
        CityBuilder.transformCollider(
          'MaxSecurityPrison',
          { id: `mp_${i}`, name: sp.name, center: sp.center, size: sp.size, category: sp.cat },
          maxPrisonPos,
          0
        )
      );
    }
    colliders.push(
      { id: 'MaxPrison_JailGate', name: 'Max Prison Cellblock Gate', center: [-32.0, 2.0, -214.5], size: [2.2, 2.0, 0.25], category: 'wall', isTrigger: true }
    );

    // ==================== 8d. DOWNTOWN BILLBOARDS (Switch to WANTED Poster on Big Crime) ====================
    const billboards: CityBillboardSpawn[] = [
      { id: 'bb_plaza', name: 'Billboard_MainBlvd_Plaza', position: [19.5, 0, 25.0], rotationY: -0.32 },
      { id: 'bb_gas', name: 'Billboard_MainBlvd_GasStation', position: [-24.5, 0, 42.5], rotationY: 0.45 },
      { id: 'bb_east', name: 'Billboard_SecondaryTower', position: [41.0, 0, 25.0], rotationY: -0.22 },
      { id: 'bb_precinct', name: 'Billboard_PrecinctSouth', position: [-24.0, 0, 88.0], rotationY: 0.65 },
    ];
    for (const bb of billboards) {
      placements.push({
        meshKey: 'billboard_frame',
        materialKey: 'billboard_steel',
        position: bb.position,
        rotationY: bb.rotationY,
        name: `${bb.name}_Frame`,
        sphereRadius: 9.0,
      });
      colliders.push({
        id: `col_${bb.id}`,
        name: `${bb.name} Pillar`,
        center: [bb.position[0], 2.2, bb.position[2]],
        size: [0.42, 2.2, 0.42],
        category: 'wall',
      });
    }

    // ==================== 9. CITY 0 VIDEO CAMERAS (18 Surveillance Units) ====================
    const cctvCameras: CityCCTVCamSpawn[] = [
      // Main Tower Courtyard & Entrances
      { id: 'cctv_01', name: 'CCTV_MainTower_CourtyardL', pos: [-6.5, 4.6, 20.6], baseRotY: 0.25 },
      { id: 'cctv_02', name: 'CCTV_MainTower_CourtyardR', pos: [6.5, 4.6, 20.6], baseRotY: -0.25 },
      { id: 'cctv_03', name: 'CCTV_MainBlvd_Civic_NW', pos: [-25.5, 4.8, 26.8], baseRotY: 2.35 },
      { id: 'cctv_04', name: 'CCTV_MainBlvd_Civic_SE', pos: [-38.5, 4.8, 41.2], baseRotY: -0.78 },
      { id: 'cctv_05', name: 'CCTV_MainBlvd_Commerce_NE', pos: [23.5, 4.8, 26.8], baseRotY: -2.35 },
      { id: 'cctv_06', name: 'CCTV_MainBlvd_Commerce_SW', pos: [36.5, 4.8, 41.2], baseRotY: 0.78 },
      // Police Station Perimeter & South Blvd
      { id: 'cctv_07', name: 'CCTV_PoliceStation_FrontL', pos: [-19.5, 4.7, 90.2], baseRotY: 0.3 },
      { id: 'cctv_08', name: 'CCTV_PoliceStation_FrontR', pos: [-2.5, 4.7, 90.2], baseRotY: -0.3 },
      { id: 'cctv_09', name: 'CCTV_SouthBlvd_Civic', pos: [-25.5, 4.8, 96.8], baseRotY: 0.7 },
      { id: 'cctv_10', name: 'CCTV_SouthBlvd_Commerce', pos: [23.5, 4.8, 111.2], baseRotY: -2.3 },
      // Gas Station #1 & Secondary Tower & Gun Shop
      { id: 'cctv_11', name: 'CCTV_GasStation1_Canopy', pos: [-17.4, 4.7, 48.0], baseRotY: Math.PI },
      { id: 'cctv_12', name: 'CCTV_GasStation1_PumpRow', pos: [-2.6, 4.7, 63.8], baseRotY: 0 },
      { id: 'cctv_13', name: 'CCTV_SecondaryTower_Plaza', pos: [60.0, 4.6, 20.6], baseRotY: 0 },
      { id: 'cctv_14', name: 'CCTV_GunShop_MainBlvd', pos: [44.0, 4.6, 46.8], baseRotY: Math.PI },
      // North Avenue, West Avenue & Max Prison Gate Coverage
      { id: 'cctv_15', name: 'CCTV_NorthAve_Civic', pos: [-25.5, 4.8, -26.8], baseRotY: -0.7 },
      { id: 'cctv_16', name: 'CCTV_NorthAve_Commerce', pos: [36.5, 4.8, -41.2], baseRotY: 2.3 },
      { id: 'cctv_17', name: 'CCTV_WestAve_MainBlvd', pos: [-89.5, 4.8, 26.8], baseRotY: 2.35 },
      { id: 'cctv_18', name: 'CCTV_MaxPrison_MainGate', pos: [-32.0, 6.2, -199.5], baseRotY: 0 },
    ];
    for (const cam of cctvCameras) {
      placements.push({
        meshKey: 'cctv_mount',
        materialKey: 'lamp_pole',
        position: cam.pos,
        rotationY: cam.baseRotY,
        name: `${cam.name}_Mount`,
        sphereRadius: 2.0,
      });
    }

    // ==================== 10. HERO 3D CAR MODEL + CITY DRIVEABLE CARS ====================
    const cars: CityCarSpawn[] = [
      { id: 'car_hero_crimson', name: 'Crimson Sports Sedan', position: [-10.5, 0.06, 30.2], rotationY: Math.PI * 0.5, paintMat: 'car_paint_crimson' },
      { id: 'car_station_cobalt', name: 'Cobalt Fuel Sedan', position: [-10.0, 0.10, 52.5], rotationY: Math.PI * 0.5, paintMat: 'car_paint_cobalt' },
      { id: 'car_east_silver', name: 'Silver Metro Sedan', position: [48.0, 0.06, 37.8], rotationY: -Math.PI * 0.5, paintMat: 'car_paint_silver' },
      { id: 'car_market_crimson', name: 'Eastside Cruiser', position: [122.0, 0.10, 52.5], rotationY: Math.PI * 0.5, paintMat: 'car_paint_crimson' },
    ];
    void carColliders;

    // ==================== 11. 15 POLICE CARS (2 ACTIVE PATROLS: 1 NORTH + 1 SOUTH, 13 RESERVE FOR BIG CRIME) ====================
    const policeCars: CityCarSpawn[] = [
      // ONLY 2 Active Street Patrols during calm state: 1 North Sector + 1 South Sector
      { id: 'police_car_01', name: 'Police North Patrol #01', position: [-18.0, 0.06, -34.0], rotationY: Math.PI * 0.5, paintMat: 'police_black', sector: 'NORTH', alwaysPatrol: true },
      { id: 'police_car_02', name: 'Police South Patrol #02', position: [16.0, 0.06, 37.0], rotationY: -Math.PI * 0.5, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: true },
      // 13 Parked Reserve Police Cruisers (Precinct + Substations + Max Prison) dispatched on Big Crime!
      { id: 'police_car_03', name: 'Police Reserve #03 (Precinct Bay)', position: [-16.0, 0.06, 94.0], rotationY: 0, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_04', name: 'Police Reserve #04 (Precinct Bay)', position: [-11.0, 0.06, 94.0], rotationY: 0, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_05', name: 'Police Reserve #05 (Precinct Bay)', position: [-6.0, 0.06, 94.0], rotationY: 0, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_06', name: 'Police Reserve #06 (Civic Post)', position: [-29.0, 0.06, 70.0], rotationY: 0, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_07', name: 'Police Reserve #07 (Civic Post)', position: [-29.0, 0.06, 82.0], rotationY: Math.PI, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_08', name: 'Police Reserve #08 (Main West)', position: [-64.0, 0.06, 31.0], rotationY: Math.PI * 0.5, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_09', name: 'Police Reserve #09 (Commerce Unit)', position: [33.0, 0.06, 68.0], rotationY: 0, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
      { id: 'police_car_10', name: 'Police Reserve #10 (North Substation)', position: [-35.0, 0.06, -12.0], rotationY: Math.PI, paintMat: 'police_black', sector: 'NORTH', alwaysPatrol: false },
      { id: 'police_car_11', name: 'Police Reserve #11 (North East)', position: [99.0, 0.06, -16.0], rotationY: Math.PI, paintMat: 'police_black', sector: 'NORTH', alwaysPatrol: false },
      { id: 'police_car_12', name: 'Police Reserve #12 (Parkway Post)', position: [14.0, 0.06, -31.0], rotationY: Math.PI * 0.5, paintMat: 'police_black', sector: 'NORTH', alwaysPatrol: false },
      { id: 'police_car_13', name: 'Police Reserve #13 (Max Prison Gate L)', position: [-42.0, 0.06, -193.0], rotationY: 0, paintMat: 'police_black', sector: 'NORTH', alwaysPatrol: false },
      { id: 'police_car_14', name: 'Police Reserve #14 (Max Prison Gate R)', position: [-22.0, 0.06, -193.0], rotationY: 0, paintMat: 'police_black', sector: 'NORTH', alwaysPatrol: false },
      { id: 'police_car_15', name: 'Police Reserve #15 (South Ring Reserve)', position: [-42.0, 0.06, 171.0], rotationY: Math.PI * 0.5, paintMat: 'police_black', sector: 'SOUTH', alwaysPatrol: false },
    ];

    // ==================== 12. MOVEABLE ROADSIDE PROPS ====================
    const propSpawns: CityWorldData['propSpawns'] = [
      { kind: 'cone', name: 'GasStation1_Cone_01', pos: [-16.2, 0.54, 48.0], mass: 0.55, restitution: 0.45 },
      { kind: 'cone', name: 'GasStation1_Cone_02', pos: [-3.8, 0.54, 48.0], mass: 0.55, restitution: 0.45 },
      { kind: 'barrel', name: 'GasStation1_Drum_01', pos: [-18.2, 0.62, 54.0], mass: 1.25, restitution: 0.42 },
      { kind: 'bin', name: 'GasStation1_Bin_01', pos: [-7.5, 0.46, 51.2], mass: 0.65, restitution: 0.40 },
      { kind: 'octacrate', name: 'LivingHouse_Front_Crate', pos: [16.5, 0.57, 46.5], mass: 1.0, restitution: 0.38 },
      { kind: 'cone', name: 'MainBlvd_Crosswalk_Cone', pos: [21.0, 0.56, 27.2], mass: 0.55, restitution: 0.45 },
      { kind: 'bin', name: 'SmallHouse_Street_Bin', pos: [-51.5, 0.48, 42.0], mass: 0.65, restitution: 0.40 },
      { kind: 'crate', name: 'GasStation2_Supply_Crate', pos: [124.0, 0.55, 48.5], mass: 1.0, restitution: 0.38 },
      { kind: 'barrel', name: 'HarborCafe_Drum_01', pos: [174.0, 0.62, 48.0], mass: 1.25, restitution: 0.42 },
      { kind: 'crate', name: 'CivicDeli_Crate_01', pos: [-60.0, 0.54, 24.0], mass: 1.0, restitution: 0.38 },
    ];

    return {
      meshes,
      materials,
      placements,
      colliders,
      cars,
      policeCars,
      cctvCameras,
      billboards,
      gunShopCounterPos,
      policeJailCellPos,
      maxPrisonCellPos,
      propSpawns,
    };
  }
}
