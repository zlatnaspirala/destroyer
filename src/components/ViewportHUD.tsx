import React, { useState, useRef } from 'react';
import {
  Activity,
  Camera as CameraIcon,
  Car,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gamepad2,
  Layers,
  Moon,
  Pause,
  PhoneCall,
  Play,
  ShieldAlert,
  Sun,
  Zap,
} from 'lucide-react';
import { EngineStats } from '../engine/core/Types';

interface ViewportHUDProps {
  stats: EngineStats;
  cameraMode: 'ORBIT' | 'FPS' | 'FLY';
  onCameraModeChange: (mode: 'ORBIT' | 'FPS' | 'FLY') => void;
  onResetCamera: () => void;
  onJoystickMove?: (x: number, y: number) => void;
  onJumpRequested?: () => void;
  onPunchRequested?: () => void;
  onToggleVehicleEntry?: () => void;
  onToggleDayNightPause?: () => void;
  isRunning?: boolean;
  onToggleRunning?: () => void;
  activeNpcSource?: string;
  elevatorTargetFloor?: number;
  onSelectElevatorFloor?: (floor: number) => void;
  onReleaseFromJail?: () => void;
  onDirectHooliganRelease?: () => void;
  onSignReleasePaper?: () => void;
  onPickUpGarbage?: () => void;
  onGunShopInteract?: () => void;
  onFireWeapon?: () => void;
}

