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
      this.populateJointMatrices(this.entityManager.jointMatrices, 0, offset, this.joints.length);
    }
    return offset;
  }

  public writeBindPoseTo(outJointMatrices: Float32Array, jointMatrixOffset = 0): void {
    this.ensureScratchSize(this.joints.length);
    this.populateJointMatrices(outJointMatrices, jointMatrixOffset, 0, this.joints.length);
  }

  private populateJointMatrices(
    outJointMatrices: Float32Array,
    jointMatrixOffset: number,
    startJoint: number,
    endJoint: number
  ): void {
    this.scratchVisited.fill(0);
    for (let i = startJoint; i < endJoint; i++) {
      const joint = this.joints[i];
      this.computeJointWorld(i);
      Mat4.multiply(joint.worldMatrix, joint.inverseBindMatrix, this.scratchSkinMat);
      const bufOffset = (jointMatrixOffset + i) * 16;
      if (bufOffset + 16 <= outJointMatrices.length) {
        outJointMatrices.set(this.scratchSkinMat, bufOffset);
      }
    }
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
    // Fast exact-match path (zero string allocation)
    for (let i = 0; i < this.clips.length; i++) {
      if (this.clips[i].name === name) {
        this.playClip(i, loop);
        return true;
      }
    }
    const lowerName = name.toLowerCase();
    for (let i = 0; i < this.clips.length; i++) {
      const cLower = this.clips[i].name.toLowerCase();
      if (cLower === lowerName || cLower.includes(lowerName)) {
        this.playClip(i, loop);
        return true;
      }
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
      for (let i = 0; i < this.clips.length; i++) {
        if (this.clips[i].name === clipNameOrIndex) {
          clip = this.clips[i];
          break;
        }
      }
      if (!clip) {
        const lower = clipNameOrIndex.toLowerCase();
        for (let i = 0; i < this.clips.length; i++) {
          if (this.clips[i].name.toLowerCase().includes(lower)) {
            clip = this.clips[i];
            break;
          }
        }
      }
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

    const scrT = this.scratchT;
    const scrR = this.scratchR;
    const scrS = this.scratchS;

    // 1. Initialize per-joint T, R, S from rest bind pose
    for (let i = 0; i < jointCount; i++) {
      const j = this.joints[i];
      const t = j.initialTranslation;
      const r = j.initialRotation;
      const s = j.initialScale;

      const b3 = i * 3;
      const b4 = i * 4;
      scrT[b3 + 0] = t ? t[0] : 0;
      scrT[b3 + 1] = t ? t[1] : 0;
      scrT[b3 + 2] = t ? t[2] : 0;

      scrR[b4 + 0] = r ? r[0] : 0;
      scrR[b4 + 1] = r ? r[1] : 0;
      scrR[b4 + 2] = r ? r[2] : 0;
      scrR[b4 + 3] = r ? r[3] : 1;

      scrS[b3 + 0] = s ? s[0] : 1;
      scrS[b3 + 1] = s ? s[1] : 1;
      scrS[b3 + 2] = s ? s[2] : 1;
    }

    // 2. Sample all animation channels into T / R / S scratch arrays (zero allocation)
    const channels = clip.channels;
    for (let cIdx = 0; cIdx < channels.length; cIdx++) {
      const channel = channels[cIdx];
      const jIdx = channel.targetNode;
      if (jIdx < 0 || jIdx >= jointCount) continue;

      const times = channel.times;
      const values = channel.values;
      const tLen = times.length;
      if (tLen === 0) continue;

      let idx0 = 0;
      let idx1 = 0;
      let alpha = 0;

      if (tLen === 1 || time <= times[0]) {
        idx0 = 0;
        idx1 = 0;
        alpha = 0;
      } else if (time >= times[tLen - 1]) {
        idx0 = tLen - 1;
        idx1 = tLen - 1;
        alpha = 0;
      } else {
        let lo = 0;
        let hi = tLen - 2;
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
        const dst = jIdx * 4;
        if (alpha === 0 || idx0 === idx1) {
          scrR[dst + 0] = values[b0 + 0];
          scrR[dst + 1] = values[b0 + 1];
          scrR[dst + 2] = values[b0 + 2];
          scrR[dst + 3] = values[b0 + 3];
        } else {
          this.slerpInto(
            values[b0 + 0], values[b0 + 1], values[b0 + 2], values[b0 + 3],
            values[b1 + 0], values[b1 + 1], values[b1 + 2], values[b1 + 3],
            alpha,
            scrR,
            dst
          );
        }
      } else if (channel.path === 'translation') {
        const b0 = idx0 * 3;
        const b1 = idx1 * 3;
        if (b1 + 2 >= values.length) continue;
        const dst = jIdx * 3;
        scrT[dst + 0] = values[b0 + 0] + (values[b1 + 0] - values[b0 + 0]) * alpha;
        scrT[dst + 1] = values[b0 + 1] + (values[b1 + 1] - values[b0 + 1]) * alpha;
        scrT[dst + 2] = values[b0 + 2] + (values[b1 + 2] - values[b0 + 2]) * alpha;
      } else if (channel.path === 'scale') {
        const b0 = idx0 * 3;
        const b1 = idx1 * 3;
        if (b1 + 2 >= values.length) continue;
        const dst = jIdx * 3;
        scrS[dst + 0] = values[b0 + 0] + (values[b1 + 0] - values[b0 + 0]) * alpha;
        scrS[dst + 1] = values[b0 + 1] + (values[b1 + 1] - values[b0 + 1]) * alpha;
        scrS[dst + 2] = values[b0 + 2] + (values[b1 + 2] - values[b0 + 2]) * alpha;
      }
    }

    // 3. Reconstruct local matrices from evaluated T, R, S (zero array allocation)
    for (let i = 0; i < jointCount; i++) {
      const b3 = i * 3;
      const b4 = i * 4;
      Mat4.fromTRSValues(
        scrT[b3 + 0], scrT[b3 + 1], scrT[b3 + 2],
        scrR[b4 + 0], scrR[b4 + 1], scrR[b4 + 2], scrR[b4 + 3],
        scrS[b3 + 0], scrS[b3 + 1], scrS[b3 + 2],
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

  private slerpInto(
    ax: number, ay: number, az: number, aw: number,
    bx: number, by: number, bz: number, bw: number,
    t: number,
    out: Float32Array,
    outOffset: number
  ): void {
    let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;

    if (cosHalfTheta < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
      cosHalfTheta = -cosHalfTheta;
    }

    if (Math.abs(cosHalfTheta) >= 1.0) {
      out[outOffset + 0] = ax;
      out[outOffset + 1] = ay;
      out[outOffset + 2] = az;
      out[outOffset + 3] = aw;
      return;
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      const rx = ax * 0.5 + bx * 0.5;
      const ry = ay * 0.5 + by * 0.5;
      const rz = az * 0.5 + bz * 0.5;
      const rw = aw * 0.5 + bw * 0.5;
      const invLen = 1.0 / (Math.hypot(rx, ry, rz, rw) || 1);
      out[outOffset + 0] = rx * invLen;
      out[outOffset + 1] = ry * invLen;
      out[outOffset + 2] = rz * invLen;
      out[outOffset + 3] = rw * invLen;
      return;
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    const rx = ax * ratioA + bx * ratioB;
    const ry = ay * ratioA + by * ratioB;
    const rz = az * ratioA + bz * ratioB;
    const rw = aw * ratioA + bw * ratioB;
    const invLen = 1.0 / (Math.hypot(rx, ry, rz, rw) || 1);
    out[outOffset + 0] = rx * invLen;
    out[outOffset + 1] = ry * invLen;
    out[outOffset + 2] = rz * invLen;
    out[outOffset + 3] = rw * invLen;
  }
}
