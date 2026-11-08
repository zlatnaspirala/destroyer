/**
 * Destroyer Engine - Transform Math Utilities (Euler, Quaternion, Vector)
 */

export function eulerDegToQuat(degX: number, degY: number, degZ: number): [number, number, number, number] {
  const radX = ((degX % 360) * Math.PI) / 180 * 0.5;
  const radY = ((degY % 360) * Math.PI) / 180 * 0.5;
  const radZ = ((degZ % 360) * Math.PI) / 180 * 0.5;

  const c1 = Math.cos(radX);
  const c2 = Math.cos(radY);
  const c3 = Math.cos(radZ);
  const s1 = Math.sin(radX);
  const s2 = Math.sin(radY);
  const s3 = Math.sin(radZ);

  // XYZ rotation order
  const x = s1 * c2 * c3 + c1 * s2 * s3;
  const y = c1 * s2 * c3 - s1 * c2 * s3;
  const z = c1 * c2 * s3 + s1 * s2 * c3;
  const w = c1 * c2 * c3 - s1 * s2 * s3;

  return [x, y, z, w];
}

export function quatToEulerDeg(qx: number, qy: number, qz: number, qw: number): [number, number, number] {
  // Normalize quat first
  const len = Math.hypot(qx, qy, qz, qw) || 1.0;
  const x = qx / len;
  const y = qy / len;
  const z = qz / len;
  const w = qw / len;

  // XYZ order decomposition
  const sinPitch = 2 * (w * y - z * x);
  let pitch: number;
  let roll: number;
  let yaw: number;

  if (Math.abs(sinPitch) >= 0.99999) {
    pitch = (Math.sign(sinPitch) * Math.PI) / 2;
    roll = 0;
    yaw = Math.atan2(2 * (x * y + w * z), w * w - x * x + y * y - z * z);
  } else {
    pitch = Math.asin(Math.max(-1, Math.min(1, sinPitch)));
    roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  }

  const toDeg = (rad: number) => {
    let deg = (rad * 180) / Math.PI;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    return Number(deg.toFixed(1));
  };

  return [toDeg(roll), toDeg(pitch), toDeg(yaw)];
}
