/**
 * Destroyer Engine - Ultimate Flat PBR Render Pipeline WGSL
 * Features:
 * - Real-Time Directional Shadow Mapping (9-Tap PCF Filtering)
 * - Hardware 4x MSAA Anti-Aliasing with Retina DPR scaling
 * - Multi-part high-detail PBR Shading (Metals, Visor Glow, Titanium Floor)
 * - Calibrated Cinematic Directional Lighting + Hemispherical Sky Ambient
 * - Dual Vertex Animation: Skeletal Skinning + GPU Morph Targets
 * - ACES Filmic Tone Mapping Curve
 */

export const RENDER_PIPELINE_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>,
  cullingEnabled: u32,
  totalEntities: u32,
  pad0: u32,
  pad1: u32,
};

struct EntityData {
  worldMatrix: mat4x4<f32>,
  sphereCenter: vec4<f32>,
  meshId: u32,
  materialId: u32,
  flags: u32,
  animOffset: u32,
};

struct MaterialData {
  baseColor: vec4<f32>,
  emissiveColor: vec4<f32>,
  roughness: f32,
  metallic: f32,
  ao: f32,
  alphaCutoff: f32,
  flags: u32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

struct EngineParams {
  time: f32,
  debugMode: u32,
  waveFactor: f32,
  morphWeight0: f32,
  morphWeight1: f32,
  morphWeight2: f32,
  bloomEnabled: f32,
  ssrEnabled: f32,
  lightDir: vec4<f32>,    // w component is volumetricEnabled
  lightColor: vec4<f32>,  // a component is lightIntensity
  ambientColor: vec4<f32>,// a component is ambientIntensity
  exposure: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> engine: EngineParams;
@group(0) @binding(2) var<storage, read> entities: array<EntityData>;
@group(0) @binding(3) var<storage, read> materials: array<MaterialData>;
@group(0) @binding(4) var<storage, read> visibleIndices: array<u32>;
@group(0) @binding(5) var<storage, read> jointMatrices: array<mat4x4<f32>>;
@group(0) @binding(6) var t_diffuse: texture_2d<f32>;
@group(0) @binding(7) var s_diffuse: sampler;
@group(0) @binding(8) var shadowMap: texture_depth_2d;
@group(0) @binding(9) var shadowSampler: sampler_comparison;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) joints: vec4<u32>,
  @location(4) weights: vec4<f32>,
  @location(5) morphPos0: vec3<f32>,
  @location(6) morphPos1: vec3<f32>,
  @builtin(instance_index) instanceIndex: u32,
};

struct VertexOutput {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) @interpolate(flat) materialId: u32,
  @location(4) @interpolate(flat) entityIndex: u32,
  @location(5) skinWeightDebug: vec3<f32>,
  @location(6) @interpolate(flat) primaryJoint: u32,
  @location(7) localPos: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  let visibleOffset = in.instanceIndex;
  var entityIdx = 0u;
  if (visibleOffset < arrayLength(&visibleIndices)) {
    entityIdx = visibleIndices[visibleOffset];
  }
  let entity = entities[entityIdx];
  out.materialId = entity.materialId;
  out.entityIndex = entityIdx;
  out.uv = in.uv;
  out.primaryJoint = in.joints.x;
  out.localPos = in.position;

  var localPos = in.position;
  var localNormal = in.normal;

  if (engine.morphWeight0 > 0.001) {
    localPos += in.morphPos0 * engine.morphWeight0;
  }
  if (engine.morphWeight1 > 0.001) {
    localPos += in.morphPos1 * engine.morphWeight1;
  }

  if (engine.waveFactor > 0.001) {
    let wave1 = sin(localPos.x * 2.5 + engine.time * 3.0) * cos(localPos.z * 2.5 + engine.time * 2.5);
    let wave2 = sin((localPos.x + localPos.z) * 4.0 + engine.time * 4.0) * 0.35;
    localPos.y += (wave1 + wave2) * engine.waveFactor * 0.4;
  }

  let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
  var modelPos = localPos;
  var modelNormal = localNormal;
  out.skinWeightDebug = in.weights.xyz;

  if (totalWeight > 0.001) {
    let jointOffset = entity.animOffset;
    let m0 = jointMatrices[jointOffset + in.joints.x];
    let m1 = jointMatrices[jointOffset + in.joints.y];
    let m2 = jointMatrices[jointOffset + in.joints.z];
    let m3 = jointMatrices[jointOffset + in.joints.w];

    let skinMat = m0 * in.weights.x +
                  m1 * in.weights.y +
                  m2 * in.weights.z +
                  m3 * in.weights.w;

    modelPos = (skinMat * vec4<f32>(localPos, 1.0)).xyz;
    modelNormal = normalize((skinMat * vec4<f32>(localNormal, 0.0)).xyz);
  }

  let worldPos4 = entity.worldMatrix * vec4<f32>(modelPos, 1.0);
  out.worldPos = worldPos4.xyz;

  let normalMat = mat3x3<f32>(
    entity.worldMatrix[0].xyz,
    entity.worldMatrix[1].xyz,
    entity.worldMatrix[2].xyz
  );
  out.worldNormal = normalize(normalMat * modelNormal);
  out.clipPos = camera.viewProj * worldPos4;

  return out;
}

