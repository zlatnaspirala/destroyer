import React, { useRef, useState } from 'react';
import {
  Box,
  Check,
  ExternalLink,
  Loader2,
  Scale,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  FREE_3D_ASSETS_CATALOG,
  Free3DAssetEntry,
  VERIFIED_FREE_3D_HUBS,
} from '../engine/loaders/FreeAssetCatalog';

interface FreeAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpawnPhysicsProp: (kind: 'crate' | 'barrel' | 'octacrate' | 'cone' | 'bin') => void;
  onSpawnExternalGLB: (entry: Free3DAssetEntry) => Promise<{ success: boolean; error?: string }>;
  onUploadNpcGLB: (buffer: ArrayBuffer, fileName: string) => void;
  activeNpcSource: string;
}

export const FreeAssetsModal: React.FC<FreeAssetsModalProps> = ({
  isOpen,
  onClose,
  onSpawnPhysicsProp,
  onSpawnExternalGLB,
  onUploadNpcGLB,
  activeNpcSource,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    'All' | 'Vehicles' | 'People' | 'Office' | 'Furniture' | 'Courtyard'
  >('All');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [spawnedIds, setSpawnedIds] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const npcFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const filteredAssets =
    activeCategory === 'All'
      ? FREE_3D_ASSETS_CATALOG
      : FREE_3D_ASSETS_CATALOG.filter((a) => a.category === activeCategory);

  const handleSpawnRemote = async (entry: Free3DAssetEntry) => {
    setErrorMsg(null);
    setLoadingId(entry.id);
    const res = await onSpawnExternalGLB(entry);
    setLoadingId(null);
    if (res.success) {
      setSpawnedIds((prev) => ({ ...prev, [entry.id]: true }));
    } else {
      setErrorMsg(`${entry.name}: ${res.error || 'Download failed'}`);
    }
  };

  const handleNpcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result;
      if (buf instanceof ArrayBuffer) {
        onUploadNpcGLB(buf, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88dvh] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-4 bg-zinc-900/50 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">
              3D Assets, Physics Props &amp; License Attribution
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Mobile-optimized primitives, mid-level convex geometry, and legally verified CC0 / CC-BY 4.0 GLB props.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-7">
          {/* Section 1: Mobile-Safe Procedural Primitives & Mid-Level Convex Geometry */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <h3 className="text-sm font-semibold text-white">
                Instant Mobile Physics Props (Zero Network Load)
              </h3>
              <span className="text-xs text-zinc-400 tabular-nums">
                12–56 triangles · Fast AABB &amp; cylinder colliders
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                { kind: 'crate' as const, label: 'Box Crate', meta: 'Cube Primitive · 12 tris' },
                { kind: 'octacrate' as const, label: 'Convex Crate', meta: 'Chamfered · 44 tris' },
                { kind: 'cone' as const, label: 'Hazard Cone', meta: 'Convex Pylon · 48 tris' },
                { kind: 'bin' as const, label: 'Office Bin', meta: 'Tapered Convex · 32 tris' },
                { kind: 'barrel' as const, label: 'Steel Barrel', meta: 'Cylinder · 48 tris' },
              ].map((item) => (
                <button
                  key={item.kind}
                  onClick={() => onSpawnPhysicsProp(item.kind)}
                  className="px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 hover:border-cyan-500/50 text-left transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white whitespace-nowrap">
                    <Box className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1">{item.meta}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Section 2: Sitting Office Worker NPC Loader */}
          <section className="border-t border-zinc-800/80 pt-5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>Main Lobby Desk NPC (Sitting &amp; Punch-Reactive)</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Active model: <span className="text-zinc-200 font-medium">{activeNpcSource}</span>
                  <span aria-hidden="true"> · </span>
                  Seated at Floor 0 Lobby Desk (`F` to punch)
                </p>
              </div>
              <div className="shrink-0">
                <input
                  ref={npcFileInputRef}
                  type="file"
                  accept=".glb"
                  onChange={handleNpcUpload}
                  className="hidden"
                />
                <button
                  onClick={() => npcFileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-white flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Load worker-woman-1.glb</span>
                </button>
              </div>
            </div>
          </section>

          {/* Section 3: Verified Legal Online GLB Cars, People & Props */}
          <section className="border-t border-zinc-800/80 pt-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Free Online Cars, Ordinary People &amp; Props (CC0 / CC-BY 4.0 / MIT)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Spawn driveable trucks, coupes, bikes, switch to ordinary citizens, or drop GLB props cleanly into the city.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800 self-start">
                {(['All', 'Vehicles', 'People', 'Office', 'Furniture', 'Courtyard'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeCategory === cat
                        ? 'bg-cyan-500 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-lg border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg overflow-hidden">
              {filteredAssets.map((entry) => {
                const isBusy = loadingId === entry.id;
                const wasSpawned = spawnedIds[entry.id];
                return (
                  <div
                    key={entry.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-white truncate">
                        {entry.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400 tabular-nums">
                        <span>{entry.sizeKB} KB</span>
                        <span aria-hidden="true">·</span>
                        <span>{entry.mobileSafe ? 'Mobile-Safe' : 'High Texture (Wi-Fi)'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Collider: {entry.physicsShape}</span>
                        <span aria-hidden="true">·</span>
                        <a
                          href={entry.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                        >
                          <Scale className="w-3 h-3" />
                          <span>{entry.license}</span>
                        </a>
                      </div>
                      <div className="text-xs text-zinc-400">
                        Author:{' '}
                        <a
                          href={entry.authorUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-200 hover:text-cyan-300 underline decoration-zinc-700"
                        >
                          {entry.author}
                        </a>
                        <span aria-hidden="true"> · </span>
                        <a
                          href={entry.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-300 hover:text-cyan-300 inline-flex items-center gap-1"
                        >
                          <span>Source Repository</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      {entry.notes && (
                        <div className="text-[11px] text-emerald-300/85">{entry.notes}</div>
                      )}
                    </div>

                    <button
                      onClick={() => void handleSpawnRemote(entry)}
                      disabled={isBusy}
                      className={`px-4 py-2 rounded-lg disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center ${
                        entry.spawnAs === 'vehicle'
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : entry.spawnAs === 'player'
                          ? 'bg-indigo-600 hover:bg-indigo-500'
                          : 'bg-cyan-600 hover:bg-cyan-500'
                      }`}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Loading GLB...</span>
                        </>
                      ) : wasSpawned ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {entry.spawnAs === 'vehicle'
                              ? 'Spawn Another Car'
                              : entry.spawnAs === 'player'
                              ? 'Character Equipped'
                              : 'Spawn Again'}
                          </span>
                        </>
                      ) : (
                        <span>
                          {entry.spawnAs === 'vehicle'
                            ? 'Spawn Driveable Car'
                            : entry.spawnAs === 'player'
                            ? 'Play as Character'
                            : 'Spawn in Front'}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 4: Verified Legal CC0 / Open 3D Asset Hubs Directory */}
          <section className="border-t border-zinc-800/80 pt-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Verified Legal Free 3D Repositories &amp; Credits
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VERIFIED_FREE_3D_HUBS.map((hub) => (
                <div
                  key={hub.name}
                  className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/30 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={hub.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-cyan-300 hover:underline inline-flex items-center gap-1"
                    >
                      <span>{hub.name}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <div className="text-[11px] text-zinc-300">
                    License:{' '}
                    <a
                      href={hub.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-300 hover:underline"
                    >
                      {hub.licenseSummary}
                    </a>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{hub.notes}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
