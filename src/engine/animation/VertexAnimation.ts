/**
 * Destroyer Engine - Vertex Animation System
 * Handles:
 * 1. GPU Morph Targets (Blend Shapes) with interpolation & weight control
 * 2. Skeletal Joint Skinning with animation clip evaluation
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

  constructor(entityManager?: FlatEntityManager) {
    this.entityManager = entityManager;
    this.morphWeights[0] = 0.0;
    this.morphWeights[1] = 0.0;
    this.morphWeights[2] = 0.0;
    this.morphWeights[3] = 0.0;
  }

  registerSkeleton(joints: SkeletonJoint[], clip?: AnimationClip): number {
    const offset = this.joints.length;
    this.joints.push(...joints);
    if (clip) {
      this.addClip(clip);
    }
    if (this.entityManager) {
      this.entityManager.totalJointsCount = this.joints.length;

      // Populate initial skinning matrices to prevent zero-matrices
      for (let i = 0; i < joints.length; i++) {
        const joint = joints[i];
        if (joint.parentIndex < 0) {
          joint.worldMatrix.set(joint.localMatrix);
        } else {
          const parent = this.joints[joint.parentIndex];
          if (parent) {
            Mat4.multiply(parent.worldMatrix, joint.localMatrix, joint.worldMatrix);
          }
        }
        const skinMat = new Float32Array(16);
        Mat4.multiply(joint.worldMatrix, joint.inverseBindMatrix, skinMat);
        const bufOffset = (offset + i) * 16;
        if (bufOffset + 16 <= this.entityManager.jointMatrices.length) {
          this.entityManager.jointMatrices.set(skinMat, bufOffset);
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
    // Check if clip already exists by name
    const existingIdx = this.clips.findIndex((c) => c.name === clip.name);
    if (existingIdx >= 0) {
      this.clips[existingIdx] = clip;
      return existingIdx;
    }
    this.clips.push(clip);
    return this.clips.length - 1;
  }

  /**
   * Load and parse a BVH motion capture string and register it as an animation clip
   */
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

  /**
   * Directly evaluate a specific clip at a given timestamp (useful for physics-driven jumps)
   */
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
    if (this.joints.length === 0) return;

    for (const channel of clip.channels) {
      const joint = this.joints[channel.targetNode];
      if (!joint) continue;

      const times = channel.times;
      const values = channel.values;

      if (times.length === 1) {
        const q: [number, number, number, number] = [values[0], values[1], values[2], values[3]];
        const pos = joint.initialTranslation || [joint.localMatrix[12], joint.localMatrix[13], joint.localMatrix[14]];
        Mat4.fromTranslationRotationScale(pos, q, [1, 1, 1], joint.localMatrix);
        continue;
      }

      for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time <= times[i + 1]) {
          const t0 = times[i];
          const t1 = times[i + 1];
          const alpha = (time - t0) / Math.max(0.0001, t1 - t0);

          if (channel.path === 'rotation') {
            const idx0 = i * 4;
            const idx1 = (i + 1) * 4;
            const q0: [number, number, number, number] = [values[idx0], values[idx0 + 1], values[idx0 + 2], values[idx0 + 3]];
            const q1: [number, number, number, number] = [values[idx1], values[idx1 + 1], values[idx1 + 2], values[idx1 + 3]];
            const qInterpolated = this.slerp(q0, q1, alpha);
            const pos = joint.initialTranslation || [joint.localMatrix[12], joint.localMatrix[13], joint.localMatrix[14]];
            Mat4.fromTranslationRotationScale(pos, qInterpolated, [1, 1, 1], joint.localMatrix);
          }
          break;
        }
      }
    }

    // Compute joint hierarchy world matrices
    for (let i = 0; i < this.joints.length; i++) {
      const joint = this.joints[i];
      if (joint.parentIndex < 0) {
        joint.worldMatrix.set(joint.localMatrix);
      } else {
        const parent = this.joints[joint.parentIndex];
        Mat4.multiply(parent.worldMatrix, joint.localMatrix, joint.worldMatrix);
      }

      // Skinning matrix = JointWorldMatrix * InverseBindMatrix
      const skinMat = new Float32Array(16);
      Mat4.multiply(joint.worldMatrix, joint.inverseBindMatrix, skinMat);

      const offset = (jointMatrixOffset + i) * 16;
      if (offset + 16 <= outJointMatrices.length) {
        outJointMatrices.set(skinMat, offset);
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
      return [
        a[0] * 0.5 + bx * 0.5,
        a[1] * 0.5 + by * 0.5,
        a[2] * 0.5 + bz * 0.5,
        a[3] * 0.5 + bw * 0.5,
      ];
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    return [
      a[0] * ratioA + bx * ratioB,
      a[1] * ratioA + by * ratioB,
      a[2] * ratioA + bz * ratioB,
      a[3] * ratioA + bw * ratioB,
    ];
  }
}