const PI: f32 = 3.14159265359;

fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let denom = (NdotH2 * (a2 - 1.0) + 1.0);
  return a2 / (PI * denom * denom + 0.00001);
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k + 0.00001);
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2 = geometrySchlickGGX(NdotV, roughness);
  let ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn safeNormalize(v: vec3<f32>) -> vec3<f32> {
  let len = length(v);
  if (len < 0.0001) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }
  return v / len;
}

fn calculateShadow(worldPos: vec3<f32>, normal: vec3<f32>) -> f32 {
  let lightClip = camera.lightViewProj * vec4<f32>(worldPos, 1.0);
  let w = select(lightClip.w, 1.0, abs(lightClip.w) < 0.0001);
  let projCoords = lightClip.xyz / w;
  let shadowUV = vec2<f32>(projCoords.x * 0.5 + 0.5, -projCoords.y * 0.5 + 0.5);
  let currentDepth = projCoords.z;

  let inBounds = shadowUV.x >= 0.002 && shadowUV.x <= 0.998 &&
                 shadowUV.y >= 0.002 && shadowUV.y <= 0.998 &&
                 currentDepth > 0.0 && currentDepth < 1.0 &&
                 abs(lightClip.w) >= 0.0001;

  if (!inBounds) {
    return 1.0;
  }

  let cosTheta = max(dot(normal, -safeNormalize(engine.lightDir.xyz)), 0.0);
  let bias = max(0.0035 * (1.0 - cosTheta), 0.001);
  var shadow = 0.0;
  let texelSize = vec2<f32>(1.0 / 1024.0, 1.0 / 1024.0);
  let clampedUV = clamp(shadowUV, vec2<f32>(0.001), vec2<f32>(0.999));
  let sampleDepth = clamp(currentDepth - bias, 0.0, 1.0);

  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
      shadow += textureSampleCompareLevel(shadowMap, shadowSampler, clampedUV + offset, sampleDepth);
    }
  }
  return shadow / 9.0;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let mat = materials[in.materialId];

  // Debug visualizer modes
  if (engine.debugMode == 1u) {
    return vec4<f32>(in.worldNormal * 0.5 + 0.5, 1.0);
  }
  if (engine.debugMode == 2u) {
    return vec4<f32>(fract(in.uv.x), fract(in.uv.y), 0.5, 1.0);
  }
  if (engine.debugMode == 3u) {
    return vec4<f32>(in.skinWeightDebug, 1.0);
  }
  if (engine.debugMode == 4u) {
    let hash = sin(f32(in.entityIndex) * 12.9898 + 78.233) * 43758.5453;
    let r = fract(hash);
    let g = fract(hash * 1.345);
    let b = fract(hash * 2.789);
    return vec4<f32>(r * 0.7 + 0.3, g * 0.7 + 0.3, b * 0.7 + 0.3, 1.0);
  }
  if (engine.debugMode == 5u) {
    return vec4<f32>(vec3<f32>(mat.roughness), 1.0);
  }

  let N = safeNormalize(in.worldNormal);
  let V = safeNormalize(camera.camPos.xyz - in.worldPos);
  let L = safeNormalize(-engine.lightDir.xyz);
  let H = safeNormalize(V + L);
  let NdotL = max(dot(N, L), 0.0);

  // Dynamic Multi-part PBR Shading with diffuse texture sampling
  let texColor = textureSample(t_diffuse, s_diffuse, in.uv);
  var albedo = mat.baseColor.rgb * texColor.rgb;
  var roughness = clamp(mat.roughness, 0.08, 1.0);
  var metallic = clamp(mat.metallic, 0.0, 1.0);
  var emissive = mat.emissiveColor.rgb * clamp(mat.emissiveColor.a, 0.0, 4.0);

  let isFloor = in.worldPos.y < 0.25 && abs(N.y) > 0.65;

  if (isFloor) {
    // 1. High-Tech Hexagonal & Modular Grid Arena Floor
    let floorCoord = in.worldPos.xz * 0.4;
    let distToCam = length(camera.camPos.xyz - in.worldPos);
    let fade = clamp(1.0 - distToCam / 90.0, 0.0, 1.0);

    // Subtle panel tiles
    let tileF = fract(floorCoord);
    let tileEdge = min(min(tileF.x, 1.0 - tileF.x), min(tileF.y, 1.0 - tileF.y));
    let isGroove = smoothstep(0.06, 0.01, tileEdge) * fade;

    // Dark titanium floor with subtle tone differences
    let tileId = floor(floorCoord);
    let tileHash = fract(sin(tileId.x * 37.1 + tileId.y * 53.7) * 43758.5453);
    let tileTint = mix(vec3<f32>(0.11, 0.13, 0.17), vec3<f32>(0.16, 0.18, 0.23), tileHash * 0.4);

    albedo = mix(tileTint, vec3<f32>(0.04, 0.05, 0.07), isGroove);
    roughness = mix(0.24, 0.55, isGroove);
    metallic = 0.85;

    // Cybernetic tactical neon line grid (accent every 4 units)
    let majorCoord = in.worldPos.xz * 0.1;
    let majorF = abs(fract(majorCoord - 0.5) - 0.5);
    let majorLine = min(majorF.x, majorF.y);
    let majorNeon = smoothstep(0.035, 0.008, majorLine) * fade;
    emissive += vec3<f32>(0.06, 0.28, 0.55) * majorNeon * 1.8;
  } else if (in.skinWeightDebug.x > 0.01) {
    // 2. Skinned Combat Mech Custom High-Detail PBR Finish
    let j = in.primaryJoint;
    if (j == 0u) {
      // Pelvis & Legs: Structural tungsten steel & carbon hydraulics
      albedo = vec3<f32>(0.14, 0.15, 0.18);
      metallic = 0.9;
      roughness = 0.32;
    } else if (j == 1u) {
      // Cockpit & Torso armor: Primary colored plating with panel edge wear
      albedo = mat.baseColor.rgb;
      metallic = 0.78;
      roughness = 0.28;

      // Illuminated cyber visor
      if (in.localPos.y > 1.58 && in.localPos.y < 1.78 && in.localPos.z > 0.72) {
        albedo = vec3<f32>(0.05, 0.2, 0.3);
        emissive = vec3<f32>(0.1, 0.92, 1.0) * 3.2; // Glowing cyber visor
      }
      // Rear exhaust thrusters
      if (in.localPos.y > 1.4 && in.localPos.z < -0.65) {
        albedo = vec3<f32>(0.05, 0.05, 0.08);
        emissive = vec3<f32>(0.15, 0.7, 1.0) * 2.8; // Blue ion thrusters
      }
    } else if (j == 2u) {
      // Left Heavy Vulcan: Blackened carbon alloy
      albedo = vec3<f32>(0.12, 0.13, 0.15);
      metallic = 0.92;
      roughness = 0.25;
      if (in.localPos.z > 1.2) {
        emissive = vec3<f32>(0.9, 0.4, 0.05) * 1.6; // Muzzle heat
      }
    } else if (j == 3u) {
      // Right Railgun: Dark titanium chassis with cyan plasma rails
      albedo = vec3<f32>(0.16, 0.18, 0.22);
      metallic = 0.95;
      roughness = 0.22;
      if (in.localPos.z > 1.1) {
        emissive = vec3<f32>(0.05, 0.85, 1.0) * 2.4; // Plasma particle rail
      }
    }
  }

  var F0 = vec3<f32>(0.04);
  F0 = mix(F0, albedo, metallic);

  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * NdotL + 0.0001;
  let specular = numerator / denominator;

  let kS = F;
  var kD = vec3<f32>(1.0) - kS;
  kD *= (1.0 - metallic);

  // Directional Light with soft PCF shadow
  let shadow = calculateShadow(in.worldPos, N);
  let shadowFactor = mix(0.15, 1.0, shadow); // Ambient bounce inside shadow, avoiding flat blackness

  // Calibrated Direct Sunlight Radiance with Cast Shadows
  let lightIntensity = clamp(engine.lightColor.a, 0.1, 4.0);
  let radiance = engine.lightColor.rgb * lightIntensity;
  let Lo = (kD * albedo / PI + specular) * radiance * NdotL * shadowFactor;

  // Rich Hemispheric Sky & Ground Ambient Light
  let skyLight = engine.ambientColor.rgb * (clamp(N.y * 0.5 + 0.5, 0.0, 1.0) * engine.ambientColor.a * 0.6);
  let groundBounce = vec3<f32>(0.12, 0.14, 0.18) * (clamp(-N.y * 0.5 + 0.5, 0.0, 1.0) * 0.25);
  let ambient = (skyLight + groundBounce) * albedo * clamp(mat.ao, 0.1, 1.0);

  var color = ambient + Lo + emissive;

  // 1. Procedural HDR Bloom Glow
  if (engine.bloomEnabled > 0.5) {
    let luminance = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (luminance > 1.0) {
      let bloomAmt = min(0.6, (luminance - 1.0) * 0.25);
      color += (emissive + vec3<f32>(0.08, 0.12, 0.18)) * bloomAmt;
    }
  }

  // 2. Volumetric Scattering Light Shafts (God Rays)
  let volumetricActive = engine.lightDir.w;
  if (volumetricActive > 0.5) {
    let viewDir = normalize(camera.camPos.xyz - in.worldPos);
    let dotLV = max(dot(L, viewDir), 0.0);
    let shafts = pow(dotLV, 16.0) * 0.18;
    color += engine.lightColor.rgb * shafts;
  }

  // 3. Screen-Space Ground Reflection (SSR)
  if (engine.ssrEnabled > 0.5 && N.y > 0.7) {
    let reflectVec = reflect(-V, N);
    let refColor = albedo * 0.25 + vec3<f32>(0.04, 0.12, 0.2) * max(0.0, reflectVec.y);
    color = mix(color, refColor, 0.3 * (1.0 - roughness) * metallic);
  }

  // ACES Filmic Tone Mapping Curve (Cinematic contrast, deep shadow blacks, pristine highlights)
  let exposure = clamp(engine.exposure, 0.2, 3.0);
  color = max(color * exposure, vec3<f32>(0.0));
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  color = clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));

  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

