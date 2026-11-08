/**
 * Destroyer Engine - 3D Camera System
 * Supports Orbit, FPS, and Fly camera modes with 6-plane Frustum Culling calculation.
 */

import { Mat4 } from '../math/Mat4';

export class Camera {
  public position: [number, number, number] = [0, 8, 22];
  public target: [number, number, number] = [0, 1, 0];
  public up: [number, number, number] = [0, 1, 0];

  public fov = 60 * (Math.PI / 180);
  public aspect = 16 / 9;
  public near = 0.1;
  public far = 1000.0;

  // Spherical coordinates for Orbit mode
  public radius = 22.0;
  public theta = 0.5; // azimuthal angle
  public phi = 0.45;  // polar angle

  // Euler angles for FPS/Fly mode
  public yaw = Math.PI;
  public pitch = -0.15;
  public mode: 'ORBIT' | 'FPS' | 'FLY' = 'ORBIT';
  public moveSpeed = 15.0;

  // Key states
  public keysPressed: Record<string, boolean> = {};

  // Matrices
  public viewMatrix = Mat4.create();
  public projMatrix = Mat4.create();
  public viewProjMatrix = Mat4.create();

  // 6 Frustum Planes (ax + by + cz + d = 0, normalized)
  public frustumPlanes = new Float32Array(24);
  public frozenFrustumPlanes = new Float32Array(24);
  public isFrustumFrozen = false;
  public autoOrbit = false;

  constructor() {
    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  setMode(mode: 'ORBIT' | 'FPS' | 'FLY'): void {
    this.mode = mode;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.updateMatrices();
  }

  toggleFrustumFreeze(): boolean {
    this.isFrustumFrozen = !this.isFrustumFrozen;
    if (this.isFrustumFrozen) {
      this.frozenFrustumPlanes.set(this.frustumPlanes);
    }
    return this.isFrustumFrozen;
  }

  orbit(deltaTheta: number, deltaPhi: number): void {
    if (this.mode !== 'ORBIT') return;
    this.theta += deltaTheta;
    this.phi = Math.max(0.01, Math.min(Math.PI * 0.49, this.phi + deltaPhi));
    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  zoom(delta: number): void {
    if (this.mode !== 'ORBIT') return;
    this.radius = Math.max(2.0, Math.min(300.0, this.radius + delta));
    this.updatePositionFromSpherical();
    this.updateMatrices();
  }

  updatePositionFromSpherical(): void {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    this.position[0] = this.target[0] + this.radius * sinPhi * sinTheta;
    this.position[1] = this.target[1] + this.radius * cosPhi;
    this.position[2] = this.target[2] + this.radius * sinPhi * cosTheta;
    this.updateMatrices();
  }

  update(deltaTimeSeconds: number): void {
    if (this.autoOrbit && this.mode === 'ORBIT') {
      this.orbit(deltaTimeSeconds * 0.25, 0);
    }

    if (this.mode === 'FPS' || this.mode === 'FLY') {
      const speed = this.moveSpeed * deltaTimeSeconds;
      const forward: [number, number, number] = [
        Math.sin(this.yaw) * Math.cos(this.pitch),
        this.mode === 'FLY' ? Math.sin(this.pitch) : 0,
        Math.cos(this.yaw) * Math.cos(this.pitch),
      ];
      const right: [number, number, number] = [
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw),
      ];

      if (this.keysPressed['KeyW']) {
        this.position[0] += forward[0] * speed;
        this.position[1] += forward[1] * speed;
        this.position[2] += forward[2] * speed;
      }
      if (this.keysPressed['KeyS']) {
        this.position[0] -= forward[0] * speed;
        this.position[1] -= forward[1] * speed;
        this.position[2] -= forward[2] * speed;
      }
      if (this.keysPressed['KeyD']) {
        this.position[0] += right[0] * speed;
        this.position[2] += right[2] * speed;
      }
      if (this.keysPressed['KeyA']) {
        this.position[0] -= right[0] * speed;
        this.position[2] -= right[2] * speed;
      }
      if (this.keysPressed['KeyE'] || this.keysPressed['Space']) {
        this.position[1] += speed;
      }
      if (this.keysPressed['KeyQ'] || this.keysPressed['ShiftLeft']) {
        this.position[1] -= speed;
      }

      this.target[0] = this.position[0] + forward[0];
      this.target[1] = this.position[1] + (this.mode === 'FLY' ? forward[1] : Math.sin(this.pitch));
      this.target[2] = this.position[2] + forward[2];
    }

    this.updateMatrices();
  }

  updateMatrices(): void {
    Mat4.perspective(this.fov, this.aspect, this.near, this.far, this.projMatrix);
    Mat4.lookAt(this.position, this.target, this.up, this.viewMatrix);
    Mat4.multiply(this.projMatrix, this.viewMatrix, this.viewProjMatrix);

    if (!this.isFrustumFrozen) {
      this.extractFrustumPlanes();
    }
  }

  private extractFrustumPlanes(): void {
    const m = this.viewProjMatrix;
    const planes = this.frustumPlanes;

    // Left: row 4 + row 1
    planes[0] = m[3] + m[0];
    planes[1] = m[7] + m[4];
    planes[2] = m[11] + m[8];
    planes[3] = m[15] + m[12];

    // Right: row 4 - row 1
    planes[4] = m[3] - m[0];
    planes[5] = m[7] - m[4];
    planes[6] = m[11] - m[8];
    planes[7] = m[15] - m[12];

    // Bottom: row 4 + row 2
    planes[8] = m[3] + m[1];
    planes[9] = m[7] + m[5];
    planes[10] = m[11] + m[9];
    planes[11] = m[15] + m[13];

    // Top: row 4 - row 2
    planes[12] = m[3] - m[1];
    planes[13] = m[7] - m[5];
    planes[14] = m[11] - m[9];
    planes[15] = m[15] - m[13];

    // Near: row 3
    planes[16] = m[2];
    planes[17] = m[6];
    planes[18] = m[10];
    planes[19] = m[14];

    // Far: row 4 - row 3
    planes[20] = m[3] - m[2];
    planes[21] = m[7] - m[6];
    planes[22] = m[11] - m[10];
    planes[23] = m[15] - m[14];

    // Normalize planes
    for (let i = 0; i < 6; i++) {
      const offset = i * 4;
      const len = Math.hypot(planes[offset], planes[offset + 1], planes[offset + 2]);
      if (len > 0.00001) {
        const invLen = 1.0 / len;
        planes[offset] *= invLen;
        planes[offset + 1] *= invLen;
        planes[offset + 2] *= invLen;
        planes[offset + 3] *= invLen;
      }
    }
  }
}
