/**
 * Destroyer Engine - WebGPU Game Playground Main App
 * Features:
 * - 3D Canvas ALWAYS visible and rendered continuously on the main view
 * - Integrated dockable Left Panel (Scene Hierarchy & Outliner)
 * - Integrated dockable Right Panel (System & Lighting Controls + Object Inspector)
 * - Real-time interaction: tweak lighting, shaders, and materials while viewing 3D scene
 * - Mobile-resilient WebGPU lifecycle with automatic device loss recovery
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BackendWorkspaceEditor } from './components/BackendWorkspaceEditor';
import { Navigation } from './components/Navigation';
import { ObjectPropertiesPanel } from './components/ObjectPropertiesPanel';
import { SystemPanel } from './components/SystemPanel';
import { ViewportHUD } from './components/ViewportHUD';
import { DestroyerEngine, isMobileBrowser } from './engine/DestroyerEngine';
import { EngineStats } from './engine/core/Types';
import { AlertTriangle, RefreshCw, Smartphone, Cpu, Sliders, X } from 'lucide-react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DestroyerEngine | null>(null);
  const isInitializingRef = useRef(false);

  // Main-view panel dock visibility
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(() => !isMobileBrowser());
  const [showRightPanel, setShowRightPanel] = useState<boolean>(() => !isMobileBrowser());
  const [rightPanelTab, setRightPanelTab] = useState<'system' | 'inspector'>('system');

  const [currentPreset, setCurrentPreset] = useState('anarchy');
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [isDeviceLost, setIsDeviceLost] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [cameraMode, setCameraMode] = useState<'ORBIT' | 'FPS' | 'FLY'>('ORBIT');
  const [isRunning, setIsRunning] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [initRetryKey, setInitRetryKey] = useState(0);
  const [elevatorTargetFloor, setElevatorTargetFloor] = useState(0);
  const [activeAnimationName, setActiveAnimationName] = useState('Human_Walk_Cycle');
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([
    'Human_Walk_Cycle',
    'BVH_Jump_Mocap',
    'BVH_Idle_Mocap',
  ]);

  // Stats state
  const [stats, setStats] = useState<EngineStats>({
    fps: 60,
    frameTimeMs: 16.6,
    gpuCullTimeMs: 0.2,
    gpuRenderTimeMs: 1.4,
    totalInstances: 0,
    visibleInstances: 0,
    culledInstances: 0,
    subgroupsSupported: false,
    subgroupsActive: false,
    subgroupMinSize: 4,
    subgroupMaxSize: 64,
    totalVertices: 0,
    totalTriangles: 0,
    indirectDrawCommands: 0,
    bufferMemoryBytes: 0,
  });

  // Touch & Pointer state for orbit controls
  const pointerState = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    button: 0,
  });

  // Handle restoring lost device
  const handleRestoreDevice = useCallback(async () => {
    if (!engineRef.current || isRestoring) return;
    setIsRestoring(true);
    try {
      const res = await engineRef.current.restoreDevice();
      if (res.success) {
        setIsDeviceLost(false);
        setInitError(null);
        setIsEngineReady(true);
      } else {
        setInitError(res.error || 'Failed to restore WebGPU device.');
      }
    } catch (err: any) {
      console.error('Error during device restore:', err);
      setInitError(err?.message || 'Restore failed.');
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring]);

  // Handle in-place retry connection with GPU recovery backoff
  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetryInit = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setInitError(null);
    setIsEngineReady(false);
    setIsDeviceLost(false);

    if (engineRef.current) {
      try {
        engineRef.current.stop();
        engineRef.current.deviceManager.dispose();
      } catch {
        // ignore
      }
      engineRef.current = null;
    }
    isInitializingRef.current = false;

    // Small delay to let mobile GPU recover
    await new Promise((r) => setTimeout(r, 400));
    setIsRetrying(false);
    setInitRetryKey((k) => k + 1);
  }, [isRetrying]);

  // Trigger engine resize safely
  const triggerResize = useCallback(() => {
    if (canvasRef.current && engineRef.current && !engineRef.current.isDeviceLost) {
      const rect = canvasRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const w = Math.max(1, Math.floor((rect.width || window.innerWidth || 800) * dpr));
      const h = Math.max(1, Math.floor((rect.height || window.innerHeight || 600) * dpr));
      canvasRef.current.width = w;
      canvasRef.current.height = h;
      engineRef.current.resize(w, h);
    }
  }, []);

  // Initialize engine
  useEffect(() => {
    let cancelled = false;
    let statsInterval: any = null;

    const runInit = async () => {
      if (!canvasRef.current || engineRef.current || isInitializingRef.current || cancelled) return;
      isInitializingRef.current = true;

      try {
        const engine = new DestroyerEngine();

        // Listen for device lost
        engine.onDeviceLost = () => {
          setIsDeviceLost(true);
        };

        const res = await engine.init({
          canvas: canvasRef.current,
          enableSubgroups: true,
          enableCulling: false,
        });

        if (cancelled) {
          try {
            engine.stop();
            engine.deviceManager.dispose();
          } catch {
            // ignore
          }
          return;
        }

        if (!res.success) {
          setInitError(res.error || 'Failed to initialize WebGPU.');
          isInitializingRef.current = false;
          return;
        }

        engineRef.current = engine;
        await engine.loadScenePreset('anarchy');
        engine.start();
        triggerResize();
        setIsEngineReady(true);
        setIsDeviceLost(false);
        setSelectedEntityId(0);
        setAvailableAnimations(engine.getAvailableAnimations());
        setActiveAnimationName(engine.animController.getCurrentClipName());
        isInitializingRef.current = false;

        // Periodic stats update
        statsInterval = setInterval(() => {
          if (engineRef.current && !cancelled) {
            setStats({ ...engineRef.current.stats });
          }
        }, 150);
      } catch (err: any) {
        console.error('Engine init crash:', err);
        if (!cancelled) setInitError(err?.message || String(err));
        isInitializingRef.current = false;
      }
    };

    const startCheck = () => {
      if (canvasRef.current) {
        runInit();
      } else if (!cancelled) {
        requestAnimationFrame(startCheck);
      }
    };

    startCheck();

    return () => {
      cancelled = true;
      isInitializingRef.current = false;
      if (statsInterval) clearInterval(statsInterval);
      if (engineRef.current) {
        try {
          engineRef.current.stop();
          engineRef.current.deviceManager.dispose();
        } catch {
          // ignore
        }
        engineRef.current = null;
      }
    };
  }, [initRetryKey]);

  // Handle visibility changes (reconnect on tab switch)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && engineRef.current?.isDeviceLost) {
        handleRestoreDevice();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [handleRestoreDevice]);

  // Window resize & orientation change handler
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    if (canvasRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => triggerResize());
      resizeObserver.observe(canvasRef.current);
    }

    window.addEventListener('resize', triggerResize);
    window.addEventListener('orientationchange', triggerResize);
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', triggerResize);
      window.removeEventListener('orientationchange', triggerResize);
    };
  }, [triggerResize]);

  // Whenever panels toggle, trigger canvas resize after transition
  useEffect(() => {
    const timeout = setTimeout(() => {
      triggerResize();
    }, 150);
    return () => clearTimeout(timeout);
  }, [showLeftPanel, showRightPanel, triggerResize]);

  // Handle Preset Selection
  const handleSelectPreset = async (preset: string) => {
    setCurrentPreset(preset);
    if (engineRef.current && !engineRef.current.isDeviceLost) {
      await engineRef.current.loadScenePreset(preset);
      setSelectedEntityId(0);
      setAvailableAnimations(engineRef.current.getAvailableAnimations());
      setActiveAnimationName(engineRef.current.animController.getCurrentClipName());
      setSceneVersion((v) => v + 1);
    }
  };

  // Handle GLB Load
  const handleLoadGLB = async (buffer: ArrayBuffer, fileName: string) => {
    if (engineRef.current && !engineRef.current.isDeviceLost) {
      await engineRef.current.loadCustomGLB(buffer, fileName);
      setSelectedEntityId(0);
      setSceneVersion((v) => v + 1);
    }
  };

  // Handle Spawn Cube
  const handleSpawnCube = () => {
    if (engineRef.current && !engineRef.current.isDeviceLost) {
      const newId = engineRef.current.spawnProceduralCube();
      if (newId >= 0) {
        setSelectedEntityId(newId);
        setRightPanelTab('inspector');
        setShowRightPanel(true);
        setSceneVersion((v) => v + 1);
      }
    }
  };

  // Select entity and open inspector
  const handleSelectEntity = (id: number) => {
    setSelectedEntityId(id);
    setRightPanelTab('inspector');
    setShowRightPanel(true);
  };

  // Pointer & Touch Controls for 3D Viewport
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerState.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      button: e.button,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (engineRef.current && currentPreset === 'anarchy') {
      engineRef.current.playerController.handlePointerDown(e.clientX, e.clientY, e.button);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerState.current.isDown || !engineRef.current || engineRef.current.isDeviceLost) return;

    const dx = e.clientX - pointerState.current.lastX;
    const dy = e.clientY - pointerState.current.lastY;
    pointerState.current.lastX = e.clientX;
    pointerState.current.lastY = e.clientY;

    if (currentPreset === 'anarchy') {
      engineRef.current.playerController.handlePointerMove(e.clientX, e.clientY);
    } else {
      const camera = engineRef.current.camera;
      if (pointerState.current.button === 0) {
        camera.orbit(-dx * 0.006, -dy * 0.006);
      } else if (pointerState.current.button === 2 || pointerState.current.button === 1) {
        const speed = camera.radius * 0.002;
        camera.target[0] -= dx * speed;
        camera.target[1] += dy * speed;
        camera.updatePositionFromSpherical();
        camera.updateMatrices();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerState.current.isDown && engineRef.current && currentPreset === 'anarchy' && canvasRef.current) {
      const distMoved = Math.hypot(e.clientX - pointerState.current.startX, e.clientY - pointerState.current.startY);
      if (distMoved < 8) {
        const rect = canvasRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        engineRef.current.playerController.handleCanvasClick(clientX, clientY, rect.width, rect.height);
      }
    }
    pointerState.current.isDown = false;
    if (engineRef.current && currentPreset === 'anarchy') {
      engineRef.current.playerController.handlePointerUp();
    }
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!engineRef.current || engineRef.current.isDeviceLost) return;
    const delta = e.deltaY * 0.02;
    if (currentPreset === 'anarchy') {
      engineRef.current.playerController.handleZoom(delta);
    } else {
      engineRef.current.camera.zoom(delta * 2);
    }
  };

  const handleCameraModeChange = (mode: 'ORBIT' | 'FPS' | 'FLY') => {
    setCameraMode(mode);
    if (engineRef.current) {
      engineRef.current.camera.setMode(mode);
    }
  };

  const handleResetCamera = () => {
    if (engineRef.current) {
      engineRef.current.camera.position = [0, 8, 22];
      engineRef.current.camera.target = [0, 1, 0];
      engineRef.current.camera.radius = 22;
      engineRef.current.camera.theta = 0.5;
      engineRef.current.camera.phi = 0.45;
      engineRef.current.camera.updatePositionFromSpherical();
      engineRef.current.camera.updateMatrices();
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-zinc-950 text-zinc-100 overflow-hidden select-none font-sans">
      {/* Top Navigation Bar with Direct Panel Toggles */}
      <Navigation
        showLeftPanel={showLeftPanel}
        onToggleLeftPanel={() => setShowLeftPanel((prev) => !prev)}
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel((prev) => !prev)}
        rightPanelTab={rightPanelTab}
        onSetRightPanelTab={setRightPanelTab}
        currentPreset={currentPreset}
        onSelectPreset={handleSelectPreset}
        onResetCamera={handleResetCamera}
        onSpawnCube={handleSpawnCube}
        fps={stats.fps}
        subgroupsActive={stats.subgroupsActive}
      />

      {/* Main View Area: Docked Panels around the Continuously Running 3D Canvas */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT PANEL: Scene Hierarchy & Outliner (Responsive floating drawer on mobile) */}
        {showLeftPanel && (
          <aside className="md:relative absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] h-full shrink-0 z-30 border-r border-zinc-800 bg-zinc-950/95 flex flex-col shadow-2xl backdrop-blur-md">
            <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60 shrink-0">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Hierarchy Outliner
              </span>
              <button
                onClick={() => setShowLeftPanel(false)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
                title="Collapse Hierarchy"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <BackendWorkspaceEditor
                key={`hierarchy-${sceneVersion}`}
                entityManager={engineRef.current?.entityManager ?? null}
                selectedEntityId={selectedEntityId}
                onSelectEntity={handleSelectEntity}
                onSpawnCube={handleSpawnCube}
                onLoadGLB={handleLoadGLB}
                onUpdate={() => setSceneVersion((v) => v + 1)}
              />
            </div>
          </aside>
        )}

        {/* CENTER: 3D WebGPU Viewport Canvas (Always mounted and visible) */}
        <main className="flex-1 min-w-0 min-h-0 h-full relative overflow-hidden bg-zinc-950">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full block touch-none cursor-grab active:cursor-grabbing bg-zinc-950"
          />

          {/* Loading Indicator */}
          {!isEngineReady && !initError && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 pointer-events-none z-10">
              <div className="flex flex-col items-center gap-2.5 text-zinc-300 font-mono text-xs">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                <span className="tracking-wider">STARTING WEBGPU ENGINE...</span>
              </div>
            </div>
          )}

          {/* Device Lost Alert Banner */}
          {isDeviceLost && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-950/95 border border-amber-500/80 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md flex items-center gap-3.5 text-xs max-w-md w-[92%] font-sans">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-amber-100">WebGPU Device Reset</div>
                <div className="text-[11px] text-amber-200/80 mt-0.5">
                  Mobile OS reset the GPU or tab was switched.
                </div>
              </div>
              <button
                onClick={handleRestoreDevice}
                disabled={isRestoring}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-bold rounded-lg text-xs transition-all shrink-0 flex items-center gap-1.5 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
              </button>
            </div>
          )}

          {/* Error Overlay if WebGPU not supported */}
          {initError && !isDeviceLost && (
            <div className="absolute inset-0 bg-zinc-950/95 flex items-center justify-center p-6 z-50">
              <div className="max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">WebGPU Setup</h3>
                <p className="text-xs text-zinc-400 text-left">
                  WebGPU is supported in modern desktop and mobile browsers. If your browser requires enabling WebGPU flags:
                </p>
                <div className="text-left bg-zinc-950 p-3 rounded text-[11px] text-zinc-300 space-y-1.5 border border-zinc-800 font-mono">
                  <div>1. Chrome: open <span className="text-cyan-400">chrome://flags</span></div>
                  <div>2. Search for <span className="text-cyan-400">"WebGPU"</span> and set to <span className="text-emerald-400">Enabled</span></div>
                  <div>3. Tap Relaunch browser</div>
                </div>
                <div className="p-2.5 bg-zinc-950 rounded text-[11px] font-mono text-rose-300 border border-zinc-800 text-left overflow-x-auto">
                  {initError}
                </div>
                <div className="flex items-center justify-center gap-2.5">
                  <button
                    onClick={handleRetryInit}
                    disabled={isRetrying}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shadow"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    <span>{isRetrying ? 'Reconnecting...' : 'Retry Connection'}</span>
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors border border-zinc-700"
                  >
                    Hard Reload
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live Telemetry HUD Overlay */}
          {isEngineReady && !isDeviceLost && (
            <ViewportHUD
              stats={stats}
              cameraMode={cameraMode}
              onCameraModeChange={handleCameraModeChange}
              onResetCamera={handleResetCamera}
              isRunning={isRunning}
              onToggleRunning={() => {
                if (engineRef.current) {
                  const nextState = engineRef.current.playerController.toggleRunning();
                  setIsRunning(nextState);
                }
              }}
              onJoystickMove={(x, y) => {
                if (engineRef.current) {
                  engineRef.current.playerController.joystickVec = [x, y];
                }
              }}
              onJumpRequested={() => {
                if (engineRef.current) {
                  engineRef.current.playerController.jumpRequested = true;
                }
              }}
              onLoadBVH={(bvhText, name) => {
                if (engineRef.current) {
                  const res = engineRef.current.loadBVHAnimation(bvhText, name);
                  if (res.success) {
                    setAvailableAnimations(engineRef.current.getAvailableAnimations());
                    setActiveAnimationName(res.clipName);
                  }
                }
              }}
              onSelectAnimation={(clipName) => {
                if (engineRef.current) {
                  engineRef.current.switchAnimation(clipName);
                  setActiveAnimationName(clipName);
                }
              }}
              availableAnimations={availableAnimations}
              activeAnimationName={activeAnimationName}
              elevatorTargetFloor={elevatorTargetFloor}
              onSelectElevatorFloor={(floor) => {
                setElevatorTargetFloor(floor);
                if (engineRef.current?.physics) {
                  engineRef.current.physics.setElevatorTargetFloor(floor);
                }
              }}
            />
          )}
        </main>

        {/* RIGHT PANEL: System & Graphics Controls OR Object Inspector (Responsive floating drawer on mobile) */}
        {showRightPanel && (
          <aside className="md:relative absolute right-0 top-0 bottom-0 w-80 lg:w-96 max-w-[90vw] h-full shrink-0 z-30 border-l border-zinc-800 bg-zinc-950/95 flex flex-col shadow-2xl backdrop-blur-md">
            {/* Header with Tab Switcher */}
            <div className="h-10 px-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60 shrink-0">
              <div className="flex items-center gap-1 bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800/60">
                <button
                  onClick={() => setRightPanelTab('system')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    rightPanelTab === 'system'
                      ? 'bg-cyan-500 text-zinc-950 font-bold shadow'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>System & GPU</span>
                </button>

                <button
                  onClick={() => setRightPanelTab('inspector')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    rightPanelTab === 'inspector'
                      ? 'bg-cyan-500 text-zinc-950 font-bold shadow'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Inspector</span>
                  {selectedEntityId !== null && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              </div>

              <button
                onClick={() => setShowRightPanel(false)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
                title="Collapse Panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto">
              {rightPanelTab === 'system' ? (
                <SystemPanel
                  renderer={engineRef.current?.renderer ?? null}
                  stats={stats}
                  onUpdate={() => setSceneVersion((v) => v + 1)}
                />
              ) : (
                <ObjectPropertiesPanel
                  selectedEntityId={selectedEntityId}
                  entityManager={engineRef.current?.entityManager ?? null}
                  onClose={() => setSelectedEntityId(null)}
                  onUpdate={() => setSceneVersion((v) => v + 1)}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
