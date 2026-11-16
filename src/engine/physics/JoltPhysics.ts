/**
 * Destroyer Engine - Jolt-Style Lightweight 3D Physics Engine
 * Features:
 * - AABB / Box Colliders with static & dynamic response
 * - Character Controller with Slide-and-Step wall sliding and stair auto-climb
 * - Moving Platform support (Elevators with velocity inheritance)
 * - Proximity Triggers (Automatic opening doors)
 */

export interface BoxCollider {
  id: string;
  name: string;
  center: [number, number, number]; // World space center [x, y, z]
  size: [number, number, number];   // Half-extents [hx, hy, hz]
  isTrigger?: boolean;
  onTrigger?: (playerPos: [number, number, number]) => void;
  entityId?: number;
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

  constructor() {
    this.setupDefaultBuildingPhysics();
  }

  public addBoxCollider(collider: BoxCollider): void {
    this.colliders.set(collider.id, collider);
  }

  public removeBoxCollider(id: string): void {
    this.colliders.delete(id);
  }

  public clear(): void {
    this.colliders.clear();
  }

  public setElevatorTargetFloor(floor: number): void {
    this.elevatorTargetFloor = Math.max(0, Math.min(10, Math.floor(floor)));
  }

  /**
   * Set up a 10-story skyscraper at a specific offset
   */
  public addSkyscraperPhysics(offset: [number, number, number] = [0, 0, 0]): void {
    const [ox, oy, oz] = offset;
    const totalFloors = 10;
    const floorHeight = 4.0;

    // 1. Exterior Walls, Pillars, and Staircase Colliders across 10 Floors
    for (let k = 0; k < totalFloors; k++) {
      const wallY = oy + k * floorHeight + 2.0;

      // Exterior
      this.addBoxCollider({ id: `wall_rear_${ox}_${k}`, name: `F${k} Rear`, center: [ox, wallY, oz - 20], size: [20, 2.0, 0.4] });
      this.addBoxCollider({ id: `wall_left_${ox}_${k}`, name: `F${k} Left`, center: [ox - 20, wallY, oz], size: [0.4, 2.0, 20] });
      this.addBoxCollider({ id: `wall_right_${ox}_${k}`, name: `F${k} Right`, center: [ox + 20, wallY, oz], size: [0.4, 2.0, 20] });
      this.addBoxCollider({ id: `wall_front_l_${ox}_${k}`, name: `F${k} FL`, center: [ox - 12, wallY, oz + 20], size: [8, 2.0, 0.4] });
      this.addBoxCollider({ id: `wall_front_r_${ox}_${k}`, name: `F${k} FR`, center: [ox + 12, wallY, oz + 20], size: [8, 2.0, 0.4] });
      this.addBoxCollider({ id: `wall_arch_${ox}_${k}`, name: `F${k} Arch`, center: [ox, oy + k * floorHeight + 3.2, oz + 20], size: [4, 0.8, 0.4] });

      // CENTRAL CORE PARTITIONS (Housing circulation) - With 3m Doorways (Matched to ProceduralModels)
      this.addBoxCollider({ id: `core_bl_${ox}_${k}`, name: `F${k} Core BL`, center: [ox - 5, wallY, oz - 5], size: [2, 2.0, 0.2] });
      this.addBoxCollider({ id: `core_br_${ox}_${k}`, name: `F${k} Core BR`, center: [ox + 5, wallY, oz - 5], size: [2, 2.0, 0.2] });
      this.addBoxCollider({ id: `core_fl_${ox}_${k}`, name: `F${k} Core FL`, center: [ox - 5, wallY, oz + 15], size: [2, 2.0, 0.2] });
      this.addBoxCollider({ id: `core_fr_${ox}_${k}`, name: `F${k} Core FR`, center: [ox + 5, wallY, oz + 15], size: [2, 2.0, 0.2] });
      this.addBoxCollider({ id: `core_ws_${ox}_${k}`, name: `F${k} Core W`, center: [ox - 7, wallY, oz + 10], size: [0.2, 2.0, 5] });
      this.addBoxCollider({ id: `core_es_${ox}_${k}`, name: `F${k} Core E`, center: [ox + 7, wallY, oz + 5], size: [0.2, 2.0, 10] });

      // TENANT DIVIDERS (Corners)
      this.addBoxCollider({ id: `div_nw_${ox}_${k}`, name: `F${k} Div NW`, center: [ox - 13, wallY, oz - 10], size: [7, 2.0, 0.2] });
      this.addBoxCollider({ id: `div_ne_${ox}_${k}`, name: `F${k} Div NE`, center: [ox + 13, wallY, oz - 10], size: [7, 2.0, 0.2] });
      this.addBoxCollider({ id: `div_sw_${ox}_${k}`, name: `F${k} Div SW`, center: [ox - 15, wallY, oz + 10], size: [5, 2.0, 0.2] });

      // Windows
      for (let w = -15; w <= 15; w += 10) {
        if (w === 0 && k === 0) continue;
        this.addBoxCollider({ id: `win_r_${ox}_${k}_${w}`, name: `F${k} Win R ${w}`, center: [ox + w, wallY, oz - 20], size: [3.5, 1.4, 0.05] });
        this.addBoxCollider({ id: `win_l_${ox}_${k}_${w}`, name: `F${k} Win L ${w}`, center: [ox - 20, wallY, oz + w], size: [0.05, 1.4, 3.5] });
        this.addBoxCollider({ id: `win_rt_${ox}_${k}_${w}`, name: `F${k} Win RT ${w}`, center: [ox + 20, wallY, oz + w], size: [0.05, 1.4, 3.5] });
      }

      // Furniture (Perimeter Daylight Zones)
      const officePositions: [number, number][] = [[-17, -16], [17, -16], [-17, 16], [17, 16]];
      for (let i = 0; i < officePositions.length; i++) {
        const op = officePositions[i];
        const deskY = oy + k * floorHeight + 0.75;
        this.addBoxCollider({ id: `desk_${ox}_${k}_${i}`, name: `F${k} Desk ${i}`, center: [ox + op[0], deskY, oz + op[1]], size: [2.0, 0.1, 1.0] });
        this.addBoxCollider({ id: `chair_${ox}_${k}_${i}`, name: `F${k} Chair ${i}`, center: [ox + op[0], oy + k * floorHeight + 0.5, oz + op[1] + 1.2], size: [0.6, 0.1, 0.6] });
      }

      this.addBoxCollider({ id: `ele_panel_${ox}_${k}`, name: `F${k} Ele`, center: [ox + 11.28, oy + k * floorHeight + 1.4, oz + 9.0], size: [0.1, 0.8, 0.4] });

      // Stairs (X = -12)
      const numSteps = 10;
      const stepRise = floorHeight / numSteps;
      const startZ = oz + 7.0;
      for (let i = 0; i < numSteps; i++) {
        const stepY = oy + k * floorHeight + (i + 1) * stepRise;
        this.addBoxCollider({
          id: `stair_${ox}_${k}_${i}`,
          name: `F${k} Step ${i}`,
          center: [ox - 12.0, stepY - stepRise * 0.5, startZ - i * 0.75],
          size: [2.2, stepRise * 0.5, 0.375], // Matched to ProceduralModels half-extents
        });
      }
    }

    // 2. Upper Floor Slabs (Matched to 7-piece Robust Scheme in ProceduralModels)
    for (let k = 1; k <= totalFloors; k++) {
      const slabY = oy + k * floorHeight - 0.05;
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_N`, name: `F${k} Slab North`, center: [ox, slabY, oz - 10.5], size: [20.0, 0.05, 9.5] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_S`, name: `F${k} Slab South`, center: [ox, slabY, oz + 17.5], size: [20.0, 0.05, 2.5] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_W1`, name: `F${k} Slab West 1`, center: [ox - 17, slabY, oz + 3.5], size: [3.0, 0.05, 4.5] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_W2`, name: `F${k} Slab West 2`, center: [ox - 12, slabY, oz - 0.5], size: [2.2, 0.05, 0.5] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_W3`, name: `F${k} Slab West 3`, center: [ox - 8.5, slabY, oz + 3.5], size: [1.5, 0.05, 4.5] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_E`, name: `F${k} Slab East`, center: [ox + 10, slabY, oz + 10.0], size: [10.0, 0.05, 5.0] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_C1`, name: `F${k} Slab Center 1`, center: [ox, slabY, oz + 3.5], size: [6.0, 0.05, 4.5] });
      this.addBoxCollider({ id: `f_slab_${ox}_${k}_C2`, name: `F${k} Slab Center 2`, center: [ox, slabY, oz + 11.25], size: [20.0, 0.05, 3.75] });
    }

    // 3. Elevator Shaft Beams
    this.addBoxCollider({ id: `ele_b1_${ox}`, name: `Ele Beam 1`, center: [ox + 11.5, oy + 20.0, oz + 7.5], size: [0.2, 20.0, 0.2] });
    this.addBoxCollider({ id: `ele_b2_${ox}`, name: `Ele Beam 2`, center: [ox + 16.5, oy + 20.0, oz + 7.5], size: [0.2, 20.0, 0.2] });

    // 4. Doors & Sensors
    if (ox === 0) {
      this.addBoxCollider({
        id: this.doorLeftId,
        name: `Sliding Door Left`,
        center: [ox - 2.0, oy + 2.0, oz + 20.0],
        size: [2.0, 2.0, 0.15],
      });
      this.addBoxCollider({
        id: this.doorRightId,
        name: `Sliding Door Right`,
        center: [ox + 2.0, oy + 2.0, oz + 20.0],
        size: [2.0, 2.0, 0.15],
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
      });
      this.addBoxCollider({
        id: 'elevator_wall_rear',
        name: `Elevator Wall Rear`,
        center: [ox + 14.0, oy + 1.55, oz + 7.65],
        size: [2.4, 1.25, 0.08],
      });
      this.addBoxCollider({
        id: 'elevator_wall_left',
        name: `Elevator Wall Left`,
        center: [ox + 11.65, oy + 1.55, oz + 10.0],
        size: [0.08, 1.25, 2.4],
      });
      this.addBoxCollider({
        id: 'elevator_wall_right',
        name: `Elevator Wall Right`,
        center: [ox + 16.35, oy + 1.55, oz + 10.0],
        size: [0.08, 1.25, 2.4],
      });
      this.addBoxCollider({
        id: 'elevator_roof',
        name: `Elevator Roof`,
        center: [ox + 14.0, oy + 2.85, oz + 10.0],
        size: [2.4, 0.1, 2.4],
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
   * Professional Stable Multi-Pass Slide-and-Step Character Controller
   */
  public updateCharacterPhysics(
    pos: [number, number, number],
    displacement: [number, number, number],
    capsuleRadius = 0.4,
    capsuleHeight = 1.8
  ): {
    newPos: [number, number, number];
    isGrounded: boolean;
    standingOnElevator: boolean;
  } {
    let px = pos[0];
    let py = pos[1];
    let pz = pos[2];

    const vx = displacement[0];
    const vy = displacement[1];
    const vz = displacement[2];

    let isGrounded = false;
    let standingOnElevator = false;

    // 1. Vertical Movement (Gravity, Jumping, Stepping)
    const nextY = py + vy;
    for (const collider of this.colliders.values()) {
      if (collider.isTrigger) continue;
      const c = collider.center;
      const s = collider.size;
      const boxTopY = c[1] + s[1];
      const boxBottomY = c[1] - s[1];

      const isOverFootprint =
        px >= c[0] - s[0] - capsuleRadius &&
        px <= c[0] + s[0] + capsuleRadius &&
        pz >= c[2] - s[2] - capsuleRadius &&
        pz <= c[2] + s[2] + capsuleRadius;

      if (isOverFootprint) {
        const stepHeightDiff = boxTopY - py;
        const isSteppable = stepHeightDiff >= -0.1 && stepHeightDiff <= JoltPhysics.maxStepHeight + 0.1 && py >= boxBottomY - 0.2;

        if (isSteppable && vy <= 0.1) {
          if (nextY <= boxTopY) {
            py = boxTopY;
            isGrounded = true;
            if (collider.id === this.elevatorPlatformId) standingOnElevator = true;
          }
        } else if (py + capsuleHeight <= boxBottomY && nextY + capsuleHeight > boxBottomY) {
          py = boxBottomY - capsuleHeight;
        }
      }
    }
    
    // Fall to nextY if not grounded by a box above
    if (!isGrounded) {
      py = nextY;
    }

    // 2. Horizontal Movement (Slide resolution)
    px += vx;
    pz += vz;

    // Multi-pass resolution to handle corners and sliding without double-moving
    for (let iter = 0; iter < 3; iter++) {
      let hit = false;
      let deepestPen = 0;
      let normal: [number, number, number] = [0, 0, 0];

      for (const col of this.colliders.values()) {
        if (col.isTrigger) continue;
        const c = col.center;
        const s = col.size;
        
        // Skip if vertically out of range
        if (py >= c[1] + s[1] - 0.05 || py + capsuleHeight <= c[1] - s[1] + 0.05) continue;

        const cx = Math.max(c[0] - s[0], Math.min(px, c[0] + s[0]));
        const cz = Math.max(c[2] - s[2], Math.min(pz, c[2] + s[2]));
        const dx = px - cx;
        const dz = pz - cz;
        const dist = Math.hypot(dx, dz);

        if (dist < capsuleRadius) {
          const pen = capsuleRadius - dist;
          if (pen > deepestPen) {
            deepestPen = pen;
            hit = true;
            if (dist > 0.001) {
              normal = [dx / dist, 0, dz / dist];
            } else {
              // Minimal penetration axis fallback
              const ox = Math.abs(px - c[0]) / (s[0] + capsuleRadius);
              const oz = Math.abs(pz - c[2]) / (s[2] + capsuleRadius);
              if (ox > oz) normal = [Math.sign(px - c[0]), 0, 0];
              else normal = [0, 0, Math.sign(pz - c[2])];
            }
          }
        }
      }

      if (!hit) break;

      // Resolve penetration: push out and continue to next iteration to handle secondary collisions
      px += normal[0] * deepestPen;
      pz += normal[2] * deepestPen;
    }

    // World floor guard
    if (py < 0) {
      py = 0;
      isGrounded = true;
    }

    return {
      newPos: [px, py, pz],
      isGrounded,
      standingOnElevator,
    };
  }
}
