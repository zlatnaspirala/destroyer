/**
 * Destroyer Engine - Retargeted Mixamo Animation Generator
 * Synthesizes Idle, Walk, and Jump skeletal clips for any Mixamo-compatible GLB
 * skeleton (mixamorig:Hips, LeftArm, LeftUpLeg, etc.) by converting character-space
 * anatomical rotations into each bone's exact rest-pose local space.
 */

import { AnimationChannel, AnimationClip, SkeletonJoint } from '../core/Types';
import { Mat4 } from '../math/Mat4';

type Quat = [number, number, number, number]; // [x, y, z, w]

function mulQuat(a: Quat, b: Quat): Quat {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function invQuat(q: Quat): Quat {
  const norm = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] || 1;
  return [-q[0] / norm, -q[1] / norm, -q[2] / norm, q[3] / norm];
}

function normQuat(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function eulerXYZToQuat(rx: number, ry: number, rz: number): Quat {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);

  // Intrinsic XYZ = qx * qy * qz
  const qx: Quat = [sx, 0, 0, cx];
  const qy: Quat = [0, sy, 0, cy];
  const qz: Quat = [0, 0, sz, cz];
  return normQuat(mulQuat(mulQuat(qx, qy), qz));
}

export class MixamoAnimations {
  static isMixamoSkeleton(joints: SkeletonJoint[]): boolean {
    return joints.some((j) => /mixamorig|hips|leftupleg|rightupleg/i.test(j.name));
  }

