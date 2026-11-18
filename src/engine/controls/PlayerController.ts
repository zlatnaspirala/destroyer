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

  // 3rd Person Camera settings (Theta = horizontal yaw, Phi = vertical pitch)
  public cameraDistance = 7.5;
  public cameraHeight = 1.4;
  public cameraTheta = 0.0;    // Camera horizontal angle around player
  public cameraPhi = 1.25;      // Camera pitch angle (~70 deg from top)

  // Registered entity IDs for player character (supports multi-primitive GLB characters)
  public entityId = -1;
  public extraEntityIds: number[] = [];

  // Input states
  private keys: Record<string, boolean> = {};
  public joystickVec: [number, number] = [0, 0];
  public jumpRequested = false;
  public punchRequested = false;

  private isPointerDragging = false;
  private isTouchPointer = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

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
        // Shift key toggles or holds running
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          this.isRunning = true;
        }
        if (e.code === 'Space') {
          e.preventDefault();
          this.jump();
        }
        if (e.code === 'KeyF' && !e.repeat) {
          e.preventDefault();
          this.punch();
        }

        // 3D Elevator Button interaction via E key or Digit keys
        if (e.code === 'KeyE') {
          this.interactWith3DElevatorButton();
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

  public interactWith3DElevatorButton(): void {
    if (!this.engine.physics) return;

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
    this.lastPunchHitNames = [];
    this.energy = Math.max(0, this.energy - this.punchEnergyCost);
    return true;
  }

  public jump(): void {
    this.jumpBufferTimer = 0.18;
    this.tryExecuteJump();
  }

  private tryExecuteJump(): boolean {
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

    // Energy regeneration and consumption
    this.energy = Math.min(1.0, this.energy + this.energyRegenRate * deltaSec);
    const canRun = this.isRunning && this.energy > 0.05;

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

    // 2b. Punch cooldown, buffered request & timed impact impulse
    this.punchCooldown = Math.max(0, this.punchCooldown - deltaSec);
    if (this.punchRequested) {
      this.punch();
      this.punchRequested = false;
    }
    if (this.isPunching) {
      this.punchTime += deltaSec;
      if (this.punchTime >= 0.12 && !this.punchImpactTriggered) {
        this.punchImpactTriggered = true;
        if (this.engine.physics) {
          const punchFwdX = -Math.sin(this.cameraTheta);
          const punchFwdZ = -Math.cos(this.cameraTheta);
          const hitRes = this.engine.physics.punchNearestObjects(
            this.position,
            [punchFwdX, 0, punchFwdZ],
            2.75,
            13.0
          );
          this.lastPunchHitCount = hitRes.hitCount;
          this.lastPunchHitNames = hitRes.hitNames;
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

    let targetSpeed = 0;
    if (keyForward) {
      targetSpeed = canRun ? this.runSpeedForward : this.walkSpeedForward;
      if (canRun) {
        this.energy = Math.max(0, this.energy - this.runEnergyCost * deltaSec);
      }
    } else if (keyBackward) {
      targetSpeed = -this.moveSpeedBackward;
    } else if (joyThrottle > 0) {
      if (joyRawY < 0) {
        const baseForward = canRun ? this.runSpeedForward : this.walkSpeedForward;
        targetSpeed = baseForward * joyThrottle;
        if (canRun) {
          this.energy = Math.max(0, this.energy - this.runEnergyCost * deltaSec);
        }
      } else {
        targetSpeed = -this.moveSpeedBackward * joyThrottle;
      }
    }

    // Smooth velocity dampening (quick crisp stop when changing direction)
    const friction = targetSpeed === 0 ? 22.0 : 12.0;
    this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1.0, deltaSec * friction);
    this.isMoving = Math.abs(this.currentSpeed) > 0.1 || Math.abs(this.currentTurnSpeed) > 0.1;

    // Forward direction vector derived from facing angle
    const fwdX = -Math.sin(this.cameraTheta);
    const fwdZ = -Math.cos(this.cameraTheta);

    const dispX = fwdX * this.currentSpeed * deltaSec;
    const dispZ = fwdZ * this.currentSpeed * deltaSec;

    // 4. Jump & Gravity Physics
    let dispY = 0;
    if (!this.isGrounded) {
      this.velocityY += this.gravity * deltaSec;
      dispY = this.velocityY * deltaSec;
      this.jumpTime += deltaSec;
    }

    // 5. Jolt Physics Character Collision Sweep (walls, stairs, doors, elevator)
    if (this.engine.physics) {
      const physRes = this.engine.physics.updateCharacterPhysics(
        this.position,
        [dispX, dispY, dispZ],
        0.4,
        1.8
      );

      this.position = physRes.newPos;
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

    // 4. Update Character Entity Matrix
    const playerMat = Mat4.create();
    const rotQuat: [number, number, number, number] = [
      0,
      Math.sin(this.rotationY * 0.5),
      0,
      Math.cos(this.rotationY * 0.5),
    ];
    Mat4.fromTranslationRotationScale(this.position, rotQuat, [1, 1, 1], playerMat);

    this.engine.entityManager.updateEntityMatrix(
      this.entityId,
      playerMat,
      this.position,
      2.5
    );
    for (const extraId of this.extraEntityIds) {
      this.engine.entityManager.updateEntityMatrix(
        extraId,
        playerMat,
        this.position,
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

      const rayDir: [number, number, number] = [
        sinPhi * sinTheta,
        cosPhi,
        sinPhi * cosTheta,
      ];

      const rayOrigin: [number, number, number] = [
        camera.target[0],
        camera.target[1],
        camera.target[2],
      ];

      const occludedDist = this.engine.physics.raycastBoxes(rayOrigin, rayDir, finalRadius);
      if (occludedDist < finalRadius) {
        finalRadius = Math.max(1.1, occludedDist - 0.25);
      }
    }

    camera.theta = this.cameraTheta;
    camera.phi = this.cameraPhi;
    camera.radius = finalRadius;
    camera.updatePositionFromSpherical();
  }
}
