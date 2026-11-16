/**
 * Destroyer Engine - Vertex Animation System
 * Handles:
 * 1. GPU Morph Targets (Blend Shapes) with interpolation & weight control
 * 2. Skeletal Joint Skinning with full TRS animation clip evaluation & topological hierarchy
 * 3. Loading and playing Biovision Hierarchy (BVH) motion capture data
 * 4. Procedural Harmonic Vertex Wave simulation
 */

import { Mat4 } from '../math/Mat4';
import { AnimationClip, MorphTargetData, SkeletonJoint } from '../core/Types';
import { FlatEntityManager } from '../core/FlatEntityManager';
import { BVHLoader, BVHParseOptions } from '../loaders/BVHLoader';

export class VertexAnimationController {
  private entityManager?: FlatEntityManager;

  public morphWeights: Float32Array = new Float32Array(4);
  public morphTargets: MorphTargetData[] = [];

  public joints: SkeletonJoint[] = [];
  public clips: AnimationClip[] = [];
  public currentClipIndex = 0;
  public currentTime = 0;
  public isPlaying = true;
  public isLooping = true;
  public playbackSpeed = 1.0;

  public waveFactor = 0.0;
  public waveSpeed = 1.0;

  // Pre-allocated scratch buffers for zero-GC clip evaluation
  private scratchT = new Float32Array(0);
  private scratchR = new Float32Array(0);
  private scratchS = new Float32Array(0);
  private scratchVisited = new Uint8Array(0);
  private scratchSkinMat = new Float32Array(16);

  constructor(entityManager?: FlatEntityManager) {
    this.entityManager = entityManager;
    this.morphWeights.fill(0);
  }

  private ensureScratchSize(jointCount: number): void {
    if (this.scratchVisited.length < jointCount) {
      this.scratchT = new Float32Array(jointCount * 3);
      this.scratchR = new Float32Array(jointCount * 4);
      this.scratchS = new Float32Array(jointCount * 3);
      this.scratchVisited = new Uint8Array(jointCount);
    }
  }

  private computeJointWorld(idx: number): Float32Array {
    const joint = this.joints[idx];
    if (this.scratchVisited[idx]) return joint.worldMatrix;
    this.scratchVisited[idx] = 1;

    if (joint.parentIndex < 0 || joint.parentIndex >= this.joints.length) {
      joint.worldMatrix.set(joint.localMatrix);
    } else {
      const parentWorld = this.computeJointWorld(joint.parentIndex);
      Mat4.multiply(parentWorld, joint.localMatrix, joint.worldMatrix);
    }
    return joint.worldMatrix;
  }

  registerSkeleton(joints: SkeletonJoint[], clip?: AnimationClip): number {
    const offset = this.joints.length;

    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      if (!j.initialTranslation || !j.initialRotation || !j.initialScale) {
        const dec = Mat4.decompose(j.localMatrix);
        if (!j.initialTranslation) j.initialTranslation = dec.translation;
        if (!j.initialRotation) j.initialRotation = dec.rotation;
        if (!j.initialScale) j.initialScale = dec.scale;
      }
      if (offset > 0 && j.parentIndex >= 0) {
        j.parentIndex += offset;
      }
      this.joints.push(j);
    }

    if (clip) {
      this.addClip(clip);
    }