export const SHADOW_PIPELINE_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>,
  cullingEnabled: u32,
  totalEntities: u32,
  pad0: u32,
  pad1: u32,
};

struct EntityData {
  worldMatrix: mat4x4<f32>,
  sphereCenter: vec4<f32>,
  meshId: u32,
  materialId: u32,
  flags: u32,
  animOffset: u32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> entities: array<EntityData>;
@group(0) @binding(2) var<storage, read> visibleIndices: array<u32>;
@group(0) @binding(3) var<storage, read> jointMatrices: array<mat4x4<f32>>;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) joints: vec4<u32>,
  @location(4) weights: vec4<f32>,
  @location(5) morphPos0: vec3<f32>,
  @location(6) morphPos1: vec3<f32>,
  @builtin(instance_index) instanceIndex: u32,
};

@vertex
fn vs_shadow(in: VertexInput) -> @builtin(position) vec4<f32> {
  let visibleOffset = in.instanceIndex;
  var entityIdx = 0u;
  if (visibleOffset < arrayLength(&visibleIndices)) {
    entityIdx = visibleIndices[visibleOffset];
  }
  let entity = entities[entityIdx];

  var modelPos = in.position;
  let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
  if (totalWeight > 0.001) {
    let jointOffset = entity.animOffset;
    let m0 = jointMatrices[jointOffset + in.joints.x];
    let m1 = jointMatrices[jointOffset + in.joints.y];
    let m2 = jointMatrices[jointOffset + in.joints.z];
    let m3 = jointMatrices[jointOffset + in.joints.w];
    let skinMat = m0 * in.weights.x + m1 * in.weights.y + m2 * in.weights.z + m3 * in.weights.w;
    modelPos = (skinMat * vec4<f32>(in.position, 1.0)).xyz;
  }

  let worldPos4 = entity.worldMatrix * vec4<f32>(modelPos, 1.0);
  return camera.lightViewProj * worldPos4;
}
`;
