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
  public energyRegenRate = 0.15; // 15% per second
  public jumpEnergyCost = 0.2;  // 20% per jump
  public runEnergyCost = 0.1;   // 10% per second while running and moving

  public rotationY = 0;        // Player facing yaw angle in radians
  public isRunning = false;    // Run mode toggle (walk vs run)
  public isJumping = false;    // Character jumping state
  public jumpTime = 0;         // Seconds elapsed since jump launch
  public readonly jumpTotalDuration = 0.82; // Total air duration
  public landingImpactTimer = 0; // Landing compression timer
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

  // Registered entity ID for player character
  public entityId = -1;

  // Input states
  private keys: Record<string, boolean> = {};
  public joystickVec: [number, number] = [0, 0];
  public jumpRequested = false;

  private isPointerDragging = false;
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

  public jump(): void {
    if (this.isGrounded && this.energy >= this.jumpEnergyCost) {
      this.velocityY = this.jumpStrength;
      this.isGrounded = false;
      this.isJumping = true;
      this.jumpTime = 0;
      this.landingImpactTimer = 0;
      this.energy -= this.jumpEnergyCost;
    }
  }

  public handlePointerDown(x: number, y: number, button: number): void {
    if (button === 0 || button === 2) {
      this.isPointerDragging = true;
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

    // Manual camera orbit via mouse drag
    this.cameraTheta += dx * 0.005;
    this.cameraPhi += dy * 0.004;

    // Clamp vertical camera pitch (phi: 0.02 to 1.52 rad) - allows looking straight up at sky
    this.cameraPhi = Math.max(0.02, Math.min(1.52, this.cameraPhi));
  }

  public handlePointerUp(): void {
    this.isPointerDragging = false;
  }

  public handleZoom(delta: number): void {
    this.cameraDistance = Math.max(3.0, Math.min(25.0, this.cameraDistance + delta));
  }

  public update(deltaSec: number): void {
    if (this.entityId < 0 || this.engine.isDeviceLost) return;

    // Energy regeneration and consumption
    this.energy = Math.min(1.0, this.energy + this.energyRegenRate * deltaSec);
    const canRun = this.isRunning && this.energy > 0.05;

    // 1. Handle A / D Rotation with smooth angular dampening (A = Turn Left, D = Turn Right)
    let targetTurn = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) targetTurn += 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) targetTurn -= 1;

    if (Math.abs(this.joystickVec[0]) > 0.15) {
      targetTurn -= Math.sign(this.joystickVec[0]);
    }

    // Smoothly lerp turn speed for fluid rotation
    this.currentTurnSpeed += (targetTurn * this.turnSpeed - this.currentTurnSpeed) * Math.min(1.0, deltaSec * 14.0);
    this.cameraTheta += this.currentTurnSpeed * deltaSec;

    // Keep Player Facing Angle synchronized to Camera Yaw
    this.rotationY = this.cameraTheta + Math.PI;

    // 2. Check Jump trigger
    if (this.jumpRequested) {
      this.jump();
      this.jumpRequested = false;
    }

    // 3. Handle W Forward & S Backpedal Movement with smooth acceleration/friction
    let isForward = false;
    let isBackward = false;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) isForward = true;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) isBackward = true;

    // Joystick: Only walk if horizontal input is not dominant (allows turning in place)
    const joyX = Math.abs(this.joystickVec[0]);
    const joyY = Math.abs(this.joystickVec[1]);
    if (joyY > 0.15 && joyY > joyX * 0.8) {
      if (this.joystickVec[1] < -0.15) isForward = true;
      if (this.joystickVec[1] > 0.15) isBackward = true;
    }

    let targetSpeed = 0;
    if (isForward) {
      targetSpeed = canRun ? this.runSpeedForward : this.walkSpeedForward;
      if (canRun) {
        this.energy = Math.max(0, this.energy - this.runEnergyCost * deltaSec);
      }
    } else if (isBackward) {
      targetSpeed = -this.moveSpeedBackward;
    }

    // Smooth velocity dampening (silky acceleration and friction deceleration)
    const friction = targetSpeed === 0 ? (Math.abs(targetTurn) > 0.1 ? 35.0 : 12.0) : 12.0;
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
      this.isGrounded = physRes.isGrounded;

      if (physRes.isGrounded) {
        if (this.velocityY < 0) {
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

    // 5. Check if Player has entered the building structure (Indoor detection)
    const inBuildingX = Math.abs(this.position[0]) < 19.5;
    const inBuildingZ = Math.abs(this.position[2]) < 19.5;
    const inBuildingY = this.position[1] >= 0 && this.position[1] < 42.0;
    const isIndoors = inBuildingX && inBuildingZ && inBuildingY;

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