const formatMmSs = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
};

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  stats,
  cameraMode,
  onCameraModeChange,
  onJoystickMove,
  onJumpRequested,
  onPunchRequested,
  onToggleVehicleEntry,
  onToggleDayNightPause,
  isRunning = false,
  onToggleRunning,
  activeNpcSource = 'Procedural Sitting Worker',
  elevatorTargetFloor = 0,
  onSelectElevatorFloor,
  onReleaseFromJail,
  onDirectHooliganRelease,
  onSignReleasePaper,
  onPickUpGarbage,
  onGunShopInteract,
  onFireWeapon,
}) => {
  const totalMins = Math.round((stats.timeOfDayHours ?? 10.5) * 60) % (24 * 60);
  const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
  const mm = String(totalMins % 60).padStart(2, '0');
  const phase = stats.dayNightPhase ?? 'DAY';
  const [isMinimized, setIsMinimized] = useState(false);
  const isCustodyLocked =
    stats.custodyStage === 'ESCORT_TO_CAR' ||
    stats.custodyStage === 'DRIVING_TO_STATION' ||
    stats.custodyStage === 'WALKING_TO_CELL';

  // Touch joystick tracking (pinned by touch identifier for multi-touch safety)
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isTouchingUI, setIsTouchingUI] = useState(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const lastJumpTriggerRef = useRef<number>(0);
  const lastRunTriggerRef = useRef<number>(0);
  const lastPunchTriggerRef = useRef<number>(0);
  const isCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const triggerJumpImmediate = () => {
    lastJumpTriggerRef.current = performance.now();
    if (onJumpRequested) onJumpRequested();
  };

  const triggerToggleRunImmediate = () => {
    lastRunTriggerRef.current = performance.now();
    if (onToggleRunning) onToggleRunning();
  };

  const triggerPunchImmediate = () => {
    lastPunchTriggerRef.current = performance.now();
    if (onPunchRequested) onPunchRequested();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.changedTouches[0];
    if (!touch) return;
    activeTouchIdRef.current = touch.identifier;
    setIsTouchingUI(true);
    updateJoystickPos(touch);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouchIdRef.current) {
        updateJoystickPos(e.touches[i]);
        return;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (activeTouchIdRef.current !== null) {
      let released = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
          released = true;
          break;
        }
      }
      if (!released && e.touches.length > 0) return;
    }
    activeTouchIdRef.current = null;
    setIsTouchingUI(false);
    setJoystickPos({ x: 0, y: 0 });
    if (onJoystickMove) onJoystickMove(0, 0);
  };

  const updateJoystickPos = (touch: React.Touch) => {
    if (!joystickContainerRef.current) return;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const maxRadius = rect.width / 2;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setJoystickPos({ x: dx, y: dy });
    if (onJoystickMove) {
      onJoystickMove(dx / maxRadius, dy / maxRadius);
    }
  };

  return (
    <>
      {/* Top Left: GPU Telemetry Card */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none flex flex-col gap-2 font-mono select-none">
        <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-lg p-2 sm:p-2.5 shadow-2xl pointer-events-auto transition-all text-xs text-zinc-300 w-52 sm:w-60">
          <div className="flex items-center justify-between border-b border-zinc-800/70 pb-1.5 mb-1.5">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[11px] sm:text-xs">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>GPU TELEMETRY</span>
            </div>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
              title={isMinimized ? 'Expand HUD' : 'Minimize HUD'}
            >
              {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center justify-between bg-zinc-900/90 rounded px-2 py-1 mb-1.5 border border-zinc-800/60">
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">{stats.fps}</span>
              <span className="text-[10px] text-zinc-400 font-normal">FPS</span>
            </div>
            <div className="text-right">
              <div className="text-emerald-400 font-semibold text-[11px]">{stats.frameTimeMs} ms</div>
              <div className="text-[9px] text-zinc-400">FRAME TIME</div>
            </div>
          </div>

          {!isMinimized && (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-zinc-300">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400" /> GPU Render
                </span>
                <span className="font-semibold text-cyan-300">{stats.gpuRenderTimeMs} ms</span>
              </div>

              <div className="flex justify-between items-center text-zinc-300">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-purple-400" /> GPU Cull
                </span>
                <span className="font-semibold text-purple-300">{stats.gpuCullTimeMs} ms</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
                <span>Instances</span>
                <span className="text-zinc-200">
                  {stats.visibleInstances.toLocaleString()} / {stats.totalInstances.toLocaleString()}
                </span>
              </div>

              <div
                className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60"
                title={
                  stats.subgroupsSupported
                    ? `WebGPU SIMD subgroups active (width ${stats.subgroupMinSize}–${stats.subgroupMaxSize})`
                    : "WebGPU 'subgroups' feature is not exposed by this browser/GPU adapter"
                }
              >
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Subgroups
                </span>
                <span
                  className={`px-1 rounded text-[9px] font-bold ${
                    stats.subgroupsActive
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {stats.subgroupsActive
                    ? `ON (${stats.subgroupMinSize}-${stats.subgroupMaxSize})`
                    : stats.subgroupsSupported
                    ? 'STANDBY'
                    : 'UNSUPPORTED'}
                </span>
              </div>

              <div
                className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60"
                title="Smart Floor Culling renders only current floor ± 1 when inside a building"
              >
                <span>Floor Cull</span>
                <span
                  className={`px-1 rounded text-[9px] font-bold ${
                    !stats.smartCullingEnabled
                      ? 'bg-zinc-800 text-zinc-500'
                      : stats.smartCullMode === 'INTERIOR'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  {!stats.smartCullingEnabled
                    ? 'OFF'
                    : stats.smartCullMode === 'INTERIOR'
                    ? `F${stats.smartCullFloor} [${stats.smartCullMinFloor}-${stats.smartCullMaxFloor}]`
                    : 'EXTERIOR'}
                </span>
              </div>

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
                <span>Desk NPC</span>
                <span
                  className={`truncate max-w-[115px] text-[9px] font-semibold ${
                    activeNpcSource.startsWith('GLB:') ? 'text-emerald-300' : 'text-zinc-400'
                  }`}
                  title={activeNpcSource}
                >
                  {activeNpcSource.replace(/^GLB:\s*/, '')}
                </span>
              </div>

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
                <span>Citizens / CCTV</span>
                <span className="text-zinc-200 font-semibold text-[10px]">
                  {stats.cityCitizenCount} / {stats.cctvCameraCount}
                </span>
              </div>

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
                <span>Police Patrols</span>
                <span className={`font-semibold text-[10px] ${stats.bigCrimeActive ? 'text-rose-400' : 'text-sky-300'}`}>
                  {stats.activePatrolCount} / 15 {stats.bigCrimeActive ? '(ALL)' : '(N+S)'}
                </span>
              </div>

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
                <span className="flex items-center gap-1">
                  {phase === 'NIGHT' ? (
                    <Moon className="w-3 h-3 text-indigo-400" />
                  ) : (
                    <Sun className="w-3 h-3 text-amber-400" />
                  )}
                  <span>Time</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1 rounded text-[9px] font-bold ${
                      phase === 'NIGHT'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : phase === 'SUNSET' || phase === 'DAWN'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    }`}
                  >
                    {hh}:{mm} {phase}
                  </span>
                  {onToggleDayNightPause && (
                    <button
                      type="button"
                      onClick={onToggleDayNightPause}
                      className="p-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300"
                      title={stats.dayNightPaused ? 'Resume Day-Night Cycle' : 'Pause Day-Night Cycle'}
                    >
                      {stats.dayNightPaused ? (
                        <Play className="w-2.5 h-2.5 text-emerald-400" />
                      ) : (
                        <Pause className="w-2.5 h-2.5 text-amber-300" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-1.5 border-t border-zinc-800/60 flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <CameraIcon className="w-3 h-3 text-cyan-400" /> Cam Mode
                </span>
                <div className="flex items-center gap-1">
                  {(['ORBIT', 'FLY'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onCameraModeChange(mode)}
                      className={`px-1.5 py-0.5 text-[9px] rounded font-mono uppercase transition-colors ${
                        cameraMode === mode
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Right: 3rd Person Action Controls (Hidden during Arrest Escort/Transport/Paper) */}
      {!isCustodyLocked && stats.custodyStage !== 'RELEASE_PAPER' && (
        <div className="absolute top-2 right-2 z-20 pointer-events-auto flex flex-col items-end gap-1.5 select-none">
          <div className="flex items-center gap-2">
            {/* Toggle Running HUD Button */}
            <button
              type="button"
              onTouchStart={(e) => {
                e.stopPropagation();
                triggerToggleRunImmediate();
              }}
              onPointerDown={(e) => {
                if (e.pointerType === 'touch') return;
                e.preventDefault();
                e.stopPropagation();
                triggerToggleRunImmediate();
              }}
              onClick={() => {
                if (performance.now() - lastRunTriggerRef.current > 400) {
                  triggerToggleRunImmediate();
                }
              }}
              className={`touch-none select-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xl active:scale-95 ${
                isRunning
                  ? 'bg-amber-500/90 hover:bg-amber-400 border-amber-300 text-zinc-950 shadow-amber-500/30'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700 text-zinc-300 backdrop-blur-md'
              }`}
              title="Toggle between Walking and Running mode (or hold SHIFT)"
            >
              <Zap className={`w-3.5 h-3.5 ${isRunning ? 'text-zinc-950 fill-zinc-950' : 'text-amber-400'}`} />
              <span>{isRunning ? 'RUN (ON)' : 'WALK (OFF)'}</span>
            </button>

            {/* Punch Button in Desktop HUD */}
            <button
              type="button"
              onTouchStart={(e) => {
                e.stopPropagation();
                triggerPunchImmediate();
              }}
              onPointerDown={(e) => {
                if (e.pointerType === 'touch') return;
                e.preventDefault();
                e.stopPropagation();
                triggerPunchImmediate();
              }}
              onClick={() => {
                if (performance.now() - lastPunchTriggerRef.current > 400) {
                  triggerPunchImmediate();
                }
              }}
              className="touch-none select-none flex items-center gap-1 px-3 py-1.5 rounded-lg border border-orange-500/50 bg-orange-950/80 hover:bg-orange-900/80 text-orange-300 text-xs font-mono font-bold transition-all shadow-xl active:scale-95 backdrop-blur-md"
              title="Punch moveable crates and barrels in front of player (Key F)"
            >
              <span>PUNCH</span>
              <span className="text-[9px] bg-orange-900/80 px-1 rounded text-orange-200">F</span>
            </button>

            {/* Jump Button in Desktop HUD */}
            <button
              type="button"
              onTouchStart={(e) => {
                e.stopPropagation();
                triggerJumpImmediate();
              }}
              onPointerDown={(e) => {
                if (e.pointerType === 'touch') return;
                e.preventDefault();
                e.stopPropagation();
                triggerJumpImmediate();
              }}
              onClick={() => {
                if (performance.now() - lastJumpTriggerRef.current > 400) {
                  triggerJumpImmediate();
                }
              }}
              className="touch-none select-none flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 text-xs font-mono font-bold transition-all shadow-xl active:scale-95 backdrop-blur-md"
              title="Perform Jump with character animation"
            >
              <span>JUMP</span>
              <span className="text-[9px] bg-cyan-900/80 px-1 rounded text-cyan-200">SPACE</span>
            </button>

            {/* Shoot Weapon HUD Button (when Pistol equipped from Downtown Gun Shop) */}
            {stats.hasWeapon && !stats.isDriving && !stats.isJailed && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (onFireWeapon) onFireWeapon();
                }}
                className="touch-none select-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/60 bg-rose-950/85 hover:bg-rose-900/85 text-rose-200 text-xs font-mono font-bold transition-all shadow-xl active:scale-95 backdrop-blur-md"
                title="Fire equipped pistol (Key G)"
              >
                <span>SHOOT ({stats.weaponAmmo})</span>
                <span className="text-[9px] bg-rose-900/90 px-1 rounded text-rose-100">G</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-lg px-3 py-1.5 shadow-2xl text-[11px] font-mono text-zinc-300 pointer-events-none">
              <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong className="text-white">W:</strong> Forward</span>
              <span className="text-zinc-600">|</span>
              <span><strong className="text-white">A/D:</strong> Turn</span>
              <span className="text-zinc-600">|</span>
              <span><strong className="text-white">S:</strong> Back</span>
              <span className="text-zinc-600">|</span>
              <span><strong className="text-white">SPACE:</strong> Jump</span>
              <span className="text-zinc-600">|</span>
              <span><strong className="text-white">F:</strong> Punch</span>
              {stats.hasWeapon && (
                <>
                  <span className="text-zinc-600">|</span>
                  <span><strong className="text-rose-300">G:</strong> Shoot</span>
                </>
              )}
            </div>
          </div>

          {/* Probation Community Service Tracker */}
          {stats.socialWorkActive && (
            <div className="bg-emerald-950/90 border border-emerald-500/60 rounded-lg px-3 py-1 text-[11px] font-mono text-emerald-200 shadow-lg backdrop-blur-md pointer-events-none">
              PROBATION CLEANUP: <strong>{stats.socialWorkCollected}/{stats.socialWorkRequired}</strong> PERIPHERY GARBAGE
            </div>
          )}
        </div>
      )}

      {/* Custody Cinematic Lock Banner / Release Paper Modal / Real Cell / Vehicle / Garbage Prompts */}
      {isCustodyLocked ? (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center gap-3 bg-zinc-950/95 border-2 border-sky-400/85 rounded-xl px-5 py-3 shadow-2xl font-mono text-xs backdrop-blur-md max-w-lg w-[92%] sm:w-auto">
          <ShieldAlert className="w-5 h-5 text-sky-400 animate-pulse shrink-0" />
          <div>
            <div className="font-bold text-sky-300 tracking-wide">
              UNDER ARREST · CONTROLS DISABLED
            </div>
            <div className="text-[11px] text-zinc-200 mt-0.5">
              {stats.custodyStage === 'ESCORT_TO_CAR'
                ? `Police officer escorting suspect to waiting patrol car (${stats.custodyDistLeft}m)`
                : stats.custodyStage === 'DRIVING_TO_STATION'
                ? `Transporting in police cruiser to City 0 Police Station (${stats.custodyDistLeft}m)`
                : `Walking into Police Station holding cell (${stats.custodyDistLeft}m)`}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Charge: {stats.jailReason || 'Police Arrest'} · Offense #{Math.max(1, stats.offenseCount)}
            </div>
          </div>
        </div>
      ) : stats.custodyStage === 'RELEASE_PAPER' ? (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-4 pointer-events-auto"
        >
          <div className="max-w-md w-full bg-stone-100 text-zinc-900 rounded-xl border-2 border-zinc-400 shadow-2xl p-5 font-mono text-xs">
            <div className="border-b-2 border-zinc-800 pb-2 mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold tracking-widest text-zinc-600">
                  METRO CITY 0 POLICE DEPARTMENT
                </div>
                <div className="text-sm font-extrabold text-zinc-950 tracking-tight">
                  CONDITIONAL RELEASE &amp; OBLIGATIONS ORDER
                </div>
              </div>
              <span className="px-2 py-0.5 bg-zinc-900 text-amber-300 font-bold text-[10px] rounded">
                CASE #{String(Math.max(1, stats.offenseCount)).padStart(4, '0')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-stone-200/80 border border-zinc-300 rounded p-2 mb-3 text-[11px]">
              <div><span className="text-zinc-600">Facility:</span> <strong>P.Station Prison</strong></div>
              <div><span className="text-zinc-600">Charge:</span> <strong>{stats.jailReason || 'Minor Offense'}</strong></div>
              <div><span className="text-zinc-600">Status:</span> <strong className="text-emerald-700">{stats.firstHooliganEligible ? '1st Hooligan Caution' : 'Sentence Served'}</strong></div>
              <div><span className="text-zinc-600">Max Prison:</span> <strong>Inactive</strong></div>
            </div>

            <div className="font-bold text-[11px] uppercase tracking-wide text-zinc-800 mb-1.5">
              Mandatory Real-World Release Obligations:
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-zinc-800 mb-4 leading-relaxed">
              <li>
                <strong>Community Service Cleanup:</strong> Pick up <strong>{stats.socialWorkRequired}</strong> dumped garbage piles along outer city streets &amp; rear alleys (<strong>[E]</strong>).
              </li>
              <li>
                <strong>Firearms Prohibition:</strong> Weapons confiscated. Carrying or firing guns inside Metro City 0 is strictly prohibited.
              </li>
              <li>
                <strong>Public Peace &amp; Police Yielding:</strong> Keep clear of moving police cruisers and commit no violence against citizens or officers.
              </li>
              <li>
                <strong>Active Patrol &amp; CCTV Probation:</strong> Municipal surveillance and North/South Patrols monitor your conditional release.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => onSignReleasePaper && onSignReleasePaper()}
              className="w-full py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] text-emerald-300 font-bold text-xs tracking-wide transition-all shadow-lg"
            >
              SIGN &amp; ACCEPT OBLIGATIONS (UNLOCK CELL DOOR)
            </button>
          </div>
        </div>
      ) : stats.isJailed ? (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col sm:flex-row items-center gap-3 bg-zinc-950/95 border-2 border-rose-500/80 rounded-xl px-4 py-3 shadow-2xl font-mono text-xs backdrop-blur-md max-w-xl w-[92%] sm:w-auto">
          <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse shrink-0" />
          <div className="flex-1 text-center sm:text-left">
            <div className="font-bold text-rose-300 tracking-wide">JAILED · CITY 0 POLICE STATION PRISON</div>
            <div className="text-[11px] text-zinc-300 mt-0.5">
              Charge: {stats.jailReason || 'Police Arrest'} · Release Paper in{' '}
              <strong className="text-amber-300">{formatMmSs(stats.jailTimeLeft)}</strong>
            </div>
            <div className="text-[10px] text-emerald-300/90 mt-0.5">
              Controls active — walk freely inside the holding cell until gate unlocks
            </div>
          </div>
          {stats.firstHooliganEligible && (onDirectHooliganRelease || onReleaseFromJail) && (
            <button
              type="button"
              onClick={() => (onDirectHooliganRelease ? onDirectHooliganRelease() : onReleaseFromJail?.())}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-[11px] active:scale-95 transition-all shadow shrink-0"
            >
              FIRST HOOLIGAN · DIRECT RELEASE
            </button>
          )}
        </div>
      ) : stats.isDriving ? (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-3 bg-zinc-950/90 border border-emerald-500/60 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-zinc-100 backdrop-blur-md">
          <Car className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-bold text-emerald-300">{stats.vehicleSpeedKmh} KM/H</span>
          <span className="text-zinc-600">|</span>
          <span
            className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
              stats.activeVehicleHealth >= 65
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : stats.activeVehicleHealth >= 25
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-rose-500/25 text-rose-300 border-rose-500/50'
            }`}
          >
            {stats.activeVehicleHealth <= 0 ? 'WRECKED 0%' : `ABILITY ${stats.activeVehicleHealth}%`}
          </span>
          <span className="text-zinc-500 hidden sm:inline">|</span>
          <span className="text-zinc-300 hidden sm:inline">{stats.activeVehicleName}</span>
          <button
            type="button"
            onClick={() => onToggleVehicleEntry && onToggleVehicleEntry()}
            className="px-2 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/60 text-rose-200 font-bold text-[11px] active:scale-95 transition-all"
          >
            EXIT CAR [E]
          </button>
        </div>
      ) : stats.garbageNearby ? (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2.5 bg-zinc-950/92 border border-amber-400/75 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-amber-100 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="font-bold text-amber-300">STREET GARBAGE</span>
          <button
            type="button"
            onClick={() => onPickUpGarbage && onPickUpGarbage()}
            className="px-2.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-[11px] active:scale-95 transition-all shadow"
          >
            PICK UP GARBAGE [E]
          </button>
        </div>
      ) : stats.gunShopNearby ? (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2.5 bg-zinc-950/92 border border-rose-400/75 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-rose-100 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-bold text-rose-300">DOWNTOWN GUN SHOP</span>
          <button
            type="button"
            onClick={() => onGunShopInteract && onGunShopInteract()}
            className="px-2.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-[11px] active:scale-95 transition-all shadow"
          >
            {stats.hasWeapon ? 'REFILL AMMO [E]' : 'EQUIP PISTOL [E]'}
          </button>
        </div>
      ) : stats.nearbyVehicleName ? (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2.5 bg-emerald-950/90 border border-emerald-400/70 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-emerald-100 backdrop-blur-md">
          <Car className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
          <span className="hidden sm:inline text-emerald-200">{stats.nearbyVehicleName}</span>
          <span
            className={`px-2 py-0.5 rounded font-bold text-[11px] border ${
              stats.nearbyVehicleHealth >= 65
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : stats.nearbyVehicleHealth >= 25
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-rose-500/25 text-rose-300 border-rose-500/50'
            }`}
          >
            {stats.nearbyVehicleHealth <= 0 ? 'WRECKED 0%' : `${stats.nearbyVehicleHealth}%`}
          </span>
          <button
            type="button"
            onClick={() => onToggleVehicleEntry && onToggleVehicleEntry()}
            className="px-2.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-[11px] active:scale-95 transition-all shadow"
          >
            ENTER CAR [E]
          </button>
        </div>
      ) : (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 bg-amber-950/80 border border-amber-500/60 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-amber-200 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span><strong className="text-white bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-400/50">E</strong> or <strong className="text-white bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-400/50">0-9</strong>: Press 3D Scene Elevator Buttons</span>
        </div>
      )}

      {/* First Police Strike Slowed Alert */}
      {stats.custodyStage === 'SLOWED' && !isCustodyLocked && !stats.isJailed && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2.5 bg-zinc-950/95 border-2 border-amber-400 rounded-xl px-4 py-2 shadow-2xl font-mono text-xs backdrop-blur-md animate-pulse">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-200">
            POLICE FIRST PUNCH · MOVEMENT SLOWED — OFFICER TAKING INTO CUSTODY
          </span>
        </div>
      )}

      {/* Police Car Blocking Siren Countdown Alert */}
      {stats.policeSirenWarningActive && !stats.isJailed && !isCustodyLocked && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2.5 bg-zinc-950/95 border-2 border-sky-400 rounded-xl px-4 py-2 shadow-2xl font-mono text-xs backdrop-blur-md animate-pulse">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-bold text-amber-300">
            POLICE SIREN: STEP ASIDE FROM CRUISER — OFFICER DEPLOY IN{' '}
            <span className="text-rose-400">{stats.policeSirenCountdown.toFixed(1)}s</span>
          </span>
        </div>
      )}

      {/* 911 Police Dispatch & Surveillance Alert Banner */}
      {stats.policeAlertActive && !isCustodyLocked && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-3 bg-zinc-950/92 border border-rose-500/70 rounded-xl px-3.5 py-2 shadow-2xl font-mono text-xs backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-rose-400 font-bold animate-pulse">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>{stats.bigCrimeActive ? 'BIG CRIME · WANTED' : '911 DISPATCH'}</span>
          </div>
          <span className="text-amber-300 font-bold tracking-widest">
            {'★'.repeat(Math.max(1, Math.min(5, stats.policeWantedLevel)))}
          </span>
          {stats.bigCrimeActive && (
            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
              BILLBOARDS ACTIVE
            </span>
          )}
          <span className="text-zinc-600">|</span>
          <span className="flex items-center gap-1 text-sky-300">
            <PhoneCall className="w-3.5 h-3.5 text-sky-400" />
            <span className="truncate max-w-[190px]">{stats.policeCallerInfo || 'Mobile 911 Report'}</span>
          </span>
          <span className="text-zinc-600 hidden sm:inline">|</span>
          <span className="text-rose-200 hidden sm:inline">
            Units: <strong>{stats.policeDispatchCount}</strong> · ETA{' '}
            <strong className="text-amber-300">{stats.policeEtaSeconds}s</strong> ({stats.policeNearestDistMeters}m)
          </span>
        </div>
      )}

      {/* Mobile Touch Joystick & Action Buttons (Hidden during arrest custody lock & paper modal) */}
      {!isCustodyLocked && stats.custodyStage !== 'RELEASE_PAPER' && (
        <>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className={`absolute bottom-6 left-6 z-30 pointer-events-auto select-none ${isCoarsePointer ? 'block' : 'md:hidden'}`}
          >
            <div
              ref={joystickContainerRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className="w-32 h-32 rounded-full bg-zinc-950/70 border-2 border-cyan-500/40 backdrop-blur-md flex items-center justify-center relative shadow-2xl touch-none"
            >
              <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-400/60" />
              <div
                style={{
                  transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
                }}
                className={`w-12 h-12 rounded-full bg-cyan-400 shadow-lg shadow-cyan-500/50 absolute top-1/2 left-1/2 -mt-6 -ml-6 pointer-events-none ${
                  isTouchingUI ? '' : 'transition-transform duration-100'
                }`}
              />
            </div>
          </div>

          <div
            onPointerDown={(e) => e.stopPropagation()}
            className={`absolute bottom-6 right-6 z-30 pointer-events-auto select-none items-center gap-3 ${isCoarsePointer ? 'flex' : 'flex md:hidden'}`}
          >
            {/* Mobile Run / Boost Toggle Button (Multi-touch immediate touchstart) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerToggleRunImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerToggleRunImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastRunTriggerRef.current > 400) {
              triggerToggleRunImmediate();
            }
          }}
          className={`touch-none select-none w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-xs uppercase shadow-2xl transition-all active:scale-95 ${
            isRunning
              ? 'bg-amber-500 border-amber-300 text-zinc-950 shadow-amber-500/50'
              : 'bg-zinc-950/80 border-zinc-700 text-zinc-300 backdrop-blur-md'
          }`}
        >
          {stats.isDriving ? (isRunning ? 'TURBO' : 'CRUISE') : isRunning ? 'RUN' : 'WALK'}
        </button>

        {/* Mobile Punch Button (Hidden when driving; replaced by Exit Car) */}
        {stats.isDriving ? (
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              if (onToggleVehicleEntry) onToggleVehicleEntry();
            }}
            onClick={() => {
              if (onToggleVehicleEntry) onToggleVehicleEntry();
            }}
            className="touch-none select-none w-14 h-14 rounded-full border-2 border-rose-400 bg-rose-500/85 text-white active:scale-90 font-bold text-[11px] uppercase shadow-2xl shadow-rose-500/50 backdrop-blur-md flex items-center justify-center transition-all"
          >
            EXIT
          </button>
        ) : (
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              triggerPunchImmediate();
            }}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') return;
              e.preventDefault();
              e.stopPropagation();
              triggerPunchImmediate();
            }}
            onClick={() => {
              if (performance.now() - lastPunchTriggerRef.current > 400) {
                triggerPunchImmediate();
              }
            }}
            className="touch-none select-none w-14 h-14 rounded-full border-2 border-orange-400 bg-orange-500/85 text-zinc-950 active:scale-90 font-bold text-xs uppercase shadow-2xl shadow-orange-500/50 backdrop-blur-md flex items-center justify-center transition-all"
          >
            PUNCH
          </button>
        )}

        {/* Mobile Jump / Handbrake Button */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerJumpImmediate();
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            e.stopPropagation();
            triggerJumpImmediate();
          }}
          onClick={() => {
            if (performance.now() - lastJumpTriggerRef.current > 400) {
              triggerJumpImmediate();
            }
          }}
          className="touch-none select-none w-16 h-16 rounded-full border-2 border-cyan-400 bg-cyan-500/80 text-zinc-950 active:scale-90 font-bold text-xs uppercase shadow-2xl shadow-cyan-500/50 backdrop-blur-md flex items-center justify-center transition-all"
        >
          {stats.isDriving ? 'BRAKE' : 'JUMP'}
        </button>
      </div>
        </>
      )}
    </>
  );
};
