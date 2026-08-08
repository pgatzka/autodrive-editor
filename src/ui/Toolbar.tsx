import { newConfig, openConfig, saveConfig } from "../files/fileio";
import { ConnectionMode } from "../model/types";
import { store, Tool } from "../state/store";
import { useStore } from "../state/useStore";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "1 — click/box select, drag to move" },
  { id: "add", label: "Add nodes", hint: "2 — click to place, Ctrl+click chains" },
  { id: "connect", label: "Connect", hint: "3 — click two nodes; again to cycle type" },
  { id: "gridroute", label: "Grid route", hint: "4 — connect two nodes, node at every grid crossing" },
];

const MODES: { id: ConnectionMode; label: string; hint: string }[] = [
  { id: "oneway", label: "One-way", hint: "A → B" },
  { id: "dual", label: "Two-way", hint: "A ↔ B" },
  { id: "reverse", label: "Reverse", hint: "A → B driving backwards" },
];

export function Toolbar() {
  const s = useStore();
  return (
    <div className="toolbar">
      <div className="tool-group">
        <button onClick={() => newConfig()}>New</button>
        <button onClick={() => void openConfig()}>Open…</button>
        <button onClick={() => void saveConfig(false)}>Save{s.dirty ? " *" : ""}</button>
        <button onClick={() => void saveConfig(true)}>Save As…</button>
      </div>

      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.hint}
            className={s.tool === t.id ? "active" : ""}
            onClick={() =>
              store.update((st) => {
                st.tool = t.id;
                st.pendingConnectFrom = null;
                st.placement = null;
              })
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tool-group">
        <span className="label">Connection:</span>
        {MODES.map((m) => (
          <button
            key={m.id}
            title={m.hint}
            className={s.settings.connectionMode === m.id ? "active" : ""}
            onClick={() => store.update((st) => (st.settings.connectionMode = m.id))}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="tool-group">
        <span className="label">Grid:</span>
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={s.settings.gridSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) store.update((st) => (st.settings.gridSize = v));
          }}
          style={{ width: 56 }}
        />
        <span className="label">m</span>
        <button
          className={s.settings.snapEnabled ? "active" : ""}
          title="G — snap nodes to the grid"
          onClick={() => store.update((st) => (st.settings.snapEnabled = !st.settings.snapEnabled))}
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
