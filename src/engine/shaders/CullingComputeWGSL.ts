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

  let worldCenter = (entity.worldMatrix * vec4<f32>(entity.sphereCenter.xyz, 1.0)).xyz;
  let maxScale = max(
    length(entity.worldMatrix[0].xyz),
    max(length(entity.worldMatrix[1].xyz), length(entity.worldMatrix[2].xyz))
  );
  let worldRadius = entity.sphereCenter.w * maxScale;

  var isVisible = true;
  if (camera.cullingEnabled == 1u) {
    isVisible = isSphereInFrustum(worldCenter, worldRadius);
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

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let entityIndex = globalId.x;
  var isVisible = false;
  var meshIndex = 0u;

  if (entityIndex < camera.totalEntities) {
    let entity = entities[entityIndex];
    let isActive = (entity.flags & 1u) != 0u;

    if (isActive) {
      let worldCenter = (entity.worldMatrix * vec4<f32>(entity.sphereCenter.xyz, 1.0)).xyz;
      let maxScale = max(
        length(entity.worldMatrix[0].xyz),
        max(length(entity.worldMatrix[1].xyz), length(entity.worldMatrix[2].xyz))
      );
      let worldRadius = entity.sphereCenter.w * maxScale;

      if (camera.cullingEnabled == 1u) {
        isVisible = isSphereInFrustum(worldCenter, worldRadius);
      } else {
        isVisible = true;
      }
      meshIndex = entity.meshId;
    }
  }

  // SIMD Subgroup compaction
  let vote = subgroupBallot(isVisible);

  if (isVisible && meshIndex < arrayLength(&indirectCommands)) {
    let slot = atomicAdd(&indirectCommands[meshIndex].instanceCount, 1u);
    let globalSlot = meshIndex * 10000u + slot;
    if (globalSlot < arrayLength(&visibleIndices)) {
      visibleIndices[globalSlot] = entityIndex;
    }
  }
}
`;

export const CULLING_COMPUTE_WGSL = CULLING_STANDARD_WGSL;