  static generateStandardClips(joints: SkeletonJoint[]): AnimationClip[] {
    if (joints.length === 0) return [];

    // Find joint index by suffix/case-insensitive name (handles mixamorig:LeftArm, mixamorigLeftArm, LeftArm)
    const findJoint = (pattern: RegExp): number =>
      joints.findIndex((j) => pattern.test(j.name));

    const idx = {
      hips: findJoint(/(^|:)hips$/i),
      spine: findJoint(/(^|:)spine$/i),
      spine1: findJoint(/(^|:)spine1$/i),
      spine2: findJoint(/(^|:)spine2$/i),
      neck: findJoint(/(^|:)neck$/i),
      head: findJoint(/(^|:)head$/i),
      lShoulder: findJoint(/leftshoulder$/i),
      lArm: findJoint(/leftarm$/i),
      lForeArm: findJoint(/leftforearm$/i),
      rShoulder: findJoint(/rightshoulder$/i),
      rArm: findJoint(/rightarm$/i),
      rForeArm: findJoint(/rightforearm$/i),
      lUpLeg: findJoint(/leftupleg$/i),
      lLeg: findJoint(/leftleg$/i),
      lFoot: findJoint(/leftfoot$/i),
      rUpLeg: findJoint(/rightupleg$/i),
      rLeg: findJoint(/rightleg$/i),
      rFoot: findJoint(/rightfoot$/i),
    };

    if (idx.hips < 0 && idx.lUpLeg < 0 && idx.lArm < 0) {
      return [];
    }

    // Compute world bind rotations of all joints (memoized)
    const worldBindRot: Quat[] = new Array(joints.length);
    const computed = new Uint8Array(joints.length);
    const tempWorld = new Array<Float32Array>(joints.length);

    const getBindWorld = (i: number): Float32Array => {
      if (computed[i]) return tempWorld[i];
      computed[i] = 1;
      const j = joints[i];
      const out = Mat4.create();
      if (j.parentIndex >= 0 && j.parentIndex < joints.length) {
        Mat4.multiply(getBindWorld(j.parentIndex), j.localMatrix, out);
      } else {
        out.set(j.localMatrix);
      }
      tempWorld[i] = out;
      worldBindRot[i] = Mat4.decompose(out).rotation;
      return out;
    };
    for (let i = 0; i < joints.length; i++) getBindWorld(i);

    // Converts a character-space delta rotation Q_world_delta into bone j's local rotation
    const toLocalRot = (jointIdx: number, rx: number, ry: number, rz: number): Quat => {
      const qDelta = eulerXYZToQuat(rx, ry, rz);
      const j = joints[jointIdx];
      const qWorldJ = worldBindRot[jointIdx];
      const qWorldP: Quat =
        j.parentIndex >= 0 && j.parentIndex < joints.length
          ? worldBindRot[j.parentIndex]
          : [0, 0, 0, 1];
      return normQuat(mulQuat(mulQuat(invQuat(qWorldP), qDelta), qWorldJ));
    };

    const makeRotChannel = (
      jointIdx: number,
      times: number[],
      eulers: [number, number, number][]
    ): AnimationChannel | null => {
      if (jointIdx < 0) return null;
      const values = new Float32Array(times.length * 4);
      for (let k = 0; k < times.length; k++) {
        const q = toLocalRot(jointIdx, eulers[k][0], eulers[k][1], eulers[k][2]);
        values[k * 4 + 0] = q[0];
        values[k * 4 + 1] = q[1];
        values[k * 4 + 2] = q[2];
        values[k * 4 + 3] = q[3];
      }
      return {
        targetNode: jointIdx,
        path: 'rotation',
        times: new Float32Array(times),
        values,
        interpolation: 'LINEAR',
      };
    };

    // --- 1. IDLE CLIP (Natural standing pose with subtle breathing, 2.4s loop) ---
    const idleTimes = [0, 1.2, 2.4];
    const idleChannels: AnimationChannel[] = [];
    const pushIfValid = (list: AnimationChannel[], ch: AnimationChannel | null) => {
      if (ch) list.push(ch);
    };

    pushIfValid(idleChannels, makeRotChannel(idx.lShoulder, idleTimes, [
      [0, 0, -0.14], [0, 0, -0.12], [0, 0, -0.14],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.rShoulder, idleTimes, [
      [0, 0, 0.14], [0, 0, 0.12], [0, 0, 0.14],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.lArm, idleTimes, [
      [-0.04, 0, -1.25], [-0.06, 0, -1.22], [-0.04, 0, -1.25],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.rArm, idleTimes, [
      [-0.04, 0, 1.25], [-0.06, 0, 1.22], [-0.04, 0, 1.25],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.lForeArm, idleTimes, [
      [0, -0.22, 0], [0, -0.26, 0], [0, -0.22, 0],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.rForeArm, idleTimes, [
      [0, 0.22, 0], [0, 0.26, 0], [0, 0.22, 0],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.spine1, idleTimes, [
      [0.02, 0, 0], [-0.02, 0, 0], [0.02, 0, 0],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.lUpLeg, idleTimes, [
      [0.02, 0, 0.03], [0.02, 0, 0.03], [0.02, 0, 0.03],
    ]));
    pushIfValid(idleChannels, makeRotChannel(idx.rUpLeg, idleTimes, [
      [0.02, 0, -0.03], [0.02, 0, -0.03], [0.02, 0, -0.03],
    ]));

    // --- 2. WALK CLIP (Smooth 8-keyframe natural walk cycle, 0.9s loop) ---
    // Negative rx on UpLeg swings leg forward (+Z); positive rx swings leg back (-Z).
    // Positive rx on Leg bends knee backward; negative rx on Arm swings lowered arm forward (+Z).
    const walkTimes = [0.0, 0.225, 0.45, 0.675, 0.9];
    const walkChannels: AnimationChannel[] = [];

    pushIfValid(walkChannels, makeRotChannel(idx.hips, walkTimes, [
      [0.03, -0.05, 0.02],
      [0.02, 0.0, -0.02],
      [0.03, 0.05, -0.02],
      [0.02, 0.0, 0.02],
      [0.03, -0.05, 0.02],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.spine1, walkTimes, [
      [0.03, 0.06, 0],
      [0.02, 0.0, 0],
      [0.03, -0.06, 0],
      [0.02, 0.0, 0],
      [0.03, 0.06, 0],
    ]));

    // Left & Right Legs
    pushIfValid(walkChannels, makeRotChannel(idx.lUpLeg, walkTimes, [
      [-0.42, 0, 0.02],  // Left leg forward
      [0.04, 0, 0.02],   // Passing
      [0.36, 0, 0.02],   // Left leg back
      [-0.25, 0, 0.02],  // Swing forward (knee lifted)
      [-0.42, 0, 0.02],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.lLeg, walkTimes, [
      [0.12, 0, 0],
      [0.10, 0, 0],
      [0.25, 0, 0],
      [0.82, 0, 0],      // High knee bend during forward swing
      [0.12, 0, 0],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.lFoot, walkTimes, [
      [-0.12, 0, 0],
      [0.0, 0, 0],
      [0.22, 0, 0],
      [-0.08, 0, 0],
      [-0.12, 0, 0],
    ]));

    pushIfValid(walkChannels, makeRotChannel(idx.rUpLeg, walkTimes, [
      [0.36, 0, -0.02],  // Right leg back
      [-0.25, 0, -0.02], // Swing forward
      [-0.42, 0, -0.02], // Right leg forward
      [0.04, 0, -0.02],  // Passing
      [0.36, 0, -0.02],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.rLeg, walkTimes, [
      [0.25, 0, 0],
      [0.82, 0, 0],
      [0.12, 0, 0],
      [0.10, 0, 0],
      [0.25, 0, 0],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.rFoot, walkTimes, [
      [0.22, 0, 0],
      [-0.08, 0, 0],
      [-0.12, 0, 0],
      [0.0, 0, 0],
      [0.22, 0, 0],
    ]));

    // Arms lowered and counter-swinging
    pushIfValid(walkChannels, makeRotChannel(idx.lShoulder, walkTimes, [
      [0, 0, -0.14], [0, 0, -0.14], [0, 0, -0.14], [0, 0, -0.14], [0, 0, -0.14],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.rShoulder, walkTimes, [
      [0, 0, 0.14], [0, 0, 0.14], [0, 0, 0.14], [0, 0, 0.14], [0, 0, 0.14],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.lArm, walkTimes, [
      [0.35, 0, -1.24],  // Left arm back when left leg forward
      [0.0, 0, -1.26],
      [-0.38, 0, -1.24], // Left arm forward
      [0.0, 0, -1.26],
      [0.35, 0, -1.24],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.rArm, walkTimes, [
      [-0.38, 0, 1.24],  // Right arm forward when left leg forward
      [0.0, 0, 1.26],
      [0.35, 0, 1.24],   // Right arm back
      [0.0, 0, 1.26],
      [-0.38, 0, 1.24],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.lForeArm, walkTimes, [
      [0, -0.25, 0], [0, -0.35, 0], [0, -0.55, 0], [0, -0.35, 0], [0, -0.25, 0],
    ]));
    pushIfValid(walkChannels, makeRotChannel(idx.rForeArm, walkTimes, [
      [0, 0.55, 0], [0, 0.35, 0], [0, 0.25, 0], [0, 0.35, 0], [0, 0.55, 0],
    ]));

    // --- 3. JUMP CLIP (Dynamic launch & midair tuck, 0.85s) ---
    const jumpTimes = [0.0, 0.25, 0.55, 0.85];
    const jumpChannels: AnimationChannel[] = [];
    pushIfValid(jumpChannels, makeRotChannel(idx.lShoulder, jumpTimes, [
      [0, 0, -0.1], [0, 0, -0.05], [0, 0, -0.08], [0, 0, -0.14],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.rShoulder, jumpTimes, [
      [0, 0, 0.1], [0, 0, 0.05], [0, 0, 0.08], [0, 0, 0.14],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.lArm, jumpTimes, [
      [-0.4, 0, -1.1], [-0.9, 0, -0.75], [-0.6, 0, -0.95], [-0.1, 0, -1.22],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.rArm, jumpTimes, [
      [-0.4, 0, 1.1], [-0.9, 0, 0.75], [-0.6, 0, 0.95], [-0.1, 0, 1.22],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.lForeArm, jumpTimes, [
      [0, -0.4, 0], [0, -0.7, 0], [0, -0.5, 0], [0, -0.25, 0],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.rForeArm, jumpTimes, [
      [0, 0.4, 0], [0, 0.7, 0], [0, 0.5, 0], [0, 0.25, 0],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.lUpLeg, jumpTimes, [
      [-0.35, 0, 0.05], [-0.72, 0, 0.08], [-0.55, 0, 0.06], [-0.15, 0, 0.03],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.lLeg, jumpTimes, [
      [0.45, 0, 0], [1.05, 0, 0], [0.85, 0, 0], [0.25, 0, 0],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.rUpLeg, jumpTimes, [
      [-0.25, 0, -0.05], [-0.55, 0, -0.08], [-0.45, 0, -0.06], [-0.15, 0, -0.03],
    ]));
    pushIfValid(jumpChannels, makeRotChannel(idx.rLeg, jumpTimes, [
      [0.35, 0, 0], [0.85, 0, 0], [0.70, 0, 0], [0.25, 0, 0],
    ]));

    // --- 4. PUNCH CLIP (Quick right cross jab with torso twist, 0.42s) ---
    const punchTimes = [0.0, 0.08, 0.17, 0.28, 0.42];
    const punchChannels: AnimationChannel[] = [];
    pushIfValid(punchChannels, makeRotChannel(idx.hips, punchTimes, [
      [0.02, 0.0, 0.0],
      [0.06, -0.22, 0.0],
      [0.10, 0.28, -0.04],
      [0.06, 0.16, -0.02],
      [0.02, 0.0, 0.0],
    ]));
    pushIfValid(punchChannels, makeRotChannel(idx.spine1, punchTimes, [
      [0.02, 0.0, 0.0],
      [0.05, -0.28, 0.0],
      [0.14, 0.45, -0.05],
      [0.08, 0.24, -0.02],
      [0.02, 0.0, 0.0],
    ]));
    pushIfValid(punchChannels, makeRotChannel(idx.lShoulder, punchTimes, [
      [0, 0, -0.14], [0, 0, -0.12], [0, 0, -0.18], [0, 0, -0.15], [0, 0, -0.14],
    ]));
    pushIfValid(punchChannels, makeRotChannel(idx.rShoulder, punchTimes, [
      [0, 0, 0.14], [0, -0.15, 0.18], [0, 0.28, 0.05], [0, 0.14, 0.10], [0, 0, 0.14],
    ]));
    // Left arm pulls into defensive guard near chest
    pushIfValid(punchChannels, makeRotChannel(idx.lArm, punchTimes, [
      [-0.1, 0, -1.2], [-0.55, 0.2, -0.95], [-0.35, 0.15, -1.05], [-0.25, 0.1, -1.12], [-0.08, 0, -1.22],
    ]));
    pushIfValid(punchChannels, makeRotChannel(idx.lForeArm, punchTimes, [
      [0, -0.35, 0], [0, -1.35, 0], [0, -1.25, 0], [0, -0.85, 0], [0, -0.28, 0],
    ]));
    // Right arm winds back then snaps forward (+Z) at 0.17s
    pushIfValid(punchChannels, makeRotChannel(idx.rArm, punchTimes, [
      [-0.15, 0, 1.2], [0.42, -0.25, 0.95], [-1.42, 0.22, 0.35], [-1.15, 0.15, 0.55], [-0.08, 0, 1.22],
    ]));
    pushIfValid(punchChannels, makeRotChannel(idx.rForeArm, punchTimes, [
      [0, 0.35, 0], [0, 1.45, 0], [0, 0.08, 0], [0, 0.35, 0], [0, 0.28, 0],
    ]));
    // Stance brace
    pushIfValid(punchChannels, makeRotChannel(idx.lUpLeg, punchTimes, [
      [0.02, 0, 0.03], [-0.14, 0, 0.05], [-0.24, 0, 0.06], [-0.12, 0, 0.04], [0.02, 0, 0.03],
    ]));
    pushIfValid(punchChannels, makeRotChannel(idx.rUpLeg, punchTimes, [
      [0.02, 0, -0.03], [0.16, 0, -0.05], [0.22, 0, -0.06], [0.10, 0, -0.04], [0.02, 0, -0.03],
    ]));

    // --- 5. PHONE CALL CLIP (Standing/anxious posture holding mobile phone to right ear, 1.6s loop) ---
    const phoneTimes = [0.0, 0.4, 0.8, 1.2, 1.6];
    const phoneChannels: AnimationChannel[] = [];
    pushIfValid(phoneChannels, makeRotChannel(idx.hips, phoneTimes, [
      [0.02, 0.0, 0.0], [0.02, 0.08, 0.0], [0.02, 0.0, 0.0], [0.02, -0.08, 0.0], [0.02, 0.0, 0.0],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.spine1, phoneTimes, [
      [0.04, 0.02, 0.0], [0.06, 0.12, 0.02], [0.04, 0.0, 0.0], [0.06, -0.10, -0.02], [0.04, 0.02, 0.0],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.head, phoneTimes, [
      [0.05, -0.10, -0.06], [0.02, 0.14, -0.08], [0.04, -0.04, -0.05], [0.02, -0.16, -0.07], [0.05, -0.10, -0.06],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.lShoulder, phoneTimes, [
      [0, 0, -0.14], [0, 0, -0.12], [0, 0, -0.14], [0, 0, -0.12], [0, 0, -0.14],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.rShoulder, phoneTimes, [
      [0, 0.12, 0.06], [0, 0.14, 0.05], [0, 0.12, 0.06], [0, 0.10, 0.06], [0, 0.12, 0.06],
    ]));
    // Left arm lowered with slight agitated gesture
    pushIfValid(phoneChannels, makeRotChannel(idx.lArm, phoneTimes, [
      [-0.18, 0, -1.18], [-0.36, 0.10, -1.08], [-0.22, 0, -1.16], [-0.34, 0.08, -1.10], [-0.18, 0, -1.18],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.lForeArm, phoneTimes, [
      [0, -0.45, 0], [0, -0.78, 0], [0, -0.52, 0], [0, -0.74, 0], [0, -0.45, 0],
    ]));
    // Right arm raised + forearm flexed sharply so hand holds phone right next to right ear
    pushIfValid(phoneChannels, makeRotChannel(idx.rArm, phoneTimes, [
      [-1.08, 0.22, 0.42], [-1.12, 0.24, 0.40], [-1.06, 0.22, 0.42], [-1.10, 0.20, 0.44], [-1.08, 0.22, 0.42],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.rForeArm, phoneTimes, [
      [0, 1.95, 0], [0, 1.98, 0], [0, 1.94, 0], [0, 1.96, 0], [0, 1.95, 0],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.lUpLeg, phoneTimes, [
      [0.02, 0, 0.04], [0.02, 0, 0.04], [0.02, 0, 0.04], [0.02, 0, 0.04], [0.02, 0, 0.04],
    ]));
    pushIfValid(phoneChannels, makeRotChannel(idx.rUpLeg, phoneTimes, [
      [0.02, 0, -0.04], [0.02, 0, -0.04], [0.02, 0, -0.04], [0.02, 0, -0.04], [0.02, 0, -0.04],
    ]));

    return [
      { name: 'Mixamo_Walk_Cycle', duration: 0.9, channels: walkChannels },
      { name: 'Mixamo_Idle_Cycle', duration: 2.4, channels: idleChannels },
      { name: 'Mixamo_Jump_Cycle', duration: 0.85, channels: jumpChannels },
      { name: 'Mixamo_Punch_Cycle', duration: 0.42, channels: punchChannels },
      { name: 'Mixamo_PhoneCall_Cycle', duration: 1.6, channels: phoneChannels },
    ];
  }

  /**
   * Generates Seated Desk Idle + Seated Getting-Punched recoil clips for a Mixamo character rig.
   */
  static generateSeatedClips(joints: SkeletonJoint[]): AnimationClip[] {
    if (joints.length === 0) return [];
    const findJoint = (pattern: RegExp): number =>
      joints.findIndex((j) => pattern.test(j.name));

    const idx = {
      hips: findJoint(/(^|:)hips$/i),
      spine1: findJoint(/(^|:)spine1$/i),
      head: findJoint(/(^|:)head$/i),
      lShoulder: findJoint(/leftshoulder$/i),
      lArm: findJoint(/leftarm$/i),
      lForeArm: findJoint(/leftforearm$/i),
      rShoulder: findJoint(/rightshoulder$/i),
      rArm: findJoint(/rightarm$/i),
      rForeArm: findJoint(/rightforearm$/i),
      lUpLeg: findJoint(/leftupleg$/i),
      lLeg: findJoint(/leftleg$/i),
      rUpLeg: findJoint(/rightupleg$/i),
      rLeg: findJoint(/rightleg$/i),
    };

    const worldBindRot: Quat[] = new Array(joints.length);
    const computed = new Uint8Array(joints.length);
    const tempWorld = new Array<Float32Array>(joints.length);
    const getBindWorld = (i: number): Float32Array => {
      if (computed[i]) return tempWorld[i];
      computed[i] = 1;
      const j = joints[i];
      const out = Mat4.create();
      if (j.parentIndex >= 0 && j.parentIndex < joints.length) {
        Mat4.multiply(getBindWorld(j.parentIndex), j.localMatrix, out);
      } else {
        out.set(j.localMatrix);
      }
      tempWorld[i] = out;
      worldBindRot[i] = Mat4.decompose(out).rotation;
      return out;
    };
    for (let i = 0; i < joints.length; i++) getBindWorld(i);

    const toLocalRot = (jointIdx: number, rx: number, ry: number, rz: number): Quat => {
      const qDelta = eulerXYZToQuat(rx, ry, rz);
      const j = joints[jointIdx];
      const qWorldJ = worldBindRot[jointIdx];
      const qWorldP: Quat =
        j.parentIndex >= 0 && j.parentIndex < joints.length ? worldBindRot[j.parentIndex] : [0, 0, 0, 1];
      return normQuat(mulQuat(mulQuat(invQuat(qWorldP), qDelta), qWorldJ));
    };

    const makeRotChannel = (
      jointIdx: number,
      times: number[],
      eulers: [number, number, number][]
    ): AnimationChannel | null => {
      if (jointIdx < 0) return null;
      const values = new Float32Array(times.length * 4);
      for (let k = 0; k < times.length; k++) {
        const q = toLocalRot(jointIdx, eulers[k][0], eulers[k][1], eulers[k][2]);
        values[k * 4 + 0] = q[0];
        values[k * 4 + 1] = q[1];
        values[k * 4 + 2] = q[2];
        values[k * 4 + 3] = q[3];
      }
      return {
        targetNode: jointIdx,
        path: 'rotation',
        times: new Float32Array(times),
        values,
        interpolation: 'LINEAR',
      };
    };

    const push = (list: AnimationChannel[], ch: AnimationChannel | null) => {
      if (ch) list.push(ch);
    };

    // 1. Seated Desk Idle (2.8s loop)
    const sitTimes = [0, 1.4, 2.8];
    const sitChannels: AnimationChannel[] = [];
    push(sitChannels, makeRotChannel(idx.lUpLeg, sitTimes, [[-1.35, 0, 0.06], [-1.35, 0, 0.06], [-1.35, 0, 0.06]]));
    push(sitChannels, makeRotChannel(idx.rUpLeg, sitTimes, [[-1.35, 0, -0.06], [-1.35, 0, -0.06], [-1.35, 0, -0.06]]));
    push(sitChannels, makeRotChannel(idx.lLeg, sitTimes, [[1.38, 0, 0], [1.38, 0, 0], [1.38, 0, 0]]));
    push(sitChannels, makeRotChannel(idx.rLeg, sitTimes, [[1.38, 0, 0], [1.38, 0, 0], [1.38, 0, 0]]));
    push(sitChannels, makeRotChannel(idx.spine1, sitTimes, [[0.04, 0, 0], [0.08, 0.03, 0], [0.04, 0, 0]]));
    push(sitChannels, makeRotChannel(idx.head, sitTimes, [[0.04, -0.06, 0], [0.02, 0.06, 0], [0.04, -0.06, 0]]));
    push(sitChannels, makeRotChannel(idx.lShoulder, sitTimes, [[0, 0, -0.14], [0, 0, -0.12], [0, 0, -0.14]]));
    push(sitChannels, makeRotChannel(idx.rShoulder, sitTimes, [[0, 0, 0.14], [0, 0, 0.12], [0, 0, 0.14]]));
    push(sitChannels, makeRotChannel(idx.lArm, sitTimes, [[-0.25, 0.15, -1.18], [-0.28, 0.15, -1.15], [-0.25, 0.15, -1.18]]));
    push(sitChannels, makeRotChannel(idx.rArm, sitTimes, [[-0.25, -0.15, 1.18], [-0.28, -0.15, 1.15], [-0.25, -0.15, 1.18]]));
    push(sitChannels, makeRotChannel(idx.lForeArm, sitTimes, [[0, -0.85, 0], [0, -0.88, 0], [0, -0.85, 0]]));
    push(sitChannels, makeRotChannel(idx.rForeArm, sitTimes, [[0, 0.85, 0], [0, 0.88, 0], [0, 0.85, 0]]));

    // 2. Seated Getting Punched Recoil (0.95s)
    const hitTimes = [0, 0.12, 0.34, 0.65, 0.95];
    const hitChannels: AnimationChannel[] = [];
    push(hitChannels, makeRotChannel(idx.lUpLeg, hitTimes, [
      [-1.35, 0, 0.06], [-1.10, 0, 0.14], [-1.15, 0, 0.12], [-1.28, 0, 0.08], [-1.35, 0, 0.06],
    ]));
    push(hitChannels, makeRotChannel(idx.rUpLeg, hitTimes, [
      [-1.35, 0, -0.06], [-1.08, 0, -0.14], [-1.14, 0, -0.12], [-1.28, 0, -0.08], [-1.35, 0, -0.06],
    ]));
    push(hitChannels, makeRotChannel(idx.lLeg, hitTimes, [[1.38, 0, 0], [1.15, 0, 0], [1.22, 0, 0], [1.32, 0, 0], [1.38, 0, 0]]));
    push(hitChannels, makeRotChannel(idx.rLeg, hitTimes, [[1.38, 0, 0], [1.15, 0, 0], [1.22, 0, 0], [1.32, 0, 0], [1.38, 0, 0]]));
    push(hitChannels, makeRotChannel(idx.hips, hitTimes, [
      [0, 0, 0], [-0.22, -0.12, 0.06], [-0.30, -0.18, 0.08], [-0.10, -0.06, 0.02], [0, 0, 0],
    ]));
    push(hitChannels, makeRotChannel(idx.spine1, hitTimes, [
      [0.04, 0, 0], [-0.52, -0.24, 0.10], [-0.62, -0.28, 0.12], [-0.18, -0.10, 0.04], [0.04, 0, 0],
    ]));
    push(hitChannels, makeRotChannel(idx.head, hitTimes, [
      [0.04, 0, 0], [-0.55, -0.35, 0.15], [-0.45, -0.25, 0.10], [-0.12, -0.08, 0], [0.04, 0, 0],
    ]));
    push(hitChannels, makeRotChannel(idx.lArm, hitTimes, [
      [-0.25, 0.15, -1.18], [-1.15, 0.45, -0.65], [-0.95, 0.35, -0.78], [-0.50, 0.22, -1.05], [-0.25, 0.15, -1.18],
    ]));
    push(hitChannels, makeRotChannel(idx.rArm, hitTimes, [
      [-0.25, -0.15, 1.18], [-1.10, -0.45, 0.65], [-0.92, -0.35, 0.78], [-0.48, -0.22, 1.05], [-0.25, -0.15, 1.18],
    ]));
    push(hitChannels, makeRotChannel(idx.lForeArm, hitTimes, [
      [0, -0.85, 0], [0, -1.45, 0], [0, -1.35, 0], [0, -1.05, 0], [0, -0.85, 0],
    ]));
    push(hitChannels, makeRotChannel(idx.rForeArm, hitTimes, [
      [0, 0.85, 0], [0, 1.45, 0], [0, 1.35, 0], [0, 1.05, 0], [0, 0.85, 0],
    ]));

    return [
      { name: 'Mixamo_Sitting_Idle', duration: 2.8, channels: sitChannels },
      { name: 'Mixamo_Sitting_Hit', duration: 0.95, channels: hitChannels },
    ];
  }
}
