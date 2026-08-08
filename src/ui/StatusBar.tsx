import { useStore } from "../state/useStore";
import { cx } from "./components/controls";

/**
 * One line, left to right: what just happened, then cursor, zoom, node count,
 * snap. Never scrolls, never wraps — the cursor readout is the first to go
 * when the window is narrow, because the canvas hint carries it too.
 */
export function StatusBar({ cursor }: { cursor: { x: number; z: number } }) {
  const state = useStore();

  return (
    <footer className="statusbar">
      {state.blueprintEdit && <span className="mode-chip-sm">BLUEPRINT</span>}
      <span className="message">{state.statusMessage}</span>

      <div className="readouts">
        <span className="field cursor-readout">
          <span className="key">x</span>
          <span className="val">{cursor.x.toFixed(1)}</span>
          <span className="key">z</span>
          <span className="val">{cursor.z.toFixed(1)}</span>
        </span>
        <span className="field">
          <span className="val">{state.view.scale.toFixed(1)}</span>
          <span className="key">px/m</span>
        </span>
        <span className="field">
          <span className="val">{formatCount(state.network.waypoints.size)}</span>
          <span className="key">nodes</span>
        </span>
        <span className={cx("snap-state", !state.settings.snapEnabled && "off")}>
          <span className="dot" />
          {state.settings.snapEnabled ? `Snap ${state.settings.gridSize} m` : "Snap off"}
        </span>
      </div>
    </footer>
  );
}

/**
 * Space every three digits, so four-digit counts stay scannable. Grouped by
 * hand rather than through Intl, whose separator varies by environment.
 */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
