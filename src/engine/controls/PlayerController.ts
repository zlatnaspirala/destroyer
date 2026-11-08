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

  public rotationY = 0;        // Player facing yaw angle in radians
  public moveSpeedForward = 9.0;
  public moveSpeedBackward = 4.0;
  public turnSpeed = 2.4;     // Radians per second for A / D turning

  public isMoving = false;

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

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        this.jump();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  public jump(): void {
    if (this.isGrounded) {
      this.velocityY = this.jumpStrength;
      this.isGrounded = false;
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

    // Manual camera orbit via mouse drag (turns camera and player together)
    this.cameraTheta += dx * 0.005;
    this.cameraPhi += dy * 0.004;

    // Clamp vertical camera pitch (phi: 0.25 to 1.45 rad)
    this.cameraPhi = Math.max(0.25, Math.min(1.45, this.cameraPhi));
  }

  public handlePointerUp(): void {
    this.isPointerDragging = false;
  }

  public handleZoom(delta: number): void {
    this.cameraDistance = Math.max(3.0, Math.min(25.0, this.cameraDistance + delta));
  }

  public update(deltaSec: number): void {
    if (this.entityId < 0 || this.engine.isDeviceLost) return;

    // 1. Handle A / D Rotation (turns Player & Camera Left / Right)
    let turnInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) turnInput -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) turnInput += 1;

    // Add mobile touch joystick horizontal turn input
    if (Math.abs(this.joystickVec[0]) > 0.15) {
      turnInput += Math.sign(this.joystickVec[0]);
    }

    if (turnInput !== 0) {
      this.cameraTheta += turnInput * this.turnSpeed * deltaSec;
    }

    // Keep Player Facing Angle synchronized to Camera Yaw
    this.rotationY = this.cameraTheta + Math.PI;

    // 2. Handle W Forward & S Slow Backpedal Movement
    let isForward = false;
    let isBackward = false;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) isForward = true;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) isBackward = true;

    if (this.joystickVec[1] < -0.15) isForward = true;
    if (this.joystickVec[1] > 0.15) isBackward = true;

    if (this.jumpRequested) {
      this.jump();
      this.jumpRequested = false;
    }

    this.isMoving = isForward || isBackward || turnInput !== 0;

    // Forward direction vector derived from facing angle
    const fwdX = -Math.sin(this.cameraTheta);
    const fwdZ = -Math.cos(this.cameraTheta);

    if (isForward) {
      this.position[0] += fwdX * this.moveSpeedForward * deltaSec;
      this.position[2] += fwdZ * this.moveSpeedForward * deltaSec;
    } else if (isBackward) {
      // Slowly backpedal backward without rotating
      this.position[0] -= fwdX * this.moveSpeedBackward * deltaSec;
      this.position[2] -= fwdZ * this.moveSpeedBackward * deltaSec;
    }

    // 3. Jump & Gravity Physics
    if (!this.isGrounded) {
      this.velocityY += this.gravity * deltaSec;
      this.position[1] += this.velocityY * deltaSec;

      if (this.position[1] <= 0) {
        this.position[1] = 0;
        this.velocityY = 0;
        this.isGrounded = true;
      }
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

    // 5. Update 3rd Person Camera Position directly behind player's back
    const camera = this.engine.camera;
    const targetY = this.position[1] + this.cameraHeight;

    camera.target[0] += (this.position[0] - camera.target[0]) * Math.min(1.0, deltaSec * 18.0);
    camera.target[1] += (targetY - camera.target[1]) * Math.min(1.0, deltaSec * 18.0);
    camera.target[2] += (this.position[2] - camera.target[2]) * Math.min(1.0, deltaSec * 18.0);

    camera.theta = this.cameraTheta;
    camera.phi = this.cameraPhi;
    camera.radius = this.cameraDistance;
    camera.updatePositionFromSpherical();
  }
}
