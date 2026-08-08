import { findStackedGroups } from "../../model/graph";
import { plural } from "../../model/text";
import { RouteNetwork } from "../../model/types";
import { mergeStackedNodes } from "../../state/actions";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, Field, Section } from "../components/controls";
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
        <StackedNodes network={state.network} />
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

/**
 * Nodes stacked on one spot are invisible on the canvas — they can only be
 * counted, so the button states the count and disables itself when there is
 * nothing to clean up.
 */
function StackedNodes({ network }: { network: RouteNetwork }) {
  const groups = findStackedGroups(network);
  const extra = groups.reduce((sum, group) => sum + group.mergeIds.length, 0);

  return (
    <>
      <Button
        wide
        disabled={extra === 0}
        title={
          extra === 0
            ? "No two waypoints share the same X/Z"
            : "Fold each stack into one node, keeping every connection, flag and marker"
        }
        onClick={() => mergeStackedNodes()}
      >
        {extra === 0 ? "No stacked nodes" : `Merge ${plural(extra, "stacked node")}`}
      </Button>
      {extra > 0 && (
        <p className="hint">
          Waypoints are stacked at {plural(groups.length, "spot")}. Each stack becomes the node with the
          lowest id, which keeps every connection, flag and marker of the rest.
        </p>
      )}
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
