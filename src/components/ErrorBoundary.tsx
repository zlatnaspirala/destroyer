/**
 * Destroyer Engine - Global Error Boundary
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Destroyer ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-lg font-bold">Destroyer WebGPU Diagnostic</h2>
            </div>
            <p className="text-xs text-zinc-400">
              A runtime initialization error occurred. If you are on a mobile browser without WebGPU enabled, please check WebGPU settings.
            </p>
            <div className="bg-zinc-950 p-3 rounded font-mono text-[11px] text-rose-300 border border-rose-950 overflow-x-auto">
              {this.state.error?.message || 'Unknown WebGPU context failure.'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Engine
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
