import { Component, type ReactNode } from 'react';

/**
 * Last-resort safety net: if a screen crashes, show a friendly message instead of a blank page.
 * Reloading is always safe: the saved session token puts the player straight back in their seat.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('UI crashed:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-night-950 px-6 text-center text-snow">
        <h1 className="font-display text-2xl uppercase">Something broke</h1>
        <p className="max-w-xs text-sm text-night-300">
          Reload the page. You'll go straight back to your seat with the same role and score.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-12 rounded-2xl bg-elf px-6 font-bold text-night-950"
        >
          Reload the game
        </button>
      </div>
    );
  }
}
