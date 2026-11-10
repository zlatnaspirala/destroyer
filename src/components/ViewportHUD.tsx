import React, { useState, useRef } from 'react';
import {
  Activity,
  Camera as CameraIcon,
  ChevronDown,
  ChevronUp,
  Cpu,
  Film,
  Gamepad2,
  Layers,
  Play,
  Upload,
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
  isRunning?: boolean;
  onToggleRunning?: () => void;
  onLoadBVH?: (bvhText: string, name: string) => void;
  onSelectAnimation?: (clipName: string) => void;
  availableAnimations?: string[];
  activeAnimationName?: string;
  elevatorTargetFloor?: number;
  onSelectElevatorFloor?: (floor: number) => void;
}

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  stats,
  cameraMode,
  onCameraModeChange,
  onJoystickMove,
  onJumpRequested,
  isRunning = false,
  onToggleRunning,
  onLoadBVH,
  onSelectAnimation,
  availableAnimations = [],
  activeAnimationName = '',
  elevatorTargetFloor = 0,
  onSelectElevatorFloor,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showBVHMenu, setShowBVHMenu] = useState(false);
  const [bvhNotification, setBvhNotification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Touch joystick tracking
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTouchingRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    isTouchingRef.current = true;
    updateJoystickPos(e.touches[0]);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTouchingRef.current) return;
    updateJoystickPos(e.touches[0]);
  };

  const handleTouchEnd = () => {
    isTouchingRef.current = false;
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text && onLoadBVH) {
        onLoadBVH(text, file.name);
        setBvhNotification(`Loaded BVH: ${file.name}`);
        setTimeout(() => setBvhNotification(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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

              <div className="flex justify-between items-center text-zinc-400 pt-0.5 border-t border-zinc-800/60">
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
                  {stats.subgroupsActive ? 'ENABLED' : 'OFF'}
                </span>
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

      {/* Top Right: 3rd Person Controls, Run Toggle, and BVH Motion Capture Menu */}
      <div className="absolute top-2 right-2 z-20 pointer-events-auto flex items-center gap-2 select-none">
        {/* BVH Motion Capture Dropdown Button */}
        <div className="relative">
          <button
            onClick={() => setShowBVHMenu(!showBVHMenu)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xl active:scale-95 ${
              showBVHMenu
                ? 'bg-cyan-500 text-zinc-950 border-cyan-400 shadow-cyan-500/30'
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700 text-cyan-300 backdrop-blur-md'
            }`}
            title="Biovision Hierarchy (BVH) Motion Capture Animations"
          >
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            <span>BVH MOCAP</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showBVHMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* BVH Popup Panel */}
          {showBVHMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl p-3 z-50 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-cyan-400" /> BVH Mocap Player
                </span>
                <span className="text-[10px] text-zinc-400">Biovision Format</span>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                  Active Clips on Mesh
                </div>
                {availableAnimations.map((animName) => {
                  const isActive = activeAnimationName === animName;
                  return (
                    <button
                      key={animName}
                      onClick={() => {
                        if (onSelectAnimation) onSelectAnimation(animName);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-zinc-900/80 hover:bg-zinc-800/90 text-zinc-300 border border-zinc-800/60'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1.5">
                        <Play className={`w-3 h-3 ${isActive ? 'text-cyan-400 fill-cyan-400' : 'text-zinc-500'}`} />
                        {animName}
                      </span>
                      {animName.includes('Jump') && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                          SPACE
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Upload BVH Button */}
              <div className="pt-2 border-t border-zinc-800">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".bvh"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition-all active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Load Any .BVH File</span>
                </button>
                <div className="text-[10px] text-zinc-400 text-center mt-1.5">
                  Upload custom motion capture files (.bvh)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toggle Running HUD Button */}
        <button
          onClick={onToggleRunning}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xl active:scale-95 ${
            isRunning
              ? 'bg-amber-500/90 hover:bg-amber-400 border-amber-300 text-zinc-950 shadow-amber-500/30'
              : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700 text-zinc-300 backdrop-blur-md'
          }`}
          title="Toggle between Walking and Running mode (or hold SHIFT)"
        >
          <Zap className={`w-3.5 h-3.5 ${isRunning ? 'text-zinc-950 fill-zinc-950' : 'text-amber-400'}`} />
          <span>{isRunning ? 'RUN (ON)' : 'WALK (OFF)'}</span>
        </button>

        {/* Jump Button in Desktop HUD */}
        <button
          onClick={() => {
            if (onJumpRequested) onJumpRequested();
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 text-xs font-mono font-bold transition-all shadow-xl active:scale-95 backdrop-blur-md"
          title="Perform Jump with character animation"
        >
          <span>JUMP</span>
          <span className="text-[9px] bg-cyan-900/80 px-1 rounded text-cyan-200">SPACE</span>
        </button>

        <div className="hidden md:flex items-center gap-2 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-lg px-3 py-1.5 shadow-2xl text-[11px] font-mono text-zinc-300 pointer-events-none">
          <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span><strong className="text-white">W:</strong> Forward</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">A/D:</strong> Turn</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">S:</strong> Back</span>
          <span className="text-zinc-600">|</span>
          <span><strong className="text-white">SPACE:</strong> Jump</span>
        </div>
      </div>

      {/* 3D In-World Elevator Interaction Hint */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 bg-amber-950/80 border border-amber-500/60 rounded-full px-4 py-1.5 shadow-2xl text-xs font-mono text-amber-200 backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span><strong className="text-white bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-400/50">E</strong> or <strong className="text-white bg-amber-500/30 px-1.5 py-0.5 rounded border border-amber-400/50">0-9</strong>: Press 3D Scene Elevator Buttons</span>
      </div>

      {/* Toast Notification for BVH Loading */}
      {bvhNotification && (
        <div className="absolute top-14 right-4 z-40 bg-cyan-950/95 border border-cyan-500/70 text-cyan-200 px-3.5 py-2 rounded-lg shadow-2xl font-mono text-xs flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <Film className="w-4 h-4 text-cyan-400" />
          <span>{bvhNotification}</span>
        </div>
      )}

      {/* Mobile Touch Joystick & Action Buttons (Bottom Left & Bottom Right) */}
      <div className="absolute bottom-6 left-6 z-30 pointer-events-auto md:hidden select-none">
        <div
          ref={joystickContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="w-28 h-28 rounded-full bg-zinc-950/70 border-2 border-cyan-500/40 backdrop-blur-md flex items-center justify-center relative shadow-2xl touch-none"
        >
          <div className="w-10 h-10 rounded-full bg-cyan-500/30 border border-cyan-400/80" />
          <div
            style={{
              transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
            }}
            className="w-12 h-12 rounded-full bg-cyan-400 shadow-lg shadow-cyan-500/50 absolute top-1/2 left-1/2 -mt-6 -ml-6 transition-transform duration-75 pointer-events-none"
          />
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-30 pointer-events-auto md:hidden select-none flex items-center gap-3">
        {/* Mobile Run Toggle Button */}
        <button
          onClick={onToggleRunning}
          className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-xs uppercase shadow-2xl transition-all active:scale-95 ${
            isRunning
              ? 'bg-amber-500 border-amber-300 text-zinc-950 shadow-amber-500/50'
              : 'bg-zinc-950/80 border-zinc-700 text-zinc-300 backdrop-blur-md'
          }`}
        >
          {isRunning ? 'RUN' : 'WALK'}
        </button>

        {/* Mobile Jump Button */}
        <button
          onClick={() => {
            if (onJumpRequested) onJumpRequested();
          }}
          className="w-16 h-16 rounded-full border-2 border-cyan-400 bg-cyan-500/80 text-zinc-950 active:scale-95 font-bold text-xs uppercase shadow-2xl shadow-cyan-500/50 backdrop-blur-md flex items-center justify-center transition-all"
        >
          JUMP
        </button>
      </div>
    </>
  );
};
