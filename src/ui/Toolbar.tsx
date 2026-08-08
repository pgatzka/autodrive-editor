import { newConfig, openConfig, saveConfig } from "../files/fileio";
import { ConnectionMode } from "../model/types";
import { discardBlueprintEditor, saveBlueprintEditor } from "../state/blueprintSession";
import { store, Tool } from "../state/store";
import { useStore } from "../state/useStore";
import { NumberField, SegmentedButtons, SegmentedOption } from "./components/Field";

/** Tools in shortcut order — keys 1..4 select them. */
export const TOOL_OPTIONS: readonly SegmentedOption<Tool>[] = [
  { id: "select", label: "Select", hint: "1 — click/box select, drag to move" },
  { id: "add", label: "Add nodes", hint: "2 — click to place, Ctrl+click chains" },
  { id: "connect", label: "Connect", hint: "3 — click two nodes; again to cycle type" },
  { id: "gridroute", label: "Grid route", hint: "4 — connect two nodes, node at every grid crossing" },
] as const;

const CONNECTION_OPTIONS: readonly SegmentedOption<ConnectionMode>[] = [
  { id: "oneway", label: "One-way", hint: "A → B" },
  { id: "dual", label: "Two-way", hint: "A ↔ B" },
  { id: "reverse", label: "Reverse", hint: "A → B driving backwards" },
] as const;

export function Toolbar() {
  const state = useStore();

  return (
    <div className="toolbar">
      {state.blueprintEdit ? <BlueprintControls /> : <FileControls dirty={state.dirty} />}

      <div className="tool-group">
        <SegmentedButtons options={TOOL_OPTIONS} value={state.tool} onChange={selectTool} />
      </div>

      <div className="tool-group">
        <span className="label">Connection:</span>
        <SegmentedButtons
          options={CONNECTION_OPTIONS}
          value={state.settings.connectionMode}
          onChange={(mode) => store.update((s) => (s.settings.connectionMode = mode))}
        />
      </div>

      <div className="tool-group">
        <span className="label">Grid:</span>
        <NumberField
          value={state.settings.gridSize}
          min={0.25}
          step={0.25}
          isValid={(value) => value > 0}
          onChange={(value) => store.update((s) => (s.settings.gridSize = value))}
        />
        <span className="label">m</span>
        <button
          className={state.settings.snapEnabled ? "active" : ""}
          title="G — snap nodes to the grid"
          onClick={() => store.update((s) => (s.settings.snapEnabled = !s.settings.snapEnabled))}
        >
          Snap
        </button>
      </div>

      <div className="tool-group">
        <button title="Ctrl+Z" onClick={() => store.undo()}>
          Undo
        </button>
        <button title="Ctrl+Y" onClick={() => store.redo()}>
          Redo
        </button>
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

function FileControls({ dirty }: { dirty: boolean }) {
  return (
    <div className="tool-group">
      <button onClick={() => newConfig()}>New</button>
      <button onClick={() => void openConfig()}>Open…</button>
      <button onClick={() => void saveConfig(false)}>Save{dirty ? " *" : ""}</button>
      <button onClick={() => void saveConfig(true)}>Save As…</button>
    </div>
  );
}

function BlueprintControls() {
  const state = useStore();
  const session = state.blueprintEdit;
  if (!session) return null;

  return (
    <div className="tool-group blueprint-banner">
      <span className="label">Blueprint:</span>
      <input
        value={session.name}
        style={{ width: 160 }}
        onChange={(event) =>
          store.update((s) => {
            if (s.blueprintEdit) s.blueprintEdit = { ...s.blueprintEdit, name: event.target.value };
          })
        }
      />
      <button title="Ctrl+S" onClick={() => saveBlueprintEditor(false)}>
        Save
      </button>
      <button onClick={() => saveBlueprintEditor(true)}>Save &amp; close</button>
      <button className="danger" onClick={() => discardBlueprintEditor()}>
        Discard
      </button>
    </div>
  );
}
