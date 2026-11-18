/**
 * Destroyer Engine - GPU Frustum Culling & Subgroup Compaction WGSL Compute Shaders
 * Perfectly matched 4-slot bind group:
 * @binding(0): CameraUniforms (uniform, 320 bytes)
 * @binding(1): Entities (storage, read)
 * @binding(2): IndirectCommands (storage, read_write)
 * @binding(3): VisibleIndices (storage, read_write)
 */

export const CULLING_STANDARD_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>,
  cullingEnabled: u32,
  totalEntities: u32,
  cullDistance: f32,
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

struct DrawIndexedIndirectArgs {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: u32,
  firstInstance: u32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> entities: array<EntityData>;
@group(0) @binding(2) var<storage, read_write> indirectCommands: array<DrawIndexedIndirectArgs>;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;

fn isSphereInFrustum(center: vec3<f32>, radius: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = camera.frustumPlanes[i];
    let dist = dot(plane.xyz, center) + plane.w;
    if (dist < -(radius + 4.0)) {
      return false;
    }
  }
  return true;
}

fn isWithinCullDistance(center: vec3<f32>, radius: f32) -> bool {
  // cullDistance <= 0 disables distance cap; mega ground slabs (radius >= 1000m) stay visible
  if (camera.cullDistance <= 0.0 || radius >= 1000.0) {
    return true;
  }
  let distToCam = length(center - camera.camPos.xyz);
  return (distToCam - radius) <= camera.cullDistance;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let entityIndex = globalId.x;
  if (entityIndex >= camera.totalEntities) {
    return;
  }

  let entity = entities[entityIndex];
  // Check active bit 0
  let isActive = (entity.flags & 1u) != 0u;
  if (!isActive) {
    return;
  }

  // sphereCenter.xyz and sphereCenter.w are stored in world space by FlatEntityManager
  let worldCenter = entity.sphereCenter.xyz;
  let worldRadius = entity.sphereCenter.w;

  var isVisible = true;
  if (camera.cullingEnabled == 1u) {
    isVisible = isSphereInFrustum(worldCenter, worldRadius) && isWithinCullDistance(worldCenter, worldRadius);
  }

  if (isVisible) {
    let meshIndex = entity.meshId;
    if (meshIndex < arrayLength(&indirectCommands)) {
      let slot = atomicAdd(&indirectCommands[meshIndex].instanceCount, 1u);
      let globalSlot = meshIndex * 10000u + slot;
      if (globalSlot < arrayLength(&visibleIndices)) {
        visibleIndices[globalSlot] = entityIndex;
      }
    }
  }
}
`;

export const CULLING_SUBGROUPS_WGSL = /* wgsl */ `
enable subgroups;

struct CameraUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  frustumPlanes: array<vec4<f32>, 6>,
  cullingEnabled: u32,
  totalEntities: u32,
  cullDistance: f32,
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

struct DrawIndexedIndirectArgs {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: u32,
  firstInstance: u32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> entities: array<EntityData>;
@group(0) @binding(2) var<storage, read_write> indirectCommands: array<DrawIndexedIndirectArgs>;
@group(0) @binding(3) var<storage, read_write> visibleIndices: array<u32>;

fn isSphereInFrustum(center: vec3<f32>, radius: f32) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = camera.frustumPlanes[i];
    let dist = dot(plane.xyz, center) + plane.w;
    if (dist < -(radius + 4.0)) {
      return false;
    }
  }
  return true;
}

fn isWithinCullDistance(center: vec3<f32>, radius: f32) -> bool {
  if (camera.cullDistance <= 0.0 || radius >= 1000.0) {
    return true;
  }
  let distToCam = length(center - camera.camPos.xyz);
  return (distToCam - radius) <= camera.cullDistance;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let entityIndex = globalId.x;
  var isVisible = false;
  var meshIndex = 0u;

  if (entityIndex < camera.totalEntities) {
    let entity = entities[entityIndex];
    let isActive = (entity.flags & 1u) != 0u;

    if (isActive) {
      let worldCenter = entity.sphereCenter.xyz;
      let worldRadius = entity.sphereCenter.w;

      if (camera.cullingEnabled == 1u) {
        isVisible = isSphereInFrustum(worldCenter, worldRadius) && isWithinCullDistance(worldCenter, worldRadius);
      } else {
        isVisible = true;
      }
      meshIndex = entity.meshId;
    }
  }

  // SIMD Subgroup ballot compaction check (early exit if entire subgroup is culled)
  let vote = subgroupBallot(isVisible);
  let anyVisible = (vote.x | vote.y | vote.z | vote.w) != 0u;
  if (!anyVisible || !isVisible) {
    return;
  }

  if (meshIndex < arrayLength(&indirectCommands)) {
    let slot = atomicAdd(&indirectCommands[meshIndex].instanceCount, 1u);
    let globalSlot = meshIndex * 10000u + slot;
    if (globalSlot < arrayLength(&visibleIndices)) {
      visibleIndices[globalSlot] = entityIndex;
    }
  }
}
`;

export const CULLING_COMPUTE_WGSL = CULLING_STANDARD_WGSL;
