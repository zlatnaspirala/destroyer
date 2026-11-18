/**
 * Destroyer Engine - Jolt-Style Lightweight 3D Physics Engine
 * Features:
 * - AABB / Box Colliders synchronized 1:1 with ProceduralModels geometry
 * - Sub-stepped Swept Character Controller with Slide-and-Step wall sliding & stair auto-climb
 * - Moving Platform support (Elevators with velocity inheritance)
 * - Proximity Triggers (Automatic opening doors)
 */

import { ProceduralModels } from '../loaders/ProceduralModels';

export interface BoxCollider {
  id: string;
  name: string;
  center: [number, number, number]; // World space center [x, y, z]
  size: [number, number, number];   // Half-extents [hx, hy, hz]
  category?: 'wall' | 'floor' | 'stair' | 'prop';
  isTrigger?: boolean;
  onTrigger?: (playerPos: [number, number, number]) => void;
  entityId?: number;
}

export interface MoveableObject {
  id: string;
  entityId: number;
  extraEntityIds?: number[];
  name: string;
  position: [number, number, number];
  halfExtents: [number, number, number];
  shape: 'box' | 'cylinder' | 'convex';
  velocity: [number, number, number];
  rotationY: number;
  angularVelY: number;
  tiltX: number;
  tiltZ: number;
  mass: number;
  restitution: number;
  colliderId: string;
}

export interface NPCPunchTarget {
  id: string;
  name: string;
  position: [number, number, number];
  radius: number;
  height: number;
}

export interface CharacterCapsule {
  radius: number; // 0.4m radius
  height: number; // 1.8m height
  position: [number, number, number]; // Bottom feet position [x, y, z]
  velocity: [number, number, number];
  isGrounded: boolean;
  groundEntityId?: string;
}

export class JoltPhysics {
  public static readonly maxStepHeight = 0.55; // Auto stair-step climb height
  public colliders: Map<string, BoxCollider> = new Map();

  // Dynamic state
  public elevatorY = 0.15; // Elevator platform top Y
  public elevatorTargetY = 0.15;
  public elevatorTargetFloor = 0;
  public elevatorSpeed = 6.0;
  public elevatorPlatformId = 'elevator_platform';

  public doorOpenFactor = 0; // 0 = closed, 1 = fully open
  public doorTargetOpen = 0;
  public doorLeftId = 'door_left';
  public doorRightId = 'door_right';

  // Dynamic Moveable Props (crates, barrels, mid-level convex shapes)
  public moveableObjects: MoveableObject[] = [];
  private propColliderLookup: Map<string, MoveableObject> = new Map();
  public npcPunchTargets: NPCPunchTarget[] = [];

  constructor() {
    this.setupDefaultBuildingPhysics();
  }

  public addBoxCollider(collider: BoxCollider): void {
    this.colliders.set(collider.id, collider);
  }

  public removeBoxCollider(id: string): void {
    this.colliders.delete(id);
  }

  public registerNPCPunchTarget(target: NPCPunchTarget): void {
    const existing = this.npcPunchTargets.findIndex((t) => t.id === target.id);
    if (existing >= 0) {
      this.npcPunchTargets[existing] = target;
    } else {
      this.npcPunchTargets.push(target);
    }
  }

  public addMoveableObject(params: {
    id: string;
    entityId: number;
    extraEntityIds?: number[];
    name: string;
    position: [number, number, number];
    halfExtents: [number, number, number];
    shape?: 'box' | 'cylinder' | 'convex';
    mass?: number;
    restitution?: number;
  }): MoveableObject {
    const colliderId = `prop_col_${params.id}`;
    const obj: MoveableObject = {
      id: params.id,
      entityId: params.entityId,
      extraEntityIds: params.extraEntityIds,
      name: params.name,
      position: [params.position[0], params.position[1], params.position[2]],
      halfExtents: [params.halfExtents[0], params.halfExtents[1], params.halfExtents[2]],
      shape: params.shape ?? 'box',
      velocity: [0, 0, 0],
      rotationY: 0,
      angularVelY: 0,
      tiltX: 0,
      tiltZ: 0,
      mass: params.mass ?? 1.0,
      restitution: params.restitution ?? 0.35,
      colliderId,
    };
    this.moveableObjects.push(obj);
    this.propColliderLookup.set(colliderId, obj);
    this.addBoxCollider({
      id: colliderId,
      name: params.name,
      center: [obj.position[0], obj.position[1], obj.position[2]],
      size: [obj.halfExtents[0], obj.halfExtents[1], obj.halfExtents[2]],
      category: 'prop',
      entityId: params.entityId,
    });
    return obj;
  }

