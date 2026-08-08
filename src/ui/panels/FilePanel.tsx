import { RouteNetwork } from "../../model/types";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Field, Section } from "../components/controls";
import { formatCount } from "../StatusBar";
import { shortenPath } from "../TitleBar";
import { BackgroundPanel } from "./BackgroundPanel";
import { UpdatePanel } from "./UpdatePanel";

/**
 * Per-session settings, ordered by how often they are touched: the file and
 * its metadata first, then the map background, and the updater last.
 */
export function FilePanel() {
  const state = useStore();

  return (
    <>
      <Section title="Current file">
        <p className="mono hint">{state.filePath ? shortenPath(state.filePath) : "No file open"}</p>
        <div className="stat-tiles">
          <Stat value={state.network.waypoints.size} label="waypoints" />
          <Stat value={countConnections(state.network)} label="connections" />
          <Stat value={state.network.markers.length} label="markers" />
        </div>
      </Section>

      <Section title="Route metadata">
        <Field label="Map">
          <input
            className="input"
            value={state.network.mapName}
            onChange={(event) => store.update((s) => (s.network.mapName = event.target.value))}
          />
        </Field>
        <Field label="Author">
          <input
            className="input"
            value={state.network.routeAuthor}
            onChange={(event) => store.update((s) => (s.network.routeAuthor = event.target.value))}
          />
        </Field>
        <Field label="Version">
          <input
            className="input"
            value={state.network.routeVersion}
            onChange={(event) => store.update((s) => (s.network.routeVersion = event.target.value))}
          />
        </Field>
        <p className="hint">Settings sections of an imported config are preserved untouched when saving.</p>
      </Section>

      <BackgroundPanel />
      <UpdatePanel />
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <span className="value">{formatCount(value)}</span>
      <span className="label">{label}</span>
    </div>
  );
}

/** Connections counted per waypoint pair, so a two-way link counts once. */
function countConnections(network: RouteNetwork): number {
  const pairs = new Set<string>();
  for (const waypoint of network.waypoints.values()) {
    for (const target of waypoint.out) {
      pairs.add(waypoint.id < target ? `${waypoint.id}-${target}` : `${target}-${waypoint.id}`);
    }
  }
  return pairs.size;
}
