import { RouteNetwork } from "../../model/types";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Field } from "../components/Field";
import { BackgroundPanel } from "./BackgroundPanel";
import { UpdatePanel } from "./UpdatePanel";

export function FilePanel() {
  const state = useStore();

  return (
    <div>
      <h3>File</h3>
      <p className="hint">{state.filePath ?? "(not saved yet)"}</p>
      <p className="hint">
        {state.network.waypoints.size} waypoints · {countConnections(state.network)} connections ·{" "}
        {state.network.markers.length} markers
      </p>

      <h4>Metadata</h4>
      <Field label="Map name">
        <input
          value={state.network.mapName}
          onChange={(event) => store.update((s) => (s.network.mapName = event.target.value))}
        />
      </Field>
      <Field label="Route author">
        <input
          value={state.network.routeAuthor}
          onChange={(event) => store.update((s) => (s.network.routeAuthor = event.target.value))}
        />
      </Field>
      <Field label="Route version">
        <input
          value={state.network.routeVersion}
          onChange={(event) => store.update((s) => (s.network.routeVersion = event.target.value))}
        />
      </Field>
      <p className="hint">
        Settings sections of an imported AutoDrive_config.xml are preserved untouched when saving.
      </p>

      <BackgroundPanel />
      <UpdatePanel />
    </div>
  );
}

/** Connections counted per node pair, so a two-way link counts once. */
function countConnections(network: RouteNetwork): number {
  const pairs = new Set<string>();
  for (const waypoint of network.waypoints.values()) {
    for (const target of waypoint.out) {
      pairs.add(waypoint.id < target ? `${waypoint.id}-${target}` : `${target}-${waypoint.id}`);
    }
  }
  return pairs.size;
}
