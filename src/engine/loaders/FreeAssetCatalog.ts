/**
 * Destroyer Engine - Verified Free Legal 3D Assets Catalog (CC0 & CC-BY 4.0)
 * Every model entry includes verified source attribution, license type, and legal URLs.
 * All default mobile-recommended items are compact binary GLBs without heavy Draco dependencies.
 */

export interface Free3DAssetEntry {
  id: string;
  name: string;
  category: 'Office' | 'Furniture' | 'Courtyard' | 'Calibration';
  author: string;
  authorUrl: string;
  collection: string;
  sourceUrl: string;
  license: 'CC0 1.0 Public Domain' | 'CC-BY 4.0 International';
  licenseUrl: string;
  requiresAttribution: boolean;
  attributionText: string;
  glbUrl: string;
  sizeKB: number;
  targetHeightMeters: number;
  mobileSafe: boolean;
  physicsShape: 'box' | 'cylinder' | 'convex';
  mass: number;
}

export interface FreeAssetHubSource {
  name: string;
  url: string;
  licenseSummary: string;
  licenseUrl: string;
  notes: string;
}

export const VERIFIED_FREE_3D_HUBS: FreeAssetHubSource[] = [
  {
    name: 'Polygonal Mind CC0 Initiative (GLB by ToxSam)',
    url: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind',
    licenseSummary: 'CC0 1.0 Universal (Public Domain)',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    notes: '990+ CC0 3D environment & office props converted to universal GLB; attribution appreciated, commercial & personal allowed.',
  },
  {
    name: 'Open Source 3D Assets Registry (ToxSam)',
    url: 'https://opensource3dassets.com',
    licenseSummary: 'CC0 / Open Source Curated',
    licenseUrl: 'https://github.com/ToxSam/open-source-3d-assets',
    notes: 'Indexed JSON directory linking open-licensed GLB models with clear license metadata.',
  },
  {
    name: 'Khronos Group glTF Sample Assets',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
    licenseSummary: 'Per-Model (CC0 1.0 / CC-BY 4.0 Verified)',
    licenseUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/README.md',
    notes: 'Official Khronos reference PBR models; each item here is individually verified as CC0 1.0 or CC-BY 4.0.',
  },
  {
    name: 'Kenney Assets',
    url: 'https://kenney.nl/assets',
    licenseSummary: 'CC0 1.0 Universal (Public Domain)',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    notes: 'Low-poly Furniture Kit, City Kit, and Prototype Bits ideal for mobile browsers.',
  },
  {
    name: 'Quaternius Ultimate Packs',
    url: 'https://quaternius.com',
    licenseSummary: 'CC0 1.0 Universal (Public Domain)',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    notes: 'Stylized low-poly characters, modular buildings, and office props under CC0.',
  },
  {
    name: 'Poly Haven 3D Models',
    url: 'https://polyhaven.com/models',
    licenseSummary: 'CC0 1.0 Universal (Public Domain)',
    licenseUrl: 'https://polyhaven.com/license',
    notes: 'Photorealistic CC0 glTF/GLB furniture and architectural props.',
  },
];

export const FREE_3D_ASSETS_CATALOG: Free3DAssetEntry[] = [
  {
    id: 'pm-office-book',
    name: 'Hardcover Office Book',
    category: 'Office',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'The Avatar Show Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/avatar-show',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/avatar-show/Book.glb',
    sizeKB: 355,
    targetHeightMeters: 0.32,
    mobileSafe: true,
    physicsShape: 'box',
    mass: 0.55,
  },
  {
    id: 'pm-coffee-mug',
    name: 'Office Coffee Mug',
    category: 'Office',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'The Avatar Show Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/avatar-show',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/avatar-show/Mesh_Mug.glb',
    sizeKB: 742,
    targetHeightMeters: 0.28,
    mobileSafe: true,
    physicsShape: 'cylinder',
    mass: 0.45,
  },
  {
    id: 'pm-desk-pencil',
    name: 'Desk Pencil Prop',
    category: 'Office',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'The Avatar Show Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/avatar-show',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/avatar-show/Pencil.glb',
    sizeKB: 54,
    targetHeightMeters: 0.24,
    mobileSafe: true,
    physicsShape: 'cylinder',
    mass: 0.35,
  },
  {
    id: 'pm-pot-plant',
    name: 'Potted Office Plant',
    category: 'Office',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'The Avatar Show Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/avatar-show',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/avatar-show/Pot_Plant.glb',
    sizeKB: 569,
    targetHeightMeters: 1.05,
    mobileSafe: true,
    physicsShape: 'cylinder',
    mass: 1.2,
  },
  {
    id: 'pm-lamp-stand',
    name: 'Studio Floor Lamp',
    category: 'Furniture',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'The Avatar Show Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/avatar-show',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/avatar-show/Lamp_Stand.glb',
    sizeKB: 345,
    targetHeightMeters: 1.55,
    mobileSafe: true,
    physicsShape: 'cylinder',
    mass: 1.35,
  },
  {
    id: 'pm-ceramic-jar',
    name: 'Decorative Ceramic Jar',
    category: 'Office',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'The Avatar Show Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/avatar-show',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/avatar-show/Jar.glb',
    sizeKB: 615,
    targetHeightMeters: 0.52,
    mobileSafe: true,
    physicsShape: 'cylinder',
    mass: 0.85,
  },
  {
    id: 'pm-park-bench',
    name: 'Timber Courtyard Bench',
    category: 'Courtyard',
    author: 'Polygonal Mind (GLB via ToxSam)',
    authorUrl: 'https://github.com/PolygonalMind/initiative-opensource-release',
    collection: 'MomusPark Pack',
    sourceUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/tree/main/projects/MomusPark',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://github.com/ToxSam/cc0-models-Polygonal-Mind/blob/main/License.md',
    requiresAttribution: false,
    attributionText: 'Model by Polygonal Mind (CC0 1.0), GLB conversion by ToxSam',
    glbUrl: 'https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/MomusPark/Bench_01_Art.glb',
    sizeKB: 857,
    targetHeightMeters: 0.88,
    mobileSafe: true,
    physicsShape: 'box',
    mass: 2.2,
  },
  {
    id: 'khr-cesium-box',
    name: 'Reference Unit Box',
    category: 'Calibration',
    author: 'Cesium (Khronos glTF Sample Assets)',
    authorUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
    collection: 'Khronos glTF-Sample-Assets',
    sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Box',
    license: 'CC-BY 4.0 International',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/legalcode',
    requiresAttribution: true,
    attributionText: '© 2017 Cesium — Creative Commons Attribution 4.0 International (CC-BY 4.0)',
    glbUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Box/glTF-Binary/Box.glb',
    sizeKB: 2,
    targetHeightMeters: 0.9,
    mobileSafe: true,
    physicsShape: 'box',
    mass: 1.0,
  },
  {
    id: 'khr-sheen-chair',
    name: 'Velvet Accent Chair',
    category: 'Furniture',
    author: 'Eric Chadwick / Wayfair LLC',
    authorUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair',
    collection: 'Khronos glTF-Sample-Assets',
    sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair',
    license: 'CC0 1.0 Public Domain',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
    requiresAttribution: false,
    attributionText: '© 2020 Wayfair LLC / Eric Chadwick (CC0 1.0 Universal)',
    glbUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenChair/glTF-Binary/SheenChair.glb',
    sizeKB: 4028,
    targetHeightMeters: 0.92,
    mobileSafe: false,
    physicsShape: 'box',
    mass: 1.8,
  },
];
