import { ConnectionMode } from "../model/types";
import { setShortcutsOpen } from "../state/feedback";
import { store, Tool } from "../state/store";
import { useStore } from "../state/useStore";
import { Button, cx, Keycap, SegmentedOption, Segmented, Stepper } from "./components/controls";

/**
 * Row 2 — everything touched while building. The active tool is the only
 * accent-filled control in the shell, so "which mode am I in" is answered by
 * colour mass in peripheral vision rather than by reading.
 */

interface ToolOption {
  id: Tool;
  label: string;
  shortcut: string;
  hint: string;
}

export const TOOL_OPTIONS: readonly ToolOption[] = [
  { id: "select", label: "Select", shortcut: "1", hint: "Click, box-select, drag to move" },
  { id: "add", label: "Add", shortcut: "2", hint: "Click to place · Ctrl+click chains" },
  { id: "connect", label: "Connect", shortcut: "3", hint: "Click two waypoints · click again cycles type" },
  {
    id: "gridroute",
    label: "Grid route",
    shortcut: "4",
    hint: "Node at every grid crossing between two waypoints",
  },
] as const;

const CONNECTION_OPTIONS: readonly SegmentedOption<ConnectionMode>[] = [
  { id: "oneway", label: "One-way", hint: "A → B", sample: <span className="line-sample oneway" /> },
  { id: "dual", label: "Two-way", hint: "A ↔ B", sample: <span className="line-sample dual" /> },
  {
    id: "reverse",
    label: "Reverse",
    hint: "A → B driving backwards",
    sample: <span className="line-sample reverse" />,
  },
] as const;

const GRID_STEPS = [0.5, 1, 2, 2.5, 4, 5, 8, 10, 16, 20, 25, 32, 50];

export function Toolbar() {
  const state = useStore();
  const placing = state.placement !== null;

  return (
    <div className="toolstrip">
      <div className="strip-group" role="radiogroup" aria-label="Tool">
        {TOOL_OPTIONS.map((tool) => (
          <button
            key={tool.id}
            role="radio"
            aria-checked={state.tool === tool.id}
            title={`${tool.hint} (${tool.shortcut})`}
            className={cx("btn", "tool-btn", state.tool === tool.id && "active")}
            onClick={() => selectTool(tool.id)}
          >
            <span className="tool-label">{tool.label}</span>
            <Keycap>{tool.shortcut}</Keycap>
          </button>
        ))}
        {/* placement joins the group rather than replacing a tool, so the exclusive set stays intact */}
        {placing && (
          <span className="mode-chip">
            Placing blueprint <Keycap>Esc</Keycap>
          </span>
        )}
      </div>

      <div className="strip-group">
        <span className="eyebrow">Draw</span>
        <Segmented
          ariaLabel="Connection type"
          options={CONNECTION_OPTIONS}
          value={state.settings.connectionMode}
          onChange={(mode) => store.update((s) => (s.settings.connectionMode = mode))}
        />
      </div>

      <div className="strip-group">
        <span className="eyebrow">Grid</span>
        <Stepper
          ariaLabel="grid size"
          value={state.settings.gridSize}
          format={(value) => `${value} m`}
          onStep={(direction) =>
            store.update((s) => (s.settings.gridSize = stepGrid(s.settings.gridSize, direction)))
          }
        />
        <button
          className={cx("snap-toggle", state.settings.snapEnabled && "on")}
          title="Snap waypoints to the grid (G)"
          aria-pressed={state.settings.snapEnabled}
          onClick={() => store.update((s) => (s.settings.snapEnabled = !s.settings.snapEnabled))}
        >
          <span className="pip" />
          Snap
          <Keycap>G</Keycap>
        </button>
      </div>

      {/* undo/redo and help sit far from the tools they would be confused with */}
      <div className="strip-group push-right">
        <Button variant="ghost" title="Undo (Ctrl+Z)" onClick={() => store.undo()}>
          Undo
        </Button>
        <Button variant="ghost" title="Redo (Ctrl+Y)" onClick={() => store.redo()}>
          Redo
        </Button>
        <Button
          variant="ghost"
          shortcut="?"
          title="Keyboard shortcuts"
          onClick={() => setShortcutsOpen(true)}
        >
          Shortcuts
        </Button>
      </div>
    </div>
  );
}

export function selectTool(tool: Tool): void {
  store.update((s) => {
    s.tool = tool;
    s.pendingConnectFrom = null;
    s.placement = null;
  });
}

/** Grid sizes players actually use, rather than free-form decimals. */
export function stepGrid(current: number, direction: -1 | 1): number {
  const index = GRID_STEPS.findIndex((step) => step >= current - 1e-9);
  const next = index === -1 ? GRID_STEPS.length - 1 : index + direction;
  return GRID_STEPS[Math.min(Math.max(next, 0), GRID_STEPS.length - 1)];
}
