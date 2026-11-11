import * as THREE from 'three';
// @ts-ignore
import { FBXLoader as ThreeFBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ParsedGLBPrimitive } from './GLBLoader';
import { AnimationClip } from '../core/Types';

export class FBXLoader {
  static async load(url: string): Promise<{ primitives: ParsedGLBPrimitive[]; clips: AnimationClip[] }> {
    const loader = new ThreeFBXLoader();
    const fbx = await loader.loadAsync(url) as THREE.Group;
    
    const primitives: ParsedGLBPrimitive[] = [];
    const clips: AnimationClip[] = [];

    fbx.traverse((child: any) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        if (geometry.isBufferGeometry) {
          const positions = geometry.attributes.position.array as Float32Array;
          const normals = geometry.attributes.normal?.array as Float32Array || new Float32Array(positions.length);
          const uvs = geometry.attributes.uv?.array as Float32Array || new Float32Array((positions.length / 3) * 2);
          const indices = geometry.index?.array as Uint32Array || new Uint32Array(positions.length / 3).map((_, i) => i);
          
          let joints: Uint32Array | undefined;
          let weights: Float32Array | undefined;
          
          if (geometry.attributes.skinIndex && geometry.attributes.skinWeight) {
            joints = new Uint32Array(geometry.attributes.skinIndex.array);
            weights = geometry.attributes.skinWeight.array as Float32Array;
          }

          primitives.push({
            name: child.name || 'FBX_Mesh',
            positions,
            normals,
            uvs,
            indices: indices instanceof Uint32Array ? indices : new Uint32Array(indices),
            joints,
            weights,
            boundingRadius: geometry.boundingSphere?.radius || 1.0,
            material: {
              baseColor: [0.8, 0.8, 0.8, 1.0],
              emissiveColor: [0, 0, 0, 0],
              roughness: 0.5,
              metallic: 0.1,
              ao: 1.0,
              alphaCutoff: 0.5,
            }
          });
        }
      }
    });

    if (fbx.animations) {
      for (const anim of fbx.animations) {
        // Convert Three.js AnimationClip to our engine's AnimationClip format
        // This is a complex mapping, we'll simplify for now or just store the name
        clips.push({
          name: anim.name || 'FBX_Animation',
          duration: anim.duration,
          channels: [], // TODO: Map channels if needed for skeletal animation
        });
      }
    }

    return { primitives, clips };
  }
}