    if (this.entityManager) {
      this.entityManager.totalJointsCount = this.joints.length;
      this.ensureScratchSize(this.joints.length);
      this.scratchVisited.fill(0);

      // Populate initial skinning matrices in bind pose
      for (let i = offset; i < this.joints.length; i++) {
        const joint = this.joints[i];
        this.computeJointWorld(i);
        Mat4.multiply(joint.worldMatrix, joint.inverseBindMatrix, this.scratchSkinMat);
        const bufOffset = i * 16;
        if (bufOffset + 16 <= this.entityManager.jointMatrices.length) {
          this.entityManager.jointMatrices.set(this.scratchSkinMat, bufOffset);
        }
      }
    }
    return offset;
  }

  setMorphWeight(index: number, weight: number): void {
    if (index >= 0 && index < this.morphWeights.length) {
      this.morphWeights[index] = Math.max(0, Math.min(1, weight));
    }
  }

  addClip(clip: AnimationClip): number {
    const existingIdx = this.clips.findIndex((c) => c.name === clip.name);
    if (existingIdx >= 0) {
      this.clips[existingIdx] = clip;
      return existingIdx;
    }
    this.clips.push(clip);
    return this.clips.length - 1;
  }

  loadBVH(bvhText: string, options?: BVHParseOptions): number {
    const clip = BVHLoader.parse(bvhText, options);
    const clipIdx = this.addClip(clip);
    this.playClip(clipIdx, true);
    return clipIdx;
  }

  playClip(index: number, loop = true): void {
    if (index >= 0 && index < this.clips.length) {
      if (this.currentClipIndex !== index) {
        this.currentClipIndex = index;
        this.currentTime = 0;
      }
      this.isLooping = loop;
      this.isPlaying = true;
    }
  }

  playClipByName(name: string, loop = true): boolean {
    const lowerName = name.toLowerCase();
    const idx = this.clips.findIndex(
      (c) => c.name.toLowerCase() === lowerName || c.name.toLowerCase().includes(lowerName)
    );
    if (idx >= 0) {
      this.playClip(idx, loop);
      return true;
    }
    return false;
  }

  getCurrentClipName(): string {
    return this.clips[this.currentClipIndex]?.name || 'None';
  }

  getClipNames(): string[] {
    return this.clips.map((c) => c.name);
  }

  clear(): void {
    this.joints = [];
    this.clips = [];
    this.currentClipIndex = 0;
    this.currentTime = 0;
    this.morphTargets = [];
  }

  evaluateClipAtTime(
    clipNameOrIndex: string | number,
    timeSec: number,
    outJointMatrices?: Float32Array,
    jointMatrixOffset = 0
  ): void {
    const targetBuffer = outJointMatrices || this.entityManager?.jointMatrices;
    if (!targetBuffer) return;

    let clip: AnimationClip | undefined;
    if (typeof clipNameOrIndex === 'number') {
      clip = this.clips[clipNameOrIndex];
    } else {
      const lower = clipNameOrIndex.toLowerCase();
      clip = this.clips.find((c) => c.name.toLowerCase().includes(lower));
    }

    if (clip && clip.duration > 0) {
      const clampedTime = Math.max(0, Math.min(clip.duration, timeSec));
      this.evaluateClip(clip, clampedTime, targetBuffer, jointMatrixOffset);
    }
  }

  update(deltaTimeSeconds: number, outJointMatrices?: Float32Array, jointMatrixOffset = 0): void {
    const targetBuffer = outJointMatrices || this.entityManager?.jointMatrices;
    if (this.isPlaying && this.clips.length > 0 && targetBuffer) {
      const clip = this.clips[this.currentClipIndex];
      if (clip && clip.duration > 0) {
        if (this.isLooping) {
          this.currentTime = (this.currentTime + deltaTimeSeconds * this.playbackSpeed) % clip.duration;
        } else {
          this.currentTime = Math.min(clip.duration, this.currentTime + deltaTimeSeconds * this.playbackSpeed);
        }
        this.evaluateClip(clip, this.currentTime, targetBuffer, jointMatrixOffset);
      }
    }
  }

  private evaluateClip(
    clip: AnimationClip,
    time: number,
    outJointMatrices: Float32Array,
    jointMatrixOffset = 0
  ): void {
    const jointCount = this.joints.length;
    if (jointCount === 0) return;

    this.ensureScratchSize(jointCount);

    // 1. Initialize per-joint T, R, S from rest bind pose
    for (let i = 0; i < jointCount; i++) {
      const j = this.joints[i];
      const t = j.initialTranslation || [0, 0, 0];
      const r = j.initialRotation || [0, 0, 0, 1];
      const s = j.initialScale || [1, 1, 1];

      this.scratchT[i * 3 + 0] = t[0];
      this.scratchT[i * 3 + 1] = t[1];
      this.scratchT[i * 3 + 2] = t[2];

      this.scratchR[i * 4 + 0] = r[0];
      this.scratchR[i * 4 + 1] = r[1];
      this.scratchR[i * 4 + 2] = r[2];
      this.scratchR[i * 4 + 3] = r[3];

      this.scratchS[i * 3 + 0] = s[0];
      this.scratchS[i * 3 + 1] = s[1];
      this.scratchS[i * 3 + 2] = s[2];
    }

    // 2. Sample all animation channels into T / R / S scratch arrays
    for (const channel of clip.channels) {
      const jIdx = channel.targetNode;
      if (jIdx < 0 || jIdx >= jointCount) continue;

      const times = channel.times;
      const values = channel.values;
      if (times.length === 0) continue;

      let idx0 = 0;
      let idx1 = 0;
      let alpha = 0;

      if (times.length === 1 || time <= times[0]) {
        idx0 = 0;
        idx1 = 0;
        alpha = 0;
      } else if (time >= times[times.length - 1]) {
        idx0 = times.length - 1;
        idx1 = times.length - 1;
        alpha = 0;
      } else {
        // Binary search for keyframe bracket
        let lo = 0;
        let hi = times.length - 2;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (time >= times[mid] && time <= times[mid + 1]) {
            idx0 = mid;
            idx1 = mid + 1;
            break;
          } else if (time < times[mid]) {
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }
        const span = times[idx1] - times[idx0];
        alpha = channel.interpolation === 'STEP' || span <= 1e-6 ? 0 : (time - times[idx0]) / span;
      }

      if (channel.path === 'rotation') {
        const b0 = idx0 * 4;
        const b1 = idx1 * 4;
        if (b1 + 3 >= values.length) continue;
        const q0: [number, number, number, number] = [values[b0], values[b0 + 1], values[b0 + 2], values[b0 + 3]];
        const q =
          alpha === 0 || idx0 === idx1
            ? q0
            : this.slerp(q0, [values[b1], values[b1 + 1], values[b1 + 2], values[b1 + 3]], alpha);
        this.scratchR[jIdx * 4 + 0] = q[0];
        this.scratchR[jIdx * 4 + 1] = q[1];
        this.scratchR[jIdx * 4 + 2] = q[2];
        this.scratchR[jIdx * 4 + 3] = q[3];
      } else if (channel.path === 'translation') {
        const b0 = idx0 * 3;
        const b1 = idx1 * 3;
        if (b1 + 2 >= values.length) continue;
        this.scratchT[jIdx * 3 + 0] = values[b0 + 0] + (values[b1 + 0] - values[b0 + 0]) * alpha;
        this.scratchT[jIdx * 3 + 1] = values[b0 + 1] + (values[b1 + 1] - values[b0 + 1]) * alpha;
        this.scratchT[jIdx * 3 + 2] = values[b0 + 2] + (values[b1 + 2] - values[b0 + 2]) * alpha;
      } else if (channel.path === 'scale') {
        const b0 = idx0 * 3;
        const b1 = idx1 * 3;
        if (b1 + 2 >= values.length) continue;
        this.scratchS[jIdx * 3 + 0] = values[b0 + 0] + (values[b1 + 0] - values[b0 + 0]) * alpha;
        this.scratchS[jIdx * 3 + 1] = values[b0 + 1] + (values[b1 + 1] - values[b0 + 1]) * alpha;
        this.scratchS[jIdx * 3 + 2] = values[b0 + 2] + (values[b1 + 2] - values[b0 + 2]) * alpha;
      }
    }

    // 3. Reconstruct local matrices from evaluated T, R, S
    for (let i = 0; i < jointCount; i++) {
      Mat4.fromTranslationRotationScale(
        [this.scratchT[i * 3], this.scratchT[i * 3 + 1], this.scratchT[i * 3 + 2]],
        [this.scratchR[i * 4], this.scratchR[i * 4 + 1], this.scratchR[i * 4 + 2], this.scratchR[i * 4 + 3]],
        [this.scratchS[i * 3], this.scratchS[i * 3 + 1], this.scratchS[i * 3 + 2]],
        this.joints[i].localMatrix
      );
    }

    // 4. Compute hierarchical world matrices (topological order agnostic) & skin matrices
    this.scratchVisited.fill(0);
    for (let i = 0; i < jointCount; i++) {
      const joint = this.joints[i];
      this.computeJointWorld(i);
      Mat4.multiply(joint.worldMatrix, joint.inverseBindMatrix, this.scratchSkinMat);

      const offset = (jointMatrixOffset + i) * 16;
      if (offset + 16 <= outJointMatrices.length) {
        outJointMatrices.set(this.scratchSkinMat, offset);
      }
    }
  }

  private slerp(
    a: [number, number, number, number],
    b: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    let cosHalfTheta = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];

    if (cosHalfTheta < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
      cosHalfTheta = -cosHalfTheta;
    }

    if (Math.abs(cosHalfTheta) >= 1.0) {
      return [a[0], a[1], a[2], a[3]];
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      const rx = a[0] * 0.5 + bx * 0.5;
      const ry = a[1] * 0.5 + by * 0.5;
      const rz = a[2] * 0.5 + bz * 0.5;
      const rw = a[3] * 0.5 + bw * 0.5;
      const len = Math.hypot(rx, ry, rz, rw) || 1;
      return [rx / len, ry / len, rz / len, rw / len];
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    const rx = a[0] * ratioA + bx * ratioB;
    const ry = a[1] * ratioA + by * ratioB;
    const rz = a[2] * ratioA + bz * ratioB;
    const rw = a[3] * ratioA + bw * ratioB;
    const len = Math.hypot(rx, ry, rz, rw) || 1;
    return [rx / len, ry / len, rz / len, rw / len];
  }
}
