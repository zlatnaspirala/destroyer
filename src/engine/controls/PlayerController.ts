/**
 * Destroyer Engine - Classic 3rd Person Tank / Vehicle Controls
 * Features:
 * - W: Move Player Forward in facing direction
 * - S: Slowly Backpedal Backward (no rotation)
 * - A / D: Rotate Player Body & Camera Left / Right
 * - Spacebar: Jump with vertical velocity and gravity physics
 * - Camera stays locked behind the player's back looking forward into the screen
 */

import { Mat4 } from '../math/Mat4';
import type { DestroyerEngine } from '../DestroyerEngine';

export class PlayerController {
  private engine: DestroyerEngine;

  // Player position & physics
  public position: [number, number, number] = [0, 0, 0];
  public velocityY = 0;
  public isGrounded = true;
  public gravity = -28.0;
  public jumpStrength = 11.5;
  public energy = 1.0; // 0 to 1.0
  public energyRegenRate = 0.22; // 22% per second
  public jumpEnergyCost = 0.12;  // 12% per jump
  public runEnergyCost = 0.1;   // 10% per second while running and moving

  public rotationY = 0;        // Player facing yaw angle in radians
  public isRunning = false;    // Run mode toggle (walk vs run)
  public isJumping = false;    // Character jumping state
  public jumpTime = 0;         // Seconds elapsed since jump launch
  public readonly jumpTotalDuration = 0.82; // Total air duration
  public landingImpactTimer = 0; // Landing compression timer
  public isPunching = false;   // Character punch action state
  public punchTime = 0;        // Elapsed seconds in punch animation
  public readonly punchDuration = 0.42;
  public punchEnergyCost = 0.05;
  public lastPunchHitCount = 0;
  public lastPunchHitNames: string[] = [];
  private punchCooldown = 0;
  private punchImpactTriggered = false;
  private coyoteTimer = 0;       // Grace period after stepping off a ledge/stair
  private jumpBufferTimer = 0;   // Input buffer so taps right before landing still jump
  public walkSpeedForward = 8.5;
  public runSpeedForward = 16.0;
  public moveSpeedBackward = 4.0;
  public turnSpeed = 2.4;     // Radians per second for A / D turning

  public isMoving = false;
  public currentSpeed = 0;       // Smooth forward/back velocity dampening
  public currentTurnSpeed = 0;   // Smooth rotation dampening
  public knockbackVelX = 0;      // Police kick/shove horizontal impulse X
  public knockbackVelZ = 0;      // Police kick/shove horizontal impulse Z
  public knockbackCooldown = 0;  // Prevents continuous stunlocking
  public arrestSlowdownTimer = 0; // First police punch slows player for realistic catch

  // 3rd Person Camera settings (Theta = horizontal yaw, Phi = vertical pitch)
  public cameraDistance = 7.5;
  public cameraHeight = 1.4;
  public cameraTheta = 0.0;    // Camera horizontal angle around player
  public cameraPhi = 1.25;      // Camera pitch angle (~70 deg from top)

  // Registered entity IDs for player character (supports multi-primitive GLB characters)
  public entityId = -1;
  public extraEntityIds: number[] = [];

  // Vehicle driving state
  public activeVehicleIndex = -1;
  public nearbyVehicleIndex = -1;

  // Input states
  private keys: Record<string, boolean> = {};
  public joystickVec: [number, number] = [0, 0];
  public jumpRequested = false;
  public punchRequested = false;
  public gunFireRequested = false;
  private gunCooldown = 0;

  private isPointerDragging = false;
  private isTouchPointer = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Pre-allocated scratch storage for ZERO per-frame allocations in update()
  private scratchPlayerMat = Mat4.create();
  private scratchPunchFwd: [number, number, number] = [0, 0, -1];
  private scratchDisp: [number, number, number] = [0, 0, 0];
  private scratchRayDir: [number, number, number] = [0, 0, 1];
  private scratchRayOrigin: [number, number, number] = [0, 0, 0];
  private scratchZeroDisp: [number, number, number] = [0, 0, 0];

  constructor(engine: DestroyerEngine) {
    this.engine = engine;
    this.setupKeyboardListeners();
  }