  public clear(): void {
    this.colliders.clear();
    this.moveableObjects = [];
    this.propColliderLookup.clear();
    this.npcPunchTargets = [];
  }

  public setElevatorTargetFloor(floor: number): void {
    this.elevatorTargetFloor = Math.max(0, Math.min(10, Math.floor(floor)));
  }

  /**
   * Set up a 10-story skyscraper at a specific offset using the exact
   * collider specifications generated alongside visual geometry in ProceduralModels.
   */
  public addSkyscraperPhysics(offset: [number, number, number] = [0, 0, 0]): void {
    const [ox, oy, oz] = offset;
    const specs = ProceduralModels.getSkyscraperColliderSpecs();

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      this.addBoxCollider({
        id: `${spec.id}_${ox}_${oz}`,
        name: spec.name,
        center: [spec.center[0] + ox, spec.center[1] + oy, spec.center[2] + oz],
        size: [spec.size[0], spec.size[1], spec.size[2]],
        category: spec.category,
      });
    }

    // Dynamic Doors, Trigger & Elevator Cab (Main Building at ox === 0)
    if (ox === 0) {
      this.addBoxCollider({
        id: this.doorLeftId,
        name: `Sliding Door Left`,
        center: [ox - 2.0, oy + 1.2, oz + 20.0],
        size: [1.96, 1.2, 0.15],
        category: 'wall',
      });
      this.addBoxCollider({
        id: this.doorRightId,
        name: `Sliding Door Right`,
        center: [ox + 2.0, oy + 1.2, oz + 20.0],
        size: [1.96, 1.2, 0.15],
        category: 'wall',
      });
      this.addBoxCollider({
        id: 'door_trigger_sensor',
        name: `Door Proximity Sensor`,
        center: [ox, oy + 2.0, oz + 20.0],
        size: [6.0, 2.5, 6.0],
        isTrigger: true,
      });

      // Elevator Cab
      this.addBoxCollider({
        id: this.elevatorPlatformId,
        name: `Elevator Floor`,
        center: [ox + 14.0, oy + 0.15, oz + 10.0],
        size: [2.4, 0.15, 2.4],
        category: 'floor',
      });
      this.addBoxCollider({
        id: 'elevator_wall_rear',
        name: `Elevator Wall Rear`,
        center: [ox + 14.0, oy + 1.55, oz + 7.65],
        size: [2.4, 1.25, 0.08],
        category: 'wall',
      });
      this.addBoxCollider({
        id: 'elevator_wall_left',
        name: `Elevator Wall Left`,
        center: [ox + 11.65, oy + 1.55, oz + 10.0],
        size: [0.08, 1.25, 2.4],
        category: 'wall',
      });
      this.addBoxCollider({
        id: 'elevator_wall_right',
        name: `Elevator Wall Right`,
        center: [ox + 16.35, oy + 1.55, oz + 10.0],
        size: [0.08, 1.25, 2.4],
        category: 'wall',
      });
      this.addBoxCollider({
        id: 'elevator_roof',
        name: `Elevator Roof`,
        center: [ox + 14.0, oy + 2.85, oz + 10.0],
        size: [2.4, 0.1, 2.4],
        category: 'floor',
      });
    }
  }

  public setupDefaultBuildingPhysics(): void {
    this.clear();

    // Massive Ground Slab (4000m x 4000m)
    this.addBoxCollider({
      id: 'ground_slab',
      name: 'Global Ground Slab',
      center: [0, -0.2, 0],
      size: [2000, 0.2, 2000],
      category: 'floor',
    });

    // Add Main Building
    this.addSkyscraperPhysics([0, 0, 0]);

    // Add Secondary Building (Modular Reuse Demo)
    this.addSkyscraperPhysics([60, 0, 0]);
  }

  /**
   * Update dynamic physics objects (Moving Elevator & Automatic Door)
   */
  public updateDynamicPhysics(dt: number, playerPos: [number, number, number]): { elevatorDeltaY: number } {
    // 1. Automatic Entrance Door Proximity Check
    const distToDoor = Math.hypot(playerPos[0] - 0.0, playerPos[2] - 20.0);
    const inDoorRange = distToDoor < 6.0 && Math.abs(playerPos[1] - 1.0) < 3.0;

    this.doorTargetOpen = inDoorRange ? 1.0 : 0.0;
    const doorSpeed = 4.0;
    if (this.doorOpenFactor < this.doorTargetOpen) {
      this.doorOpenFactor = Math.min(this.doorTargetOpen, this.doorOpenFactor + dt * doorSpeed);
    } else if (this.doorOpenFactor > this.doorTargetOpen) {
      this.doorOpenFactor = Math.max(this.doorTargetOpen, this.doorOpenFactor - dt * doorSpeed);
    }

    // Move door colliders
    const leftDoor = this.colliders.get(this.doorLeftId);
    const rightDoor = this.colliders.get(this.doorRightId);

    if (leftDoor) {
      leftDoor.center[0] = -2.0 - this.doorOpenFactor * 3.5;
    }
    if (rightDoor) {
      rightDoor.center[0] = 2.0 + this.doorOpenFactor * 3.5;
    }

    // 2. Elevator Motion Machine toward target floor
    let elevatorDeltaY = 0;
    const targetY = this.elevatorTargetFloor * 4.0 + 0.15;

    if (Math.abs(this.elevatorY - targetY) > 0.005) {
      const prevY = this.elevatorY;
      const step = dt * this.elevatorSpeed;
      if (this.elevatorY < targetY) {
        this.elevatorY = Math.min(targetY, this.elevatorY + step);
      } else {
        this.elevatorY = Math.max(targetY, this.elevatorY - step);
      }
      elevatorDeltaY = this.elevatorY - prevY;
    }

    // Update ALL 5 dynamic enclosed elevator cab box colliders synchronously
    const elePlatform = this.colliders.get(this.elevatorPlatformId);
    if (elePlatform) elePlatform.center[1] = this.elevatorY;

    const eleRear = this.colliders.get('elevator_wall_rear');
    if (eleRear) eleRear.center[1] = this.elevatorY + 1.4;

    const eleLeft = this.colliders.get('elevator_wall_left');
    if (eleLeft) eleLeft.center[1] = this.elevatorY + 1.4;

    const eleRight = this.colliders.get('elevator_wall_right');
    if (eleRight) eleRight.center[1] = this.elevatorY + 1.4;

    const eleRoof = this.colliders.get('elevator_roof');
    if (eleRoof) eleRoof.center[1] = this.elevatorY + 2.7;

    return { elevatorDeltaY };
  }

  /**
   * Apply a punch impulse from the player toward nearby moveable objects in front of them.
   */
  public punchNearestObjects(
    playerPos: [number, number, number],
    forwardDir: [number, number, number],
    range = 2.75,
    power = 12.5
  ): { hitCount: number; hitNames: string[]; hitNPCIds: string[] } {
    const fLen = Math.hypot(forwardDir[0], forwardDir[2]) || 1;
    const fx = forwardDir[0] / fLen;
    const fz = forwardDir[2] / fLen;

    const hitNames: string[] = [];
    const hitNPCIds: string[] = [];
    const fistY = playerPos[1] + 1.15;

    for (let i = 0; i < this.moveableObjects.length; i++) {
      const obj = this.moveableObjects[i];
      const dx = obj.position[0] - playerPos[0];
      const dz = obj.position[2] - playerPos[2];
      const dy = obj.position[1] - fistY;

      const surfacePad = Math.max(obj.halfExtents[0], obj.halfExtents[2]);
      const horizDist = Math.hypot(dx, dz);
      const effectiveDist = Math.max(0, horizDist - surfacePad);

      if (effectiveDist > range) continue;
      if (Math.abs(dy) > 1.45 + obj.halfExtents[1]) continue;

      const dirX = horizDist > 0.001 ? dx / horizDist : fx;
      const dirZ = horizDist > 0.001 ? dz / horizDist : fz;
      const forwardDot = dirX * fx + dirZ * fz;

      // Accept anything in front hemisphere/cone, or touching right next to player
      if (forwardDot > 0.15 || effectiveDist < 0.85) {
        const invMass = 1.0 / Math.max(0.35, obj.mass);
        const proximityBoost = 1.0 - Math.min(0.45, (effectiveDist / range) * 0.45);
        const impulse = power * invMass * proximityBoost;

        // Blend player forward punch vector with center-to-object push vector
        const pushX = fx * 0.72 + dirX * 0.28;
        const pushZ = fz * 0.72 + dirZ * 0.28;
        const pLen = Math.hypot(pushX, pushZ) || 1;

        obj.velocity[0] += (pushX / pLen) * impulse;
        obj.velocity[2] += (pushZ / pLen) * impulse;
        obj.velocity[1] = Math.max(obj.velocity[1], 0) + (3.6 + Math.random() * 1.1) * invMass;

        // Spin and impact wobble tilt
        const crossY = fx * dirZ - fz * dirX;
        obj.angularVelY += (crossY * 8.0 + (Math.random() - 0.5) * 3.5) * invMass;
        obj.tiltX = -(pushZ / pLen) * 0.26;
        obj.tiltZ = (pushX / pLen) * 0.26;

        hitNames.push(obj.name);
      }
    }

    // Also check seated/stationary NPC punch targets (e.g. desk worker woman)
    for (let i = 0; i < this.npcPunchTargets.length; i++) {
      const npc = this.npcPunchTargets[i];
      const dx = npc.position[0] - playerPos[0];
      const dz = npc.position[2] - playerPos[2];
      const npcMidY = npc.position[1] + npc.height * 0.5;
      const dy = npcMidY - fistY;

      const horizDist = Math.hypot(dx, dz);
      const effectiveDist = Math.max(0, horizDist - npc.radius);
      if (effectiveDist > range + 0.35) continue;
      if (Math.abs(dy) > 1.6) continue;

      const dirX = horizDist > 0.001 ? dx / horizDist : fx;
      const dirZ = horizDist > 0.001 ? dz / horizDist : fz;
      const forwardDot = dirX * fx + dirZ * fz;
      if (forwardDot > 0.1 || effectiveDist < 1.0) {
        hitNPCIds.push(npc.id);
        hitNames.push(npc.name);
      }
    }

    return { hitCount: hitNames.length, hitNames, hitNPCIds };
  }

  /**
   * Simulate gravity, floor landing, static wall ricochet, prop-prop impacts, and friction
   * for all dynamic MoveableObjects, keeping their BoxColliders synchronized.
   */
  public updateMoveableObjects(dt: number): void {
    if (this.moveableObjects.length === 0 || dt <= 0) return;
    const clampedDt = Math.min(dt, 0.05);
    const gravity = -24.0;

    for (let i = 0; i < this.moveableObjects.length; i++) {
      const obj = this.moveableObjects[i];
      const hx = obj.halfExtents[0];
      const hy = obj.halfExtents[1];
      const hz = obj.halfExtents[2];

      // Decay visual impact wobble
      const tiltDecay = Math.max(0, 1 - clampedDt * 9.0);
      obj.tiltX *= tiltDecay;
      obj.tiltZ *= tiltDecay;

      // Apply gravity
      obj.velocity[1] += gravity * clampedDt;

      // Integrate horizontal displacement with static wall bounce
      const nextX = obj.position[0] + obj.velocity[0] * clampedDt;
      const nextZ = obj.position[2] + obj.velocity[2] * clampedDt;
      obj.position[0] = nextX;
      obj.position[2] = nextZ;

      const nextY = obj.position[1] + obj.velocity[1] * clampedDt;
      obj.position[1] = nextY;

      let grounded = false;

      for (const col of this.colliders.values()) {
        if (col.isTrigger || col.id === obj.colliderId) continue;

        const cx = col.center[0];
        const cy = col.center[1];
        const cz = col.center[2];
        const sx = col.size[0];
        const sy = col.size[1];
        const sz = col.size[2];

        const overlapX = (hx + sx) - Math.abs(obj.position[0] - cx);
        if (overlapX <= 0) continue;
        const overlapZ = (hz + sz) - Math.abs(obj.position[2] - cz);
        if (overlapZ <= 0) continue;
        const overlapY = (hy + sy) - Math.abs(obj.position[1] - cy);
        if (overlapY <= 0) continue;

        // Resolve minimum penetration axis
        if (overlapY <= overlapX && overlapY <= overlapZ) {
          if (obj.position[1] >= cy) {
            obj.position[1] = cy + sy + hy;
            if (obj.velocity[1] < 0) {
              if (obj.velocity[1] < -2.2) {
                obj.velocity[1] = -obj.velocity[1] * obj.restitution;
              } else {
                obj.velocity[1] = 0;
                grounded = true;
              }
            } else {
              grounded = true;
            }
          } else {
            obj.position[1] = cy - sy - hy;
            if (obj.velocity[1] > 0) obj.velocity[1] = -obj.velocity[1] * 0.25;
          }
        } else if (overlapX < overlapZ) {
          // Wall/prop hit on X
          const sign = obj.position[0] >= cx ? 1 : -1;
          obj.position[0] = cx + sign * (sx + hx);
          if (col.category === 'prop') {
            const other = this.propColliderLookup.get(col.id);
            if (other) {
              const relVx = obj.velocity[0] - other.velocity[0];
              if (relVx * sign < 0) {
                const totalMass = obj.mass + other.mass;
                const j = -(1 + 0.45) * relVx / totalMass;
                obj.velocity[0] += j * other.mass;
                other.velocity[0] -= j * obj.mass;
                other.velocity[1] = Math.max(other.velocity[1], 1.2);
                other.angularVelY += (Math.random() - 0.5) * 3.0;
              }
            }
          } else {
            obj.velocity[0] = -obj.velocity[0] * obj.restitution;
          }
        } else {
          // Wall/prop hit on Z
          const sign = obj.position[2] >= cz ? 1 : -1;
          obj.position[2] = cz + sign * (sz + hz);
          if (col.category === 'prop') {
            const other = this.propColliderLookup.get(col.id);
            if (other) {
              const relVz = obj.velocity[2] - other.velocity[2];
              if (relVz * sign < 0) {
                const totalMass = obj.mass + other.mass;
                const j = -(1 + 0.45) * relVz / totalMass;
                obj.velocity[2] += j * other.mass;
                other.velocity[2] -= j * obj.mass;
                other.velocity[1] = Math.max(other.velocity[1], 1.2);
                other.angularVelY += (Math.random() - 0.5) * 3.0;
              }
            }
          } else {
            obj.velocity[2] = -obj.velocity[2] * obj.restitution;
          }
        }
      }

      // World ground clamp
      if (obj.position[1] < hy) {
        obj.position[1] = hy;
        if (obj.velocity[1] < -2.2) {
          obj.velocity[1] = -obj.velocity[1] * obj.restitution;
        } else {
          obj.velocity[1] = 0;
          grounded = true;
        }
      }

      // Friction & spin decay
      const linFriction = grounded ? Math.max(0, 1 - clampedDt * 5.2) : Math.max(0, 1 - clampedDt * 0.45);
      obj.velocity[0] *= linFriction;
      obj.velocity[2] *= linFriction;
      if (grounded && Math.hypot(obj.velocity[0], obj.velocity[2]) < 0.04) {
        obj.velocity[0] = 0;
        obj.velocity[2] = 0;
      }

      obj.rotationY += obj.angularVelY * clampedDt;
      const angFriction = grounded ? Math.max(0, 1 - clampedDt * 6.0) : Math.max(0, 1 - clampedDt * 1.2);
      obj.angularVelY *= angFriction;
      if (Math.abs(obj.angularVelY) < 0.02) obj.angularVelY = 0;

      // Sync dynamic BoxCollider center
      const syncedCol = this.colliders.get(obj.colliderId);
      if (syncedCol) {
        syncedCol.center[0] = obj.position[0];
        syncedCol.center[1] = obj.position[1];
        syncedCol.center[2] = obj.position[2];
      }
    }
  }

  /**
   * Raycast against static box colliders to detect camera wall occlusion
   */
  public raycastBoxes(
    origin: [number, number, number],
    dir: [number, number, number],
    maxDist: number
  ): number {
    let closestT = maxDist;

    for (const collider of this.colliders.values()) {
      if (collider.isTrigger) continue;

      const c = collider.center;
      const s = collider.size;

      const minX = c[0] - s[0], maxX = c[0] + s[0];
      const minY = c[1] - s[1], maxY = c[1] + s[1];
      const minZ = c[2] - s[2], maxZ = c[2] + s[2];

      let tmin = 0;
      let tmax = closestT;

      // X slab
      if (Math.abs(dir[0]) < 1e-6) {
        if (origin[0] < minX || origin[0] > maxX) continue;
      } else {
        const invD = 1.0 / dir[0];
        let t1 = (minX - origin[0]) * invD;
        let t2 = (maxX - origin[0]) * invD;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      // Y slab
      if (Math.abs(dir[1]) < 1e-6) {
        if (origin[1] < minY || origin[1] > maxY) continue;
      } else {
        const invD = 1.0 / dir[1];
        let t1 = (minY - origin[1]) * invD;
        let t2 = (maxY - origin[1]) * invD;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      // Z slab
      if (Math.abs(dir[2]) < 1e-6) {
        if (origin[2] < minZ || origin[2] > maxZ) continue;
      } else {
        const invD = 1.0 / dir[2];
        let t1 = (minZ - origin[2]) * invD;
        let t2 = (maxZ - origin[2]) * invD;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (tmin < closestT && tmin >= 0) {
        closestT = tmin;
      }
    }

    return closestT;
  }

  /**
   * Resolves horizontal capsule penetration against a broadphase list of AABB colliders.
   * Uses iterative deepest-penetration pushout with exact face-distance MTV fallback (no zero-normal bugs).
   */
  private resolveHorizontal(
    x: number,
    y: number,
    z: number,
    capsuleRadius: number,
    capsuleHeight: number,
    nearby: BoxCollider[]
  ): { x: number; z: number; blocked: boolean; hitColliders: BoxCollider[] } {
    let px = x;
    let pz = z;
    let blocked = false;
    const hitColliders: BoxCollider[] = [];

    for (let iter = 0; iter < 8; iter++) {
      let hit = false;
      let deepestPen = 0;
      let bestNx = 0;
      let bestNz = 0;
      let bestCol: BoxCollider | null = null;

      for (let i = 0; i < nearby.length; i++) {
        const col = nearby[i];
        const c = col.center;
        const s = col.size;

        const boxTop = c[1] + s[1];
        const boxBottom = c[1] - s[1];

        // Vertical overlap check (skip ground beneath feet and ceiling above head)
        if (y >= boxTop - 0.02 || y + capsuleHeight <= boxBottom + 0.02) continue;

        const minX = c[0] - s[0];
        const maxX = c[0] + s[0];
        const minZ = c[2] - s[2];
        const maxZ = c[2] + s[2];

        const cx = Math.max(minX, Math.min(px, maxX));
        const cz = Math.max(minZ, Math.min(pz, maxZ));
        const dx = px - cx;
        const dz = pz - cz;
        const distSq = dx * dx + dz * dz;

        if (distSq < capsuleRadius * capsuleRadius) {
          let pen = 0;
          let nx = 0;
          let nz = 0;

          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            pen = capsuleRadius - dist;
            nx = dx / dist;
            nz = dz / dist;
          } else {
            // Capsule center is inside or on the AABB boundary: pick true shortest exit face
            const dLeft = px - minX;
            const dRight = maxX - px;
            const dBack = pz - minZ;
            const dFront = maxZ - pz;

            let minFace = dLeft;
            nx = -1;
            nz = 0;

            if (dRight < minFace) {
              minFace = dRight;
              nx = 1;
              nz = 0;
            }
            if (dBack < minFace) {
              minFace = dBack;
              nx = 0;
              nz = -1;
            }
            if (dFront < minFace) {
              minFace = dFront;
              nx = 0;
              nz = 1;
            }

            pen = Math.max(0, minFace) + capsuleRadius;
          }

          if (pen > deepestPen) {
            deepestPen = pen;
            bestNx = nx;
            bestNz = nz;
            bestCol = col;
            hit = true;
          }
        }
      }

      if (!hit || deepestPen <= 1e-5) break;

      blocked = true;
      if (bestCol && !hitColliders.includes(bestCol)) {
        hitColliders.push(bestCol);
      }
      const push = deepestPen + 1e-4;
      px += bestNx * push;
      pz += bestNz * push;
    }

    return { x: px, z: pz, blocked, hitColliders };
  }

  /**
   * Checks whether placing the capsule vertically at [x, y, z] hits a ceiling/overhang.
   */
  private hasVerticalCeilingOverlap(
    x: number,
    y: number,
    z: number,
    capsuleRadius: number,
    capsuleHeight: number,
    nearby: BoxCollider[]
  ): boolean {
    const footprintR = capsuleRadius * 0.85;
    for (let i = 0; i < nearby.length; i++) {
      const col = nearby[i];
      const c = col.center;
      const s = col.size;
      if (
        x >= c[0] - s[0] - footprintR &&
        x <= c[0] + s[0] + footprintR &&
        z >= c[2] - s[2] - footprintR &&
        z <= c[2] + s[2] + footprintR
      ) {
        const boxBottom = c[1] - s[1];
        const boxTop = c[1] + s[1];
        if (y + 0.05 < boxTop && y + capsuleHeight - 0.02 > boxBottom) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Sub-stepped Multi-Pass Slide-and-Step Character Controller (Tunneling-Proof)
   */
  public updateCharacterPhysics(
    pos: [number, number, number],
    displacement: [number, number, number],
    capsuleRadius = 0.4,
    capsuleHeight = 1.8
  ): {
    newPos: [number, number, number];
    isGrounded: boolean;
    hitCeiling: boolean;
    standingOnElevator: boolean;
  } {
    let px = pos[0];
    let py = pos[1];
    let pz = pos[2];

    const vx = displacement[0];
    const vy = displacement[1];
    const vz = displacement[2];

    // 1. Broadphase Swept-AABB Pre-Filter
    const padXZ = capsuleRadius + 1.0;
    const minSweepX = Math.min(px, px + vx) - padXZ;
    const maxSweepX = Math.max(px, px + vx) + padXZ;
    const minSweepY = Math.min(py, py + vy) - 1.0;
    const maxSweepY = Math.max(py, py + vy) + capsuleHeight + JoltPhysics.maxStepHeight + 1.0;
    const minSweepZ = Math.min(pz, pz + vz) - padXZ;
    const maxSweepZ = Math.max(pz, pz + vz) + padXZ;

    const nearby: BoxCollider[] = [];
    for (const col of this.colliders.values()) {
      if (col.isTrigger) continue;
      const c = col.center;
      const s = col.size;
      if (
        c[0] + s[0] >= minSweepX && c[0] - s[0] <= maxSweepX &&
        c[1] + s[1] >= minSweepY && c[1] - s[1] <= maxSweepY &&
        c[2] + s[2] >= minSweepZ && c[2] - s[2] <= maxSweepZ
      ) {
        nearby.push(col);
      }
    }

    let isGrounded = false;
    let hitCeiling = false;
    let standingOnElevator = false;

    // 2. Sub-stepped Horizontal Movement (Max 0.08m per substep eliminates wall tunneling)
    const horizDist = Math.hypot(vx, vz);
    const maxHorizStep = 0.08;
    const hSteps = Math.max(1, Math.ceil(horizDist / maxHorizStep));
    const stepVx = vx / hSteps;
    const stepVz = vz / hSteps;

    for (let step = 0; step < hSteps; step++) {
      const targetX = px + stepVx;
      const targetZ = pz + stepVz;

      const resolved = this.resolveHorizontal(targetX, py, targetZ, capsuleRadius, capsuleHeight, nearby);

      // Check for smooth stair / low-curb auto-step if blocked horizontally while walking/settling (not jumping up)
      if (resolved.blocked && vy <= 0.05) {
        let bestStepY = -1;
        for (let i = 0; i < resolved.hitColliders.length; i++) {
          const hitCol = resolved.hitColliders[i];
          // Never auto-climb full-height architectural walls or handrails
          if (hitCol.category === 'wall') continue;

          const colTop = hitCol.center[1] + hitCol.size[1];
          const rise = colTop - py;
          if (rise > 0.005 && rise <= JoltPhysics.maxStepHeight + 0.02) {
            if (colTop > bestStepY) bestStepY = colTop;
          }
        }

        if (bestStepY > py && !this.hasVerticalCeilingOverlap(targetX, bestStepY, targetZ, capsuleRadius, capsuleHeight, nearby)) {
          const steppedRes = this.resolveHorizontal(targetX, bestStepY, targetZ, capsuleRadius, capsuleHeight, nearby);
          const normalProgress = Math.hypot(resolved.x - px, resolved.z - pz);
          const steppedProgress = Math.hypot(steppedRes.x - px, steppedRes.z - pz);
          if (steppedProgress > normalProgress + 0.002) {
            px = steppedRes.x;
            pz = steppedRes.z;
            py = bestStepY;
            isGrounded = true;
            continue;
          }
        }
      }

      px = resolved.x;
      pz = resolved.z;

      // Light physical nudge when walking directly into moveable props
      if (resolved.blocked && (Math.abs(stepVx) > 1e-5 || Math.abs(stepVz) > 1e-5)) {
        const nudgeScale = 3.2;
        for (let i = 0; i < resolved.hitColliders.length; i++) {
          const hitCol = resolved.hitColliders[i];
          if (hitCol.category !== 'prop') continue;
          const propObj = this.propColliderLookup.get(hitCol.id);
          if (propObj) {
            const dx = propObj.position[0] - px;
            const dz = propObj.position[2] - pz;
            const dLen = Math.hypot(dx, dz) || 1;
            const pushInto = (stepVx * dx + stepVz * dz) / dLen;
            if (pushInto > 0) {
              propObj.velocity[0] += (dx / dLen) * nudgeScale * (1 / Math.max(0.5, propObj.mass)) * 0.25;
              propObj.velocity[2] += (dz / dLen) * nudgeScale * (1 / Math.max(0.5, propObj.mass)) * 0.25;
            }
          }
        }
      }
    }

    // 3. Sub-stepped Vertical Movement (Gravity, Floor Support, Ceiling Clamp)
    const vertSteps = Math.max(1, Math.ceil(Math.abs(vy) / 0.15));
    const stepVy = vy / vertSteps;
    const footRadius = capsuleRadius * 0.85;

    for (let step = 0; step < vertSteps; step++) {
      const nextY = py + stepVy;
      let hitFloor = false;
      let stepHitCeiling = false;
      let landedY = py;
      let clampedCeilingY = nextY;

      for (let i = 0; i < nearby.length; i++) {
        const col = nearby[i];
        const c = col.center;
        const s = col.size;
        const boxTopY = c[1] + s[1];
        const boxBottomY = c[1] - s[1];

        const isOverFootprint =
          px >= c[0] - s[0] - footRadius &&
          px <= c[0] + s[0] + footRadius &&
          pz >= c[2] - s[2] - footRadius &&
          pz <= c[2] + s[2] + footRadius;

        if (!isOverFootprint) continue;

        // Grounding / landing on top of box (never catch while jumping upward)
        if (stepVy <= 0.001 && py >= boxTopY - 0.12 && nextY <= boxTopY + 0.01) {
          if (!hitFloor || boxTopY > landedY) {
            landedY = boxTopY;
            hitFloor = true;
            isGrounded = true;
            if (col.id === this.elevatorPlatformId) standingOnElevator = true;
          }
        } else if (stepVy > 0 && py + capsuleHeight <= boxBottomY + 0.05 && nextY + capsuleHeight > boxBottomY) {
          // Ceiling impact clamp
          const clampY = boxBottomY - capsuleHeight;
          if (!stepHitCeiling || clampY < clampedCeilingY) {
            clampedCeilingY = clampY;
            stepHitCeiling = true;
          }
        }
      }

      if (hitFloor) {
        py = landedY;
        break;
      } else if (stepHitCeiling) {
        py = Math.max(py, clampedCeilingY);
        hitCeiling = true;
        break;
      } else {
        py = nextY;
      }
    }

    // Check resting ground contact when not jumping upward
    if (!isGrounded && vy <= 0.001) {
      for (let i = 0; i < nearby.length; i++) {
        const col = nearby[i];
        const c = col.center;
        const s = col.size;
        const boxTopY = c[1] + s[1];
        if (
          Math.abs(py - boxTopY) <= 0.02 &&
          px >= c[0] - s[0] - footRadius &&
          px <= c[0] + s[0] + footRadius &&
          pz >= c[2] - s[2] - footRadius &&
          pz <= c[2] + s[2] + footRadius
        ) {
          py = boxTopY;
          isGrounded = true;
          if (col.id === this.elevatorPlatformId) standingOnElevator = true;
          break;
        }
      }
    }

    // 4. Final Hard Horizontal Safety Pass (Guarantees 0 penetration at frame end)
    const finalResolved = this.resolveHorizontal(px, py, pz, capsuleRadius, capsuleHeight, nearby);
    px = finalResolved.x;
    pz = finalResolved.z;

    // World floor guard
    if (py < 0) {
      py = 0;
      isGrounded = true;
    }

    return {
      newPos: [px, py, pz],
      isGrounded,
      hitCeiling,
      standingOnElevator,
    };
  }
}

