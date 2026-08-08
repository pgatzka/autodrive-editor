import { useState } from "react";
import { exportBlueprintFile, importBlueprintFiles, persistBlueprintLibrary } from "../../files/fileio";
import { captureBlueprint } from "../../model/blueprint";
import { Blueprint } from "../../model/types";
import { enterBlueprintEditor } from "../../state/blueprintSession";
import { showToast } from "../../state/feedback";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, EmptyState, Section } from "../components/controls";

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
    <>
      {editing ? (
        <p className="hint">
          The blueprint workspace is open — build it with the map tools, then Save &amp; close above.
        </p>
      ) : (
        <div className="field-row">
          <Button
            variant="primary"
            wide
            title="Open an empty blueprint canvas and build one from scratch"
            onClick={() => enterBlueprintEditor(null)}
          >
            New blueprint
          </Button>
          <Button onClick={() => void importBlueprintFiles()}>Import…</Button>
        </div>
      )}

      <Section title="Capture selection">
        <div className="field-row">
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={state.selection.size === 0 || !name.trim()}
            title="Save the selected waypoints and their connections as a blueprint"
            onClick={captureSelection}
          >
            Capture
          </Button>
        </div>
      </Section>

      {state.blueprints.length === 0 ? (
        <EmptyState title="No blueprints yet">
          Build one from scratch, or select waypoints on the map and capture them.
        </EmptyState>
      ) : (
        <Section title={`Library · ${state.blueprints.length}`}>
          {state.blueprints.map((blueprint, index) => (
            <BlueprintRow
              key={index}
              blueprint={blueprint}
              index={index}
              editable={!editing}
              locked={editing?.index === index}
            />
          ))}
        </Section>
      )}
    </>
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
      s.statusMessage = `Click to stamp ${blueprint.name} · R rotates`;
    });

  const remove = () => {
    store.update((s) => {
      s.blueprints = s.blueprints.filter((_, i) => i !== index);
      if (s.blueprintEdit && s.blueprintEdit.index !== null && s.blueprintEdit.index > index) {
        s.blueprintEdit = { ...s.blueprintEdit, index: s.blueprintEdit.index - 1 };
      }
    });
    void persistBlueprintLibrary();
    showToast("info", `Removed "${blueprint.name}"`);
  };

  return (
    <div className="list-row">
      <span className="grow">
        {blueprint.name}
        <br />
        <span className="sub">
          {blueprint.nodes.length} nodes · {blueprint.edges.length} links
        </span>
      </span>
      <Button small title="Move the mouse over the map, R rotates, click to stamp" onClick={startPlacing}>
        Place
      </Button>
      {editable && (
        <Button
          small
          variant="ghost"
          title="Edit in the blueprint workspace"
          onClick={() => enterBlueprintEditor(index)}
        >
          Edit
        </Button>
      )}
      <Button small variant="ghost" onClick={() => void exportBlueprintFile(blueprint)}>
        Export
      </Button>
      <Button small variant="ghost" disabled={locked} title="Remove blueprint" onClick={remove}>
        ✕
      </Button>
    </div>
  );
}
