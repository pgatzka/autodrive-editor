import { useState } from "react";
import { exportBlueprintFile, importBlueprintFiles, persistBlueprintLibrary } from "../../files/fileio";
import { captureBlueprint } from "../../model/blueprint";
import { Blueprint } from "../../model/types";
import { enterBlueprintEditor } from "../../state/blueprintSession";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";

export function BlueprintsPanel() {
  const state = useStore();
  const [name, setName] = useState("");
  const editing = state.blueprintEdit;

  const captureSelection = () => {
    const blueprint = captureBlueprint(state.network, state.selection, name.trim());
    if (!blueprint) return;
    store.update((s) => {
      s.blueprints = [...s.blueprints, blueprint];
      s.statusMessage = `Blueprint "${blueprint.name}" saved (${blueprint.nodes.length} nodes)`;
    });
    setName("");
    void persistBlueprintLibrary();
  };

  return (
    <div>
      <h3>Blueprints</h3>
      {editing ? (
        <p className="hint">
          Blueprint editor is open — use the map tools to build it, then Save &amp; close in the toolbar.
        </p>
      ) : (
        <div className="row">
          <button
            title="Open an empty blueprint canvas and build one from scratch with the normal tools"
            onClick={() => enterBlueprintEditor(null)}
          >
            New blueprint
          </button>
          <button onClick={() => void importBlueprintFiles()}>Import…</button>
        </div>
      )}

      <div className="row">
        <input
          placeholder="Name for captured selection"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          disabled={state.selection.size === 0 || !name.trim()}
          title="Save the selected nodes and their connections as a reusable blueprint"
          onClick={captureSelection}
        >
          Capture
        </button>
      </div>

      {state.blueprints.length === 0 && (
        <p className="hint">No blueprints yet. Build one with "New blueprint" or capture a selection.</p>
      )}
      {state.blueprints.map((blueprint, index) => (
        <BlueprintRow
          key={index}
          blueprint={blueprint}
          index={index}
          editable={!editing}
          locked={editing?.index === index}
        />
      ))}
    </div>
  );
}

function BlueprintRow({
  blueprint,
  index,
  editable,
  locked,
}: {
  blueprint: Blueprint;
  index: number;
  editable: boolean;
  locked: boolean;
}) {
  const startPlacing = () =>
    store.update((s) => {
      s.placement = { blueprint, rotation: 0 };
      s.tool = "place";
      s.statusMessage = `Placing "${blueprint.name}" — click to stamp, R rotates, Esc cancels`;
    });

  const remove = () => {
    store.update((s) => {
      s.blueprints = s.blueprints.filter((_, i) => i !== index);
      if (s.blueprintEdit && s.blueprintEdit.index !== null && s.blueprintEdit.index > index) {
        s.blueprintEdit = { ...s.blueprintEdit, index: s.blueprintEdit.index - 1 };
      }
    });
    void persistBlueprintLibrary();
  };

  return (
    <div className="row marker-row">
      <span>
        {blueprint.name} <span className="hint">({blueprint.nodes.length} nodes)</span>
      </span>
      <span>
        <button
          title="Move the mouse over the map, R rotates, click to stamp, Esc to finish"
          onClick={startPlacing}
        >
          Place
        </button>
        {editable && (
          <button
            title="Open this blueprint in the blueprint editor"
            onClick={() => enterBlueprintEditor(index)}
          >
            Edit
          </button>
        )}
        <button onClick={() => void exportBlueprintFile(blueprint)}>Export</button>
        <button className="danger" disabled={locked} onClick={remove}>
          ✕
        </button>
      </span>
    </div>
  );
}