  private setupKeyboardListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener(
      'keydown',
      (e) => {
        this.keys[e.code] = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          this.isRunning = true;
        }
        if (e.code === 'Space') {
          e.preventDefault();
          if (this.activeVehicleIndex < 0 && !this.engine.isCustodyLocked()) {
            this.jump();
          }
        }
        if (e.code === 'KeyF' && !e.repeat) {
          e.preventDefault();
          if (this.activeVehicleIndex < 0 && !this.engine.isCustodyLocked()) {
            this.punch();
          }
        }
        if (e.code === 'KeyG' && !e.repeat) {
          e.preventDefault();
          if (this.activeVehicleIndex < 0 && !this.engine.isCustodyLocked()) {
            this.fireWeapon();
          }
        }

        // E key: Exit car / Enter nearby car / Pick up periphery garbage / Equip Gun Shop pistol / Press elevator button
        if (e.code === 'KeyE' && !e.repeat && !this.engine.isCustodyLocked()) {
          if (!this.toggleVehicleEntry()) {
            if (!this.engine.tryPickUpGarbage()) {
              if (!this.engine.tryInteractGunShop()) {
                this.interactWith3DElevatorButton();
              }
            }
          }
        }

        if (e.code.startsWith('Digit')) {
          const digit = parseInt(e.code.replace('Digit', ''), 10);
          if (!isNaN(digit) && this.engine.physics) {
            this.engine.physics.setElevatorTargetFloor(digit);
          }
        }
      },
      { passive: false }
    );

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.isRunning = false;
      }
    });

    window.addEventListener('blur', () => {
      this.keys = {};
    });
  }

  public findNearestVehicleIndex(maxRange = 4.4): number {
    const vehicles = this.engine.vehicles;
    let bestIdx = -1;
    let bestDist = maxRange;
    const px = this.position[0];
    const py = this.position[1];
    const pz = this.position[2];

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (Math.abs(py - v.position[1]) > 2.6) continue;
      const d = Math.hypot(px - v.position[0], pz - v.position[2]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  public toggleVehicleEntry(): boolean {
    const vehicles = this.engine.vehicles;
    if (this.activeVehicleIndex >= 0) {
      const car = vehicles[this.activeVehicleIndex];
      if (car) {
        // Place driver outside car door (left side first, then right / rear / front fallback)
        const cosR = Math.cos(car.rotationY);
        const sinR = Math.sin(car.rotationY);
        const candX0 = car.position[0] - cosR * 2.25;
        const candZ0 = car.position[2] + sinR * 2.25;
        const candX1 = car.position[0] + cosR * 2.25;
        const candZ1 = car.position[2] - sinR * 2.25;

        let exitX = candX0;
        let exitZ = candZ0;
        const exitY = Math.max(0, car.position[1]);
        if (this.engine.physics) {
          this.scratchDisp[0] = candX0;
          this.scratchDisp[1] = exitY;
          this.scratchDisp[2] = candZ0;
          const res0 = this.engine.physics.updateCharacterPhysics(this.scratchDisp, this.scratchZeroDisp, 0.4, 1.8);
          if (Math.hypot(res0.newPos[0] - car.position[0], res0.newPos[2] - car.position[2]) >= 1.55) {
            exitX = res0.newPos[0];
            exitZ = res0.newPos[2];
          } else {
            this.scratchDisp[0] = candX1;
            this.scratchDisp[1] = exitY;
            this.scratchDisp[2] = candZ1;
            const res1 = this.engine.physics.updateCharacterPhysics(this.scratchDisp, this.scratchZeroDisp, 0.4, 1.8);
            exitX = res1.newPos[0];
            exitZ = res1.newPos[2];
          }
        }

        this.position[0] = exitX;
        this.position[1] = exitY;
        this.position[2] = exitZ;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isJumping = false;
        this.currentSpeed = 0;
        car.speed *= 0.25;
      }
      this.activeVehicleIndex = -1;
      this.engine.setPlayerEntitiesVisible(true);
      return true;
    }

    if (this.engine.isPlayerJailed()) return false;
    const nearIdx = this.findNearestVehicleIndex(4.4);
    if (nearIdx >= 0) {
      this.activeVehicleIndex = nearIdx;
      this.nearbyVehicleIndex = nearIdx;
      this.isPunching = false;
      this.isJumping = false;
      this.currentSpeed = 0;
      this.velocityY = 0;
      const car = vehicles[nearIdx];
      this.position[0] = car.position[0];
      this.position[1] = car.position[1];
      this.position[2] = car.position[2];
      this.engine.setPlayerEntitiesVisible(false);
      return true;
    }
    return false;
  }

  public interactWith3DElevatorButton(): void {
    if (!this.engine.physics || this.activeVehicleIndex >= 0) return;

    const distToElevator = Math.hypot(this.position[0] - 14.0, this.position[2] - 10.0);

    if (distToElevator < 4.5) {
      const currentFloor = Math.max(0, Math.min(10, Math.round(this.position[1] / 4.0)));

      if (Math.abs(this.position[1] - (this.engine.physics.elevatorY + 0.15)) < 0.8) {
        const nextFloor = (this.engine.physics.elevatorTargetFloor + 1) % 11;
        this.engine.physics.setElevatorTargetFloor(nextFloor);
      } else {
        this.engine.physics.setElevatorTargetFloor(currentFloor);
      }
    }
  }

  /**
   * Handle mouse clicks in the 3D viewport canvas by raycasting toward 3D elevator buttons
   */
  public handleCanvasClick(clientX: number, clientY: number, canvasWidth: number, canvasHeight: number): boolean {
    if (!this.engine.physics) return false;

    const ndcX = (clientX / canvasWidth) * 2.0 - 1.0;
    const ndcY = 1.0 - (clientY / canvasHeight) * 2.0;

    const invVP = Mat4.create();
    if (!Mat4.invert(this.engine.camera.viewProjMatrix, invVP)) return false;

    const pNear = Mat4.transformVec4([ndcX, ndcY, 0.0, 1.0], invVP);
    const pFar = Mat4.transformVec4([ndcX, ndcY, 1.0, 1.0], invVP);

    if (pNear[3] === 0 || pFar[3] === 0) return false;

    const o: [number, number, number] = [pNear[0] / pNear[3], pNear[1] / pNear[3], pNear[2] / pNear[3]];
    const f: [number, number, number] = [pFar[0] / pFar[3], pFar[1] / pFar[3], pFar[2] / pFar[3]];

    const dir: [number, number, number] = [f[0] - o[0], f[1] - o[1], f[2] - o[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 0.0001) return false;
    dir[0] /= len; dir[1] /= len; dir[2] /= len;

    const rayDistToPoint = (pt: [number, number, number]): number => {
      const vx = pt[0] - o[0];
      const vy = pt[1] - o[1];
      const vz = pt[2] - o[2];
      const proj = vx * dir[0] + vy * dir[1] + vz * dir[2];
      if (proj < 0) return 999.0;
      const closestX = o[0] + dir[0] * proj;
      const closestY = o[1] + dir[1] * proj;
      const closestZ = o[2] + dir[2] * proj;
      return Math.hypot(pt[0] - closestX, pt[1] - closestY, pt[2] - closestZ);
    };

    // 1. Check all 10 floor call station buttons (X=11.28, Z=9.0)
    for (let k = 0; k <= 10; k++) {
      const buttonPos: [number, number, number] = [11.28, k * 4.0 + 1.6, 9.0];
      if (rayDistToPoint(buttonPos) < 0.6) {
        this.engine.physics.setElevatorTargetFloor(k);
        return true;
      }
    }

    // 2. Check interior cab buttons (attached to cab at X=14-1.98, Z=10+0.8)
    const elevatorY = this.engine.physics.elevatorY;
    const btnUpPos: [number, number, number] = [14.0 - 1.98, elevatorY + 1.7, 10.0 + 0.8];
    const btnDownPos: [number, number, number] = [14.0 - 1.98, elevatorY + 1.3, 10.0 + 0.8];

    // Click UP Button (+1 floor)
    if (rayDistToPoint(btnUpPos) < 0.4) {
      const nextFloor = Math.min(10, this.engine.physics.elevatorTargetFloor + 1);
      this.engine.physics.setElevatorTargetFloor(nextFloor);
      return true;
    }

    // Click DOWN Button (-1 floor)
    if (rayDistToPoint(btnDownPos) < 0.4) {
      const prevFloor = Math.max(0, this.engine.physics.elevatorTargetFloor - 1);
      this.engine.physics.setElevatorTargetFloor(prevFloor);
      return true;
    }

    // 3. Proximity Fallback: If near elevator shaft (< 4.5m), call elevator to current floor
    const distToShaft = Math.hypot(this.position[0] - 14.0, this.position[2] - 10.0);
    if (distToShaft < 4.5) {
      const playerFloor = Math.max(0, Math.min(10, Math.round(this.position[1] / 4.0)));
      this.engine.physics.setElevatorTargetFloor(playerFloor);
      return true;
    }

    return false;
  }

  public toggleRunning(): boolean {
    this.isRunning = !this.isRunning;
    return this.isRunning;
  }

  public setRunning(running: boolean): void {
    this.isRunning = running;
  }

  public punch(): boolean {
    if (this.isPunching || this.punchCooldown > 0 || this.energy < 0.03) {
      return false;
    }
    this.isPunching = true;
    this.punchTime = 0;
    this.punchImpactTriggered = false;
    this.punchCooldown = 0.44;
    this.lastPunchHitCount = 0;
    this.lastPunchHitNames.length = 0;
    this.energy = Math.max(0, this.energy - this.punchEnergyCost);
    return true;
  }

  public fireWeapon(): boolean {
    if (this.gunCooldown > 0 || this.activeVehicleIndex >= 0) return false;
    if (!this.engine.consumeWeaponShot()) return false;
    this.gunCooldown = 0.28;
    if (this.engine.physics) {
      this.scratchRayOrigin[0] = this.position[0];
      this.scratchRayOrigin[1] = this.position[1] + 1.35;
      this.scratchRayOrigin[2] = this.position[2];
      this.scratchPunchFwd[0] = -Math.sin(this.cameraTheta);
      this.scratchPunchFwd[1] = 0;
      this.scratchPunchFwd[2] = -Math.cos(this.cameraTheta);
      const res = this.engine.physics.fireWeaponRay(this.scratchRayOrigin, this.scratchPunchFwd, 60.0);
      this.engine.onWeaponFired(this.position, res.hitNpcId, res.hitPoliceCar);
    }
    return true;
  }

  public applyPoliceKnockback(dirX: number, dirZ: number, impulse = 12.0): void {
    const len = Math.hypot(dirX, dirZ) || 1;
    this.knockbackVelX += (dirX / len) * impulse;
    this.knockbackVelZ += (dirZ / len) * impulse;
    if (this.isGrounded) {
      this.velocityY = Math.max(this.velocityY, 3.2);
      this.isGrounded = false;
    }
    this.knockbackCooldown = 0.65;
  }

  public applyPoliceSlowdown(duration = 3.2): void {
    this.arrestSlowdownTimer = Math.max(this.arrestSlowdownTimer, duration);
  }

  public jump(): void {
    if (this.engine.isCustodyLocked() || this.arrestSlowdownTimer > 0) return;
    this.jumpBufferTimer = 0.18;
    this.tryExecuteJump();
  }

  private tryExecuteJump(): boolean {
    if (this.arrestSlowdownTimer > 0) return false;
    const canCoyoteJump = this.coyoteTimer > 0 && !this.isJumping;
    if ((this.isGrounded || canCoyoteJump) && this.energy >= 0.05) {
      this.velocityY = this.jumpStrength;
      this.isGrounded = false;
      this.isJumping = true;
      this.jumpTime = 0;
      this.landingImpactTimer = 0;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.energy = Math.max(0, this.energy - this.jumpEnergyCost);
      return true;
    }
    return false;
  }

  public handlePointerDown(x: number, y: number, button: number, pointerType = 'mouse'): void {
    if (button === 0 || button === 2) {
      this.isPointerDragging = true;
      this.isTouchPointer = pointerType === 'touch';
      this.lastPointerX = x;
      this.lastPointerY = y;
    }
  }

  public handlePointerMove(x: number, y: number): void {
    if (!this.isPointerDragging) return;
    const dx = x - this.lastPointerX;
    const dy = y - this.lastPointerY;
    this.lastPointerX = x;
    this.lastPointerY = y;

    // Gentle touch sensitivity on mobile vs crisp mouse drag on desktop
    const yawSens = this.isTouchPointer ? 0.0020 : 0.005;
    const pitchSens = this.isTouchPointer ? 0.0016 : 0.004;

    this.cameraTheta += dx * yawSens;
    this.cameraPhi += dy * pitchSens;

    // Clamp vertical camera pitch (phi: 0.02 to 1.52 rad) - allows looking straight up at sky
    this.cameraPhi = Math.max(0.02, Math.min(1.52, this.cameraPhi));
  }

  public handlePointerUp(): void {
    this.isPointerDragging = false;
    this.isTouchPointer = false;
  }

  public handleZoom(delta: number): void {
    this.cameraDistance = Math.max(3.0, Math.min(25.0, this.cameraDistance + delta));
  }

  public update(deltaSec: number): void {
    if (this.entityId < 0 || this.engine.isDeviceLost) return;

    // Custody Cinematic Lock: player controls disabled during arrest escort, cruiser drive & station cell walk,
    // while camera continuously follows the player/police car in render (zero teleport!)
    if (this.engine.isCustodyLocked()) {
      this.isPunching = false;
      this.isJumping = false;
      this.jumpRequested = false;
      this.punchRequested = false;
      this.gunFireRequested = false;
      this.nearbyVehicleIndex = -1;

      if (this.engine.isCustodyPlayerVisible()) {
        const halfYaw = this.rotationY * 0.5;
        Mat4.fromTRSValues(
          this.position[0], this.position[1], this.position[2],
          0, Math.sin(halfYaw), 0, Math.cos(halfYaw),
          1, 1, 1,
          this.scratchPlayerMat
        );
        this.engine.entityManager.updateEntityMatrixXYZ(
          this.entityId,
          this.scratchPlayerMat,
          this.position[0],
          this.position[1],
          this.position[2],
          2.5
        );
        const extras = this.extraEntityIds;
        for (let i = 0; i < extras.length; i++) {
          this.engine.entityManager.updateEntityMatrixXYZ(
            extras[i],
            this.scratchPlayerMat,
            this.position[0],
            this.position[1],
            this.position[2],
            2.5
          );
        }
      }

      const camera = this.engine.camera;
      const focus = this.engine.custodyCameraTarget;
      const desiredDist = this.engine.isCustodyDrivingStage() ? 9.6 : 5.8;
      this.cameraDistance += (desiredDist - this.cameraDistance) * Math.min(1.0, deltaSec * 6.0);

      if (!this.isPointerDragging && this.engine.isCustodyDrivingStage()) {
        const desiredTheta = this.rotationY + Math.PI;
        let diff = desiredTheta - this.cameraTheta;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.cameraTheta += diff * Math.min(1.0, deltaSec * 3.5);
        this.cameraPhi += (1.18 - this.cameraPhi) * Math.min(1.0, deltaSec * 3.5);
      }

      camera.target[0] += (focus[0] - camera.target[0]) * Math.min(1.0, deltaSec * 12.0);
      camera.target[1] += (focus[1] - camera.target[1]) * Math.min(1.0, deltaSec * 12.0);
      camera.target[2] += (focus[2] - camera.target[2]) * Math.min(1.0, deltaSec * 12.0);

      let finalRadius = this.cameraDistance;
      if (this.engine.physics) {
        const sinPhi = Math.sin(this.cameraPhi);
        const cosPhi = Math.cos(this.cameraPhi);
        this.scratchRayDir[0] = sinPhi * Math.sin(this.cameraTheta);
        this.scratchRayDir[1] = cosPhi;
        this.scratchRayDir[2] = sinPhi * Math.cos(this.cameraTheta);
        this.scratchRayOrigin[0] = camera.target[0];
        this.scratchRayOrigin[1] = camera.target[1];
        this.scratchRayOrigin[2] = camera.target[2];
        const occluded = this.engine.physics.raycastBoxes(this.scratchRayOrigin, this.scratchRayDir, finalRadius);
        if (occluded < finalRadius) {
          finalRadius = Math.max(1.3, occluded - 0.25);
        }
      }
      camera.theta = this.cameraTheta;
      camera.phi = this.cameraPhi;
      camera.radius = finalRadius;
      camera.updatePositionFromSpherical();
      return;
    }

    if (this.arrestSlowdownTimer > 0) {
      this.arrestSlowdownTimer = Math.max(0, this.arrestSlowdownTimer - deltaSec);
    }

    // If driving a car, run dedicated zero-alloc vehicle simulation & chase camera
    if (this.activeVehicleIndex >= 0 && this.activeVehicleIndex < this.engine.vehicles.length) {
      this.updateDriving(deltaSec);
      return;
    }

    // Track nearest parked vehicle for HUD "Enter Car [E]" prompt (zero alloc)
    this.nearbyVehicleIndex = this.findNearestVehicleIndex(4.4);

    // Energy regeneration and consumption
    this.energy = Math.min(1.0, this.energy + this.energyRegenRate * deltaSec);
    const canRun = this.isRunning && this.energy > 0.05 && this.arrestSlowdownTimer <= 0;

    // 1. Handle A / D Rotation and Proportional Mobile Joystick Turning
    const joyRawX = this.joystickVec[0];
    const joyRawY = this.joystickVec[1];
    const joyAbsX = Math.abs(joyRawX);
    const joyAbsY = Math.abs(joyRawY);

    let keyTurn = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) keyTurn += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) keyTurn -= 1;

    let joyTurn = 0;
    const isJoyWalking = joyAbsY > 0.25 && joyAbsY > joyAbsX * 0.85;
    // Wide straight-walk deadzone (0.42) prevents thumb jitter from curving straight forward movement
    const joyTurnDeadzone = isJoyWalking ? 0.42 : 0.22;
    if (joyAbsX > joyTurnDeadzone) {
      const normalizedX = (joyAbsX - joyTurnDeadzone) / (1.0 - joyTurnDeadzone);
      // Slow, gentle quadratic analog curve for precise mobile aiming
      const maxJoyTurnScale = isJoyWalking ? 0.28 : 0.40;
      joyTurn = -Math.sign(joyRawX) * Math.pow(normalizedX, 1.8) * maxJoyTurnScale;
    }

    const targetTurn = keyTurn + joyTurn;

    if (Math.abs(targetTurn) < 1e-4) {
      // Zero immediately on release/straight-walk so cached angular inertia never twists forward walk
      this.currentTurnSpeed = 0;
    } else {
      this.currentTurnSpeed += (targetTurn * this.turnSpeed - this.currentTurnSpeed) * Math.min(1.0, deltaSec * 14.0);
    }
    this.cameraTheta += this.currentTurnSpeed * deltaSec;

    // Keep Player Facing Angle synchronized to Camera Yaw
    this.rotationY = this.cameraTheta + Math.PI;

    // 2. Check Jump trigger, coyote time, and buffered jump input
    if (this.isGrounded) {
      this.coyoteTimer = 0.16;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - deltaSec);
    }

    if (this.jumpRequested) {
      this.jumpBufferTimer = 0.18;
      this.jumpRequested = false;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - deltaSec);
    }

    if (this.jumpBufferTimer > 0) {
      this.tryExecuteJump();
    }

    // 2b. Punch cooldown, buffered request, gun firing & timed impact impulse
    this.punchCooldown = Math.max(0, this.punchCooldown - deltaSec);
    this.gunCooldown = Math.max(0, this.gunCooldown - deltaSec);
    if (this.gunFireRequested) {
      this.fireWeapon();
      this.gunFireRequested = false;
    }
    if (this.punchRequested) {
      this.punch();
      this.punchRequested = false;
    }
    if (this.isPunching) {
      this.punchTime += deltaSec;
      if (this.punchTime >= 0.12 && !this.punchImpactTriggered) {
        this.punchImpactTriggered = true;
        if (this.engine.physics) {
          this.scratchPunchFwd[0] = -Math.sin(this.cameraTheta);
          this.scratchPunchFwd[1] = 0;
          this.scratchPunchFwd[2] = -Math.cos(this.cameraTheta);
          const hitRes = this.engine.physics.punchNearestObjects(
            this.position,
            this.scratchPunchFwd,
            2.75,
            13.0
          );
          this.lastPunchHitCount = hitRes.hitCount;
          this.lastPunchHitNames.length = 0;
          for (let h = 0; h < hitRes.hitNames.length; h++) {
            this.lastPunchHitNames.push(hitRes.hitNames[h]);
          }
          for (let n = 0; n < hitRes.hitNPCIds.length; n++) {
            this.engine.triggerNpcPunchReaction(hitRes.hitNPCIds[n]);
          }
          if (hitRes.hitPoliceCar) {
            this.engine.onPoliceCarPunched();
          } else if (hitRes.hitCount > 0) {
            this.engine.onPlayerPunchWitnessCheck(this.position, hitRes.hitNPCIds.length > 0);
          }
        }
      }
      if (this.punchTime >= this.punchDuration) {
        this.isPunching = false;
        this.punchTime = 0;
      }
    }

    // 3. Handle W Forward & S Backpedal Movement with analog mobile throttle
    let keyForward = false;
    let keyBackward = false;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) keyForward = true;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) keyBackward = true;

    let joyThrottle = 0;
    if (joyAbsY > 0.22 && joyAbsY > joyAbsX * 0.85) {
      const normY = (joyAbsY - 0.22) / 0.78;
      // Smooth analog speed on mobile (slower max pace than desktop keyboard for indoor control)
      joyThrottle = Math.pow(normY, 1.25) * 0.58;
    }

    const slowedCap = this.arrestSlowdownTimer > 0 ? 2.35 : 99.0;
    let targetSpeed = 0;
    if (keyForward) {
      targetSpeed = Math.min(slowedCap, canRun ? this.runSpeedForward : this.walkSpeedForward);
      if (canRun) {
        this.energy = Math.max(0, this.energy - this.runEnergyCost * deltaSec);
      }
    } else if (keyBackward) {
      targetSpeed = Math.max(-slowedCap, -this.moveSpeedBackward);
    } else if (joyThrottle > 0) {
      if (joyRawY < 0) {
        const baseForward = canRun ? this.runSpeedForward : this.walkSpeedForward;
        targetSpeed = Math.min(slowedCap, baseForward * joyThrottle);
        if (canRun) {
          this.energy = Math.max(0, this.energy - this.runEnergyCost * deltaSec);
        }
      } else {
        targetSpeed = Math.max(-slowedCap, -this.moveSpeedBackward * joyThrottle);
      }
    }

    // Smooth velocity dampening (quick crisp stop when changing direction)
    const friction = targetSpeed === 0 ? 22.0 : 12.0;
    this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1.0, deltaSec * friction);
    this.isMoving = Math.abs(this.currentSpeed) > 0.1 || Math.abs(this.currentTurnSpeed) > 0.1;

    // Decay external police kick / ram knockback (zero alloc)
    this.knockbackCooldown = Math.max(0, this.knockbackCooldown - deltaSec);
    const kbDecay = Math.max(0, 1.0 - deltaSec * 6.5);
    this.knockbackVelX *= kbDecay;
    this.knockbackVelZ *= kbDecay;
    if (Math.abs(this.knockbackVelX) < 0.05) this.knockbackVelX = 0;
    if (Math.abs(this.knockbackVelZ) < 0.05) this.knockbackVelZ = 0;

    // Forward direction vector derived from facing angle
    const fwdX = -Math.sin(this.cameraTheta);
    const fwdZ = -Math.cos(this.cameraTheta);

    const dispX = (fwdX * this.currentSpeed + this.knockbackVelX) * deltaSec;
    const dispZ = (fwdZ * this.currentSpeed + this.knockbackVelZ) * deltaSec;

    // 4. Jump & Gravity Physics
    let dispY = 0;
    if (!this.isGrounded) {
      this.velocityY += this.gravity * deltaSec;
      dispY = this.velocityY * deltaSec;
      this.jumpTime += deltaSec;
    }

    // 5. Jolt Physics Character Collision Sweep (walls, stairs, doors, elevator)
    if (this.engine.physics) {
      this.scratchDisp[0] = dispX;
      this.scratchDisp[1] = dispY;
      this.scratchDisp[2] = dispZ;
      const physRes = this.engine.physics.updateCharacterPhysics(
        this.position,
        this.scratchDisp,
        0.4,
        1.8
      );

      this.position[0] = physRes.newPos[0];
      this.position[1] = physRes.newPos[1];
      this.position[2] = physRes.newPos[2];
      // Preserve airborne state while launching upward so high-FPS frames don't re-ground immediately
      if (this.velocityY > 0.5) {
        this.isGrounded = false;
      } else {
        this.isGrounded = physRes.isGrounded;
      }

      if (physRes.hitCeiling && this.velocityY > 0) {
        this.velocityY = 0;
      }

      if (this.isGrounded) {
        if (this.velocityY <= 0) {
          this.velocityY = 0;
          if (this.isJumping) {
            this.isJumping = false;
            this.landingImpactTimer = 0.12;
          }
        }
      }
    } else {
      this.position[0] += dispX;
      this.position[1] += dispY;
      this.position[2] += dispZ;

      if (this.position[1] <= 0) {
        this.position[1] = 0;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isJumping = false;
      }
    }

    if (this.landingImpactTimer > 0) {
      this.landingImpactTimer -= deltaSec;
    }

    // 4. Update Character Entity Matrix (zero allocation)
    const halfYaw = this.rotationY * 0.5;
    Mat4.fromTRSValues(
      this.position[0], this.position[1], this.position[2],
      0, Math.sin(halfYaw), 0, Math.cos(halfYaw),
      1, 1, 1,
      this.scratchPlayerMat
    );

    this.engine.entityManager.updateEntityMatrixXYZ(
      this.entityId,
      this.scratchPlayerMat,
      this.position[0],
      this.position[1],
      this.position[2],
      2.5
    );
    const extras = this.extraEntityIds;
    for (let i = 0; i < extras.length; i++) {
      this.engine.entityManager.updateEntityMatrixXYZ(
        extras[i],
        this.scratchPlayerMat,
        this.position[0],
        this.position[1],
        this.position[2],
        2.5
      );
    }

    // 5. Check if Player has entered either building structure (Indoor detection)
    const inMainBuilding = Math.abs(this.position[0]) < 19.6 && Math.abs(this.position[2]) < 19.6;
    const inSecondBuilding = Math.abs(this.position[0] - 60.0) < 19.6 && Math.abs(this.position[2]) < 19.6;
    const inBuildingY = this.position[1] >= 0 && this.position[1] < 40.0;
    const isIndoors = (inMainBuilding || inSecondBuilding) && inBuildingY;

    // Target camera distance: 2.8m close-up inside building vs 7.5m outside
    const targetDistance = isIndoors ? 2.8 : 7.5;
    this.cameraDistance += (targetDistance - this.cameraDistance) * Math.min(1.0, deltaSec * 10.0);

    // 6. Update 3rd Person Camera Position & perform occlusion sweep against building walls
    const camera = this.engine.camera;
    const targetY = this.position[1] + (isIndoors ? 1.3 : this.cameraHeight);

    camera.target[0] += (this.position[0] - camera.target[0]) * Math.min(1.0, deltaSec * 18.0);
    camera.target[1] += (targetY - camera.target[1]) * Math.min(1.0, deltaSec * 18.0);
    camera.target[2] += (this.position[2] - camera.target[2]) * Math.min(1.0, deltaSec * 18.0);

    let finalRadius = this.cameraDistance;

    // Raycast from player target toward camera position to prevent camera from clipping behind exterior walls
    if (this.engine.physics) {
      const sinPhi = Math.sin(this.cameraPhi);
      const cosPhi = Math.cos(this.cameraPhi);
      const sinTheta = Math.sin(this.cameraTheta);
      const cosTheta = Math.cos(this.cameraTheta);

      this.scratchRayDir[0] = sinPhi * sinTheta;
      this.scratchRayDir[1] = cosPhi;
      this.scratchRayDir[2] = sinPhi * cosTheta;

      this.scratchRayOrigin[0] = camera.target[0];
      this.scratchRayOrigin[1] = camera.target[1];
      this.scratchRayOrigin[2] = camera.target[2];

      const occludedDist = this.engine.physics.raycastBoxes(this.scratchRayOrigin, this.scratchRayDir, finalRadius);
      if (occludedDist < finalRadius) {
        finalRadius = Math.max(1.1, occludedDist - 0.25);
      }
    }

    camera.theta = this.cameraTheta;
    camera.phi = this.cameraPhi;
    camera.radius = finalRadius;
    camera.updatePositionFromSpherical();
  }

  /**
   * Zero-allocation driving physics, steering, curb riding, prop ramming & chase camera
   */
  private updateDriving(deltaSec: number): void {
    const car = this.engine.vehicles[this.activeVehicleIndex];
    if (!car) {
      this.activeVehicleIndex = -1;
      this.engine.setPlayerEntitiesVisible(true);
      return;
    }

    const dt = Math.min(deltaSec, 0.05);
    car.impactCooldown = Math.max(0, car.impactCooldown - dt);
    const tiltDecay = Math.max(0, 1.0 - dt * 9.0);
    car.tiltX *= tiltDecay;
    car.tiltZ *= tiltDecay;
    const knockDecay = Math.max(0, 1.0 - dt * 5.0);
    car.velX *= knockDecay;
    car.velZ *= knockDecay;
    car.angularVelY *= Math.max(0, 1.0 - dt * 6.0);
    if (Math.abs(car.velX) < 0.03) car.velX = 0;
    if (Math.abs(car.velZ) < 0.03) car.velZ = 0;
    if (Math.abs(car.angularVelY) < 0.01) car.angularVelY = 0;

    const abilityRatio = car.maxHealth > 0 ? Math.max(0, car.health / car.maxHealth) : 0;
    const isWrecked = car.health <= 0;

    const joyRawX = this.joystickVec[0];
    const joyRawY = this.joystickVec[1];
    const joyAbsX = Math.abs(joyRawX);
    const joyAbsY = Math.abs(joyRawY);

    // Throttle / Brake / Reverse (disabled if car ability reached 0% Wrecked)
    let throttle = 0;
    if (!isWrecked) {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle -= 1;
      if (joyAbsY > 0.18 && Math.abs(throttle) < 0.01) {
        const mag = (joyAbsY - 0.18) / 0.82;
        throttle = joyRawY < 0 ? mag : -mag;
      }
    }

    const handbrake = !!this.keys['Space'] || this.jumpRequested;
    this.jumpRequested = false;
    this.punchRequested = false;

    const speedScale = 0.55 + 0.45 * abilityRatio;
    const accelScale = 0.50 + 0.50 * abilityRatio;
    const maxForward = (this.isRunning ? 38.0 : 28.0) * speedScale;
    const maxReverse = -11.5 * (0.60 + 0.40 * abilityRatio);

    if (handbrake) {
      const brakeStep = 48.0 * dt;
      if (Math.abs(car.speed) <= brakeStep) car.speed = 0;
      else car.speed -= Math.sign(car.speed) * brakeStep;
    } else if (throttle > 0.05) {
      if (car.speed < -0.5) {
        car.speed = Math.min(0, car.speed + 36.0 * dt);
      } else {
        const accel = (this.isRunning ? 26.0 : 19.0) * accelScale;
        car.speed = Math.min(maxForward, car.speed + accel * throttle * dt);
      }
    } else if (throttle < -0.05) {
      if (car.speed > 0.5) {
        car.speed = Math.max(0, car.speed - 38.0 * dt);
      } else {
        car.speed = Math.max(maxReverse, car.speed + 14.0 * accelScale * throttle * dt);
      }
    } else {
      // Natural aerodynamic & rolling coast decay
      const drag = Math.max(0, 1.0 - dt * (isWrecked ? 2.4 : 1.45));
      car.speed *= drag;
      if (Math.abs(car.speed) < 0.12) car.speed = 0;
    }

    // Steering (Left increases rotationY => turns screen-left from behind car)
    let steerInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steerInput += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steerInput -= 1;
    if (joyAbsX > 0.18 && Math.abs(steerInput) < 0.01) {
      steerInput = -Math.sign(joyRawX) * ((joyAbsX - 0.18) / 0.82);
    }

    car.steerAngle += (steerInput - car.steerAngle) * Math.min(1.0, dt * 10.0);
    const absSpd = Math.abs(car.speed);
    if (absSpd > 0.25) {
      const steerAuth = Math.min(1.0, absSpd / 5.5) * (1.0 - Math.min(0.35, absSpd / 55.0));
      const reverseFlip = car.speed >= -0.1 ? 1.0 : -1.0;
      car.rotationY += car.steerAngle * 2.35 * steerAuth * reverseFlip * dt;
    }
    car.rotationY += car.angularVelY * dt;

    // Integrate vehicle world displacement with JoltPhysics 2-axle sweep
    const fwdX = Math.sin(car.rotationY);
    const fwdZ = Math.cos(car.rotationY);
    const dispX = (fwdX * car.speed + car.velX) * dt;
    const dispZ = (fwdZ * car.speed + car.velZ) * dt;

    let nextX = car.position[0] + dispX;
    let nextY = car.position[1];
    let nextZ = car.position[2] + dispZ;

    if (this.engine.physics) {
      const res = this.engine.physics.resolveVehicleMovement(
        car.position[0],
        car.position[1],
        car.position[2],
        dispX,
        dispZ,
        car.rotationY,
        car.colliderId,
        car.speed,
        car
      );
      nextX = res.x;
      nextZ = res.z;
      nextY = car.position[1] + (res.y - car.position[1]) * Math.min(1.0, dt * 16.0);
      if (res.collided) {
        car.speed *= 0.35;
        car.velX *= 0.35;
        car.velZ *= 0.35;
      }
      this.engine.physics.updateVehicleCollider(car.colliderId, nextX, nextY, nextZ, car.rotationY);
    }

    // World bounds safety clamp (expanded for Out-of-City Max Security Prison)
    nextX = Math.max(-245, Math.min(260, nextX));
    nextZ = Math.max(-265, Math.min(220, nextZ));

    car.position[0] = nextX;
    car.position[1] = nextY;
    car.position[2] = nextZ;

    // Keep PlayerController & SmartCulling synchronized with car position
    this.position[0] = nextX;
    this.position[1] = nextY;
    this.position[2] = nextZ;
    this.rotationY = car.rotationY;

    // Update all 6 multi-part vehicle meshes in GPU entity buffer including suspension tilt (zero allocation)
    const cx = Math.cos(car.tiltX * 0.5), sx = Math.sin(car.tiltX * 0.5);
    const cy = Math.cos(car.rotationY * 0.5), sy = Math.sin(car.rotationY * 0.5);
    const cz = Math.cos(car.tiltZ * 0.5), sz = Math.sin(car.tiltZ * 0.5);
    const qw = cy * cx * cz + sy * sx * sz;
    const qx = cy * sx * cz + sy * cx * sz;
    const qy = sy * cx * cz - cy * sx * sz;
    const qz = cy * cx * sz - sy * sx * cz;
    Mat4.fromTRSValues(
      nextX, nextY, nextZ,
      qx, qy, qz, qw,
      1, 1, 1,
      this.scratchPlayerMat
    );
    const carEnts = car.entityIds;
    for (let i = 0; i < carEnts.length; i++) {
      this.engine.entityManager.updateEntityMatrixXYZ(carEnts[i], this.scratchPlayerMat, nextX, nextY, nextZ, 3.2);
    }

    // Smooth Chase Camera behind vehicle (keeps orbit override when dragging)
    if (!this.isPointerDragging) {
      const desiredTheta = car.rotationY + Math.PI;
      let diff = desiredTheta - this.cameraTheta;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const followRate = Math.abs(car.speed) > 1.2 ? 6.5 : 3.2;
      this.cameraTheta += diff * Math.min(1.0, dt * followRate);
      this.cameraPhi += (1.22 - this.cameraPhi) * Math.min(1.0, dt * 4.0);
    }

    const targetDriveDist = 8.8 + Math.min(2.8, Math.abs(car.speed) * 0.08);
    this.cameraDistance += (targetDriveDist - this.cameraDistance) * Math.min(1.0, dt * 8.0);

    const camera = this.engine.camera;
    const lookX = nextX + fwdX * 1.4;
    const lookY = nextY + 1.45;
    const lookZ = nextZ + fwdZ * 1.4;

    camera.target[0] += (lookX - camera.target[0]) * Math.min(1.0, dt * 16.0);
    camera.target[1] += (lookY - camera.target[1]) * Math.min(1.0, dt * 16.0);
    camera.target[2] += (lookZ - camera.target[2]) * Math.min(1.0, dt * 16.0);

    let finalRadius = this.cameraDistance;
    if (this.engine.physics) {
      const sinPhi = Math.sin(this.cameraPhi);
      const cosPhi = Math.cos(this.cameraPhi);
      this.scratchRayDir[0] = sinPhi * Math.sin(this.cameraTheta);
      this.scratchRayDir[1] = cosPhi;
      this.scratchRayDir[2] = sinPhi * Math.cos(this.cameraTheta);
      this.scratchRayOrigin[0] = camera.target[0];
      this.scratchRayOrigin[1] = camera.target[1];
      this.scratchRayOrigin[2] = camera.target[2];
      const occluded = this.engine.physics.raycastBoxes(this.scratchRayOrigin, this.scratchRayDir, finalRadius);
      if (occluded < finalRadius) {
        finalRadius = Math.max(2.6, occluded - 0.35);
      }
    }

    camera.theta = this.cameraTheta;
    camera.phi = this.cameraPhi;
    camera.radius = finalRadius;
    camera.updatePositionFromSpherical();
  }
}
