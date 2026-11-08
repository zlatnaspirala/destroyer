import React, { useState, useRef, useEffect } from 'react';
import {
  Activity,
  Box,
  Camera as CameraIcon,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gamepad2,
  Layers,
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
}

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  stats,
  cameraMode,
  onCameraModeChange,
  onJoystickMove,
  onJumpRequested,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

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
              <span
                className={`text-base sm:text-lg font-bold ${
                  stats.fps >= 55 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {stats.fps}
              </span>
              <span className="text-[10px] text-zinc-400">FPS</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono">
              {stats.frameTimeMs} <span className="text-zinc-500">ms</span>
            </div>
          </div>

          {!isMinimized && (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-zinc-400">
                <span className="flex items-center gap-1">
                  <Box className="w-3 h-3 text-cyan-400" /> Total Instances
                </span>
                <span className="font-semibold text-zinc-200">{stats.totalInstances.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-400" /> Visible / Culled
                </span>
                <span className="font-semibold text-zinc-200">
                  <span className="text-emerald-400">{stats.visibleInstances.toLocaleString()}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-rose-400">{stats.culledInstances.toLocaleString()}</span>
                </span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-indigo-400" /> Triangles
                </span>
                <span className="font-semibold text-zinc-200">{stats.totalTriangles.toLocaleString()}</span>
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

      {/* Top Right: 3rd Person Keyboard Controls Legend */}
      <div className="absolute top-2 right-2 z-20 pointer-events-none hidden md:flex items-center gap-2 bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-lg px-3 py-1.5 shadow-2xl text-[11px] font-mono text-zinc-300 select-none">
        <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span><strong className="text-white">W:</strong> Forward</span>
        <span className="text-zinc-600">|</span>
        <span><strong className="text-white">A / D:</strong> Turn Left/Right</span>
        <span className="text-zinc-600">|</span>
        <span><strong className="text-white">S:</strong> Slow Backpedal</span>
        <span className="text-zinc-600">|</span>
        <span><strong className="text-white">SPACE:</strong> Jump</span>
      </div>

      {/* Mobile Touch Joystick & Jump Button (Bottom Left & Bottom Right) */}
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

      <div className="absolute bottom-6 right-6 z-30 pointer-events-auto md:hidden select-none">
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

