/**
 * Destroyer Engine - WebGPU Device & Adapter Manager
 * Robust mobile browser resilience, multi-tier fallback, and device loss management.
 */

export interface DeviceInitResult {
  device: GPUDevice;
  adapter: GPUAdapter;
  hasSubgroups: boolean;
  subgroupMinSize: number;
  subgroupMaxSize: number;
  presentationFormat: GPUTextureFormat;
}

export type DeviceLostCallback = (info: GPUDeviceLostInfo) => void;

export class DeviceManager {
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat = 'bgra8unorm';
  private hasSubgroups = false;
  private subgroupMinSize = 4;
  private subgroupMaxSize = 64;
  private isLost = false;
  private deviceLostCallbacks: DeviceLostCallback[] = [];

  get isDeviceLost(): boolean {
    return this.isLost;
  }

  onDeviceLost(cb: DeviceLostCallback): () => void {
    this.deviceLostCallbacks.push(cb);
    return () => {
      this.deviceLostCallbacks = this.deviceLostCallbacks.filter((c) => c !== cb);
    };
  }

  async init(preferSubgroups = true): Promise<DeviceInitResult> {
    this.isLost = false;

    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new Error(
        'WebGPU is not supported in this browser. Please use Chrome, Edge, or Safari with WebGPU enabled.'
      );
    }

    // Helper to request adapter across preference levels
    const tryGetAdapter = async (): Promise<GPUAdapter | null> => {
      const isMobile =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

      // On mobile devices, low-power is the primary SoC GPU adapter
      if (isMobile) {
        try {
          const a = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
          if (a) return a;
        } catch (e) {
          console.warn('requestAdapter low-power (mobile):', e);
        }
      }

      // 1. Default adapter
      try {
        const a = await navigator.gpu.requestAdapter();
        if (a) return a;
      } catch (e) {
        console.warn('requestAdapter default:', e);
      }

      // 2. Low-power adapter (desktop fallback)
      if (!isMobile) {
        try {
          const a = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
          if (a) return a;
        } catch (e) {
          console.warn('requestAdapter low-power:', e);
        }
      }

      // 3. High-performance adapter
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (a) return a;
      } catch (e) {
        console.warn('requestAdapter high-performance:', e);
      }

      // 4. Software fallback adapter
      try {
        const a = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
        if (a) return a;
      } catch (e) {
        console.warn('requestAdapter fallback:', e);
      }

      return null;
    };

    let adapter: GPUAdapter | null = await tryGetAdapter();

    // On mobile devices after reload or tab switch, GPU service may need a moment to settle
    if (!adapter) {
      const delays = [200, 400, 600, 900, 1200];
      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        adapter = await tryGetAdapter();
        if (adapter) break;
      }
    }

    if (!adapter) {
      throw new Error(
        'No compatible WebGPU adapter found. Please verify your browser supports WebGPU and hardware acceleration is enabled.'
      );
    }

    this.adapter = adapter;
    this.hasSubgroups = preferSubgroups && adapter.features.has('subgroups' as GPUFeatureName);

    // Acquire device - Safe standard device acquisition
    let device: GPUDevice | null = null;
    try {
      device = await adapter.requestDevice();
    } catch (err: any) {
      console.warn('Primary requestDevice failed, attempting recovery after pause:', err);
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        const freshAdapter = await tryGetAdapter();
        if (freshAdapter) {
          this.adapter = freshAdapter;
          device = await freshAdapter.requestDevice();
        }
      } catch (recoveryErr: any) {
        console.error('Recovery requestDevice failed:', recoveryErr);
        throw new Error(`WebGPU requestDevice failed: ${recoveryErr?.message || err?.message || String(recoveryErr)}`);
      }
    }

    if (!device) {
      throw new Error('Failed to acquire WebGPU device.');
    }

    this.device = device;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    // Listen to device loss
    device.lost.then((info) => {
      console.warn(`[WebGPU Device Lost]: reason=${info.reason}, message=${info.message}`);
      this.isLost = true;
      this.device = null;
      this.deviceLostCallbacks.forEach((cb) => {
        try {
          cb(info);
        } catch (e) {
          console.error('Error in device lost callback:', e);
        }
      });
    });

    return {
      device: this.device,
      adapter: this.adapter,
      hasSubgroups: this.hasSubgroups,
      subgroupMinSize: this.subgroupMinSize,
      subgroupMaxSize: this.subgroupMaxSize,
      presentationFormat: this.presentationFormat,
    };
  }

  configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
    if (!this.device || this.isLost) {
      throw new Error('Device not initialized or device was lost.');
    }
    const ctx = canvas.getContext('webgpu');
    if (!ctx) {
      throw new Error('Failed to acquire WebGPU canvas context.');
    }

    this.context = ctx;

    // Use opaque as standard for rock-solid 3D canvas compositing on mobile & desktop Chrome
    try {
      ctx.configure({
        device: this.device,
        format: this.presentationFormat,
        alphaMode: 'opaque',
      });
    } catch (err) {
      console.warn('Opaque configure failed, trying premultiplied fallback:', err);
      try {
        ctx.configure({
          device: this.device,
          format: this.presentationFormat,
          alphaMode: 'premultiplied',
        });
      } catch (err2) {
        console.error('Canvas configure failed:', err2);
      }
    }

    return ctx;
  }

  getDevice(): GPUDevice {
    if (!this.device || this.isLost) {
      throw new Error('Device not initialized or device was lost.');
    }
    return this.device;
  }

  getContext(): GPUCanvasContext {
    if (!this.context) {
      throw new Error('Context not initialized.');
    }
    return this.context;
  }

  getFormat(): GPUTextureFormat {
    return this.presentationFormat;
  }

  getSubgroupInfo() {
    return {
      supported: this.hasSubgroups,
      minSize: this.subgroupMinSize,
      maxSize: this.subgroupMaxSize,
    };
  }

  dispose(): void {
    if (this.context) {
      try {
        this.context.unconfigure();
      } catch {
        // ignore
      }
      this.context = null;
    }
    // We intentionally do not call this.device.destroy() during reload/restore
    // because tearing down the IPC channel in Chromium causes subsequent requestAdapter
    // and requestDevice calls to fail with 'No compatible WebGPU adapter found'.
    this.device = null;
    this.isLost = true;
  }
}
