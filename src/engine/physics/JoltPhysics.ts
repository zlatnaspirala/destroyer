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
   * Set up the enlarged 40x40m 10-story skyscraper with open stairwell holes and enclosed elevator cab
   */
  public setupDefaultBuildingPhysics(): void {
    this.clear();

    // 1. Expanded Ground Slab Floor (40m x 40m)
    this.addBoxCollider({
      id: 'ground_slab',
      name: 'Ground Floor Slab',
      center: [0, -0.2, 0],
      size: [20, 0.2, 20],
    });

    const totalFloors = 10;
    const floorHeight = 4.0;

    // 2. Exterior Walls, Pillars, and Staircase Colliders across 10 Floors
    for (let k = 0; k < totalFloors; k++) {
      const wallY = k * floorHeight + 2.0;

      // Exterior Walls for Floor k
      this.addBoxCollider({
        id: `wall_rear_${k}`,
        name: `Floor ${k} Rear Wall`,
        center: [0, wallY, -20],
        size: [20, 2.0, 0.4],
      });
      this.addBoxCollider({
        id: `wall_left_${k}`,
        name: `Floor ${k} Left Wall`,
        center: [-20, wallY, 0],
        size: [0.4, 2.0, 20],
      });
      this.addBoxCollider({
        id: `wall_right_${k}`,
        name: `Floor ${k} Right Wall`,
        center: [20, wallY, 0],
        size: [0.4, 2.0, 20],
      });
      this.addBoxCollider({
        id: `wall_front_left_${k}`,
        name: `Floor ${k} Front Left Wing`,
        center: [-12, wallY, 20],
        size: [8, 2.0, 0.4],
      });
      this.addBoxCollider({
        id: `wall_front_right_${k}`,
        name: `Floor ${k} Front Right Wing`,
        center: [12, wallY, 20],
        size: [8, 2.0, 0.4],
      });
      this.addBoxCollider({
        id: `wall_front_arch_${k}`,
        name: `Floor ${k} Window Header`,
        center: [0, k * floorHeight + 3.2, 20],
        size: [4, 0.8, 0.4],
      });

      // Elevator Control Station Pillar on Floor k
      this.addBoxCollider({
        id: `elevator_pillar_${k}`,
        name: `Floor ${k} Elevator Station Pillar`,
        center: [11.5, k * floorHeight + 1.8, 8.0],
        size: [0.3, 1.8, 0.3],
      });

      // Staircase Steps for Floor k -> Floor k+1 (10 Steps)
      const numSteps = 10;
      const stepRise = floorHeight / numSteps; // 0.4m per step
      const stepDepth = 0.75;
      const stepWidth = 2.2;
      const startZ = 7.0;

      for (let i = 0; i < numSteps; i++) {
        const stepY = k * floorHeight + (i + 1) * stepRise;
        const stepZ = startZ - i * stepDepth;

        this.addBoxCollider({
          id: `stair_step_${k}_${i}`,
          name: `Floor ${k} Stair Step ${i + 1}`,
          center: [-12.0, stepY - stepRise * 0.5, stepZ],
          size: [stepWidth, stepRise * 0.5, stepDepth * 0.5],
        });
      }
    }

    // 3. Sliding Entrance Door Colliders on Floor 0
    this.addBoxCollider({
      id: this.doorLeftId,
      name: 'Sliding Door Left Panel',
      center: [-2.0, 2.0, 20.0],
      size: [2.0, 2.0, 0.15],
    });
    this.addBoxCollider({
      id: this.doorRightId,
      name: 'Sliding Door Right Panel',
      center: [2.0, 2.0, 20.0],
      size: [2.0, 2.0, 0.15],
    });

    // Proximity Trigger Sensor for Entrance Door
    this.addBoxCollider({
      id: 'door_trigger_sensor',
      name: 'Door Proximity Sensor',
      center: [0, 2.0, 20.0],
      size: [6.0, 2.5, 6.0],
      isTrigger: true,
    });

    // 4. Upper Floor Slabs (Floors 1 through 10) with STAIRWELL HOLE (X in [-20, -8], Z in [-4, 8]) AND ELEVATOR HOLE (X in [11.5, 16.5], Z in [7.5, 12.5])
    for (let k = 1; k <= totalFloors; k++) {
      const slabY = k * floorHeight - 0.1;

      // Piece 1: Central/Rear Main Slab
      this.addBoxCollider({
        id: `floor_slab_${k}_main_rear`,
        name: `Floor ${k} Main Rear Slab`,
        center: [6.0, slabY, -6.25],
        size: [14.0, 0.1, 13.75],
      });

      // Piece 2: Left Rear Slab (behind stair hole)
      this.addBoxCollider({
        id: `floor_slab_${k}_left_rear`,
        name: `Floor ${k} Left Rear Slab`,
        center: [-14.0, slabY, -12.0],
        size: [6.0, 0.1, 8.0],
      });

      // Piece 3: Left Front Slab (in front of stair hole)
      this.addBoxCollider({
        id: `floor_slab_${k}_left_front`,
        name: `Floor ${k} Left Front Slab`,
        center: [-14.0, slabY, 14.0],
        size: [6.0, 0.1, 6.0],
      });

      // Piece 4: Center Front Slab (between stair hole and elevator hole)
      this.addBoxCollider({
        id: `floor_slab_${k}_center_front`,
        name: `Floor ${k} Center Front Slab`,
        center: [1.75, slabY, 13.75],
        size: [9.75, 0.1, 6.25],
      });

      // Piece 5: Right Front Wing (in front of elevator hole)
      this.addBoxCollider({
        id: `floor_slab_${k}_right_front`,
        name: `Floor ${k} Right Front Slab`,
        center: [15.75, slabY, 16.25],
        size: [4.25, 0.1, 3.75],
      });

      // Piece 6: Far Right Flange (beside elevator hole)
      this.addBoxCollider({
        id: `floor_slab_${k}_right_side`,
        name: `Floor ${k} Right Side Flange`,
        center: [18.25, slabY, 10.0],
        size: [1.75, 0.1, 2.5],
      });
    }

    // 5. Closed Real Elevator Cab Box Colliders (Floor, Rear Wall, Left Wall, Right Wall, Roof Ceiling)
    this.addBoxCollider({
      id: this.elevatorPlatformId,
      name: 'Elevator Cab Platform Floor',
      center: [14.0, 0.15, 10.0],
      size: [2.2, 0.15, 2.2],
    });

    this.addBoxCollider({
      id: 'elevator_wall_rear',
      name: 'Elevator Cab Rear Wall',
      center: [14.0, 1.55, 7.85],
      size: [2.2, 1.25, 0.08],
    });

    this.addBoxCollider({
      id: 'elevator_wall_left',
      name: 'Elevator Cab Left Wall',
      center: [11.85, 1.55, 10.0],
      size: [0.08, 1.25, 2.2],
    });

    this.addBoxCollider({
      id: 'elevator_wall_right',
      name: 'Elevator Cab Right Wall',
      center: [16.15, 1.55, 10.0],
      size: [0.08, 1.25, 2.2],
    });

    this.addBoxCollider({
      id: 'elevator_roof',
      name: 'Elevator Cab Roof Ceiling',
      center: [14.0, 2.85, 10.0],
      size: [2.2, 0.1, 2.2],
    });

    // Elevator Shaft Guide Beams (40m height)
    this.addBoxCollider({
      id: 'elevator_beam_1',
      name: 'Elevator Column 1',
      center: [11.5, 20.0, 7.5],
      size: [0.2, 20.0, 0.2],
    });
    this.addBoxCollider({
      id: 'elevator_beam_2',
      name: 'Elevator Column 2',
      center: [16.5, 20.0, 7.5],
      size: [0.2, 20.0, 0.2],
    });
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
   * Slide-and-Step Character Controller physics sweep
   */
  public updateCharacterPhysics(
    pos: [number, number, number],
    displacement: [number, number, number],
    capsuleRadius = 0.25,
    capsuleHeight = 1.8
  ): {
    newPos: [number, number, number];
    isGrounded: boolean;
    standingOnElevator: boolean;
  } {
    let px = pos[0] + displacement[0];
    let py = pos[1] + displacement[1];
    let pz = pos[2] + displacement[2];

    let isGrounded = false;
    let standingOnElevator = false;

    // Track if player was initially inside building interior bounds
    const startInsideBuilding = Math.abs(pos[0]) < 19.2 && Math.abs(pos[2]) < 19.2;

    // Check collision against all static/dynamic box colliders
    for (const collider of this.colliders.values()) {
      if (collider.isTrigger) continue;

      const c = collider.center;
      const s = collider.size;
      const boxTopY = c[1] + s[1];
      const boxBottomY = c[1] - s[1];
      const feetY = py;

      // Check if box top is within auto-step climb height (e.g. elevator platform at 0.3m or stair step at 0.4m)
      const stepHeightDiff = boxTopY - pos[1];
      const isSteppable = stepHeightDiff >= -0.1 && stepHeightDiff <= JoltPhysics.maxStepHeight + 0.1 && pos[1] >= boxBottomY - 0.2;

      // 1. Ground / Step / Elevator Platform contact check
      const isOverFootprint =
        px >= c[0] - s[0] - capsuleRadius &&
        px <= c[0] + s[0] + capsuleRadius &&
        pz >= c[2] - s[2] - capsuleRadius &&
        pz <= c[2] + s[2] + capsuleRadius;

      if (isOverFootprint) {
        // Auto-step climb or land on box top
        if (isSteppable && displacement[1] <= 0.1) {
          py = boxTopY;
          isGrounded = true;

          if (collider.id === this.elevatorPlatformId) {
            standingOnElevator = true;
          }
        }
      }

      // 2. Horizontal Wall Collision Resolution (exclude steppable platforms to allow smooth stepping onto elevator & first stair step)
      const isVerticallyIntersectingWall = !isSteppable && feetY < boxTopY - 0.05 && py + capsuleHeight > boxBottomY + 0.05;

      if (isVerticallyIntersectingWall) {
        const charCenterY = py + capsuleHeight * 0.5;
        const closestX = Math.max(c[0] - s[0], Math.min(px, c[0] + s[0]));
        const closestY = Math.max(c[1] - s[1], Math.min(charCenterY, c[1] + s[1]));
        const closestZ = Math.max(c[2] - s[2], Math.min(pz, c[2] + s[2]));

        const dx = px - closestX;
        const dz = pz - closestZ;
        const dist2D = Math.hypot(dx, dz);

        if (dist2D < capsuleRadius) {
          const overlap = capsuleRadius - dist2D;
          if (dist2D > 0.0001) {
            px += (dx / dist2D) * overlap;
            pz += (dz / dist2D) * overlap;
          } else {
            // Push out along axis of minimal penetration
            const overlapX = s[0] + capsuleRadius - Math.abs(px - c[0]);
            const overlapZ = s[2] + capsuleRadius - Math.abs(pz - c[2]);
            if (overlapX < overlapZ) {
              px += Math.sign(px - c[0]) * overlapX;
            } else {
              pz += Math.sign(pz - c[2]) * overlapZ;
            }
          }
        }
      }
    }

    // 3. Containment Guard: If player was inside building interior, prevent being pushed outside through exterior walls during a jump
    if (startInsideBuilding && py > 0) {
      px = Math.max(-19.2, Math.min(19.2, px));
      pz = Math.max(-19.2, Math.min(19.2, pz));
    }

    // Keep within world ground level
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
