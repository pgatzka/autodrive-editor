import { connectionBetween } from "../../model/graph";
import { FLAG_SUBPRIO, FLAG_TRAFFIC_SYSTEM, Waypoint } from "../../model/types";
import { wrapOffset } from "../../model/grid";
import {
  alignGridToWaypoint,
  connectNodes,
  createSmoothCurve,
  disconnectNodes,
  insertMidpointBetween,
  requestDeleteSelection,
  setSelectionFlag,
  spaceSelectionEvenly,
} from "../../state/actions";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, EmptyState, Section, Toggle } from "../components/controls";
import { MarkerEditor } from "./MarkerEditor";

/**
 * The inspector always answers the same three questions in the same order:
 * what is it, what is it called, what can I do to it. Tools that need more
 * waypoints stay in place and disabled rather than appearing, so nothing
 * under the cursor moves as the selection changes.
 */
export function SelectionPanel() {
  const state = useStore();
  const selected = Array.from(state.selection)
    .map((id) => state.network.waypoints.get(id))
    .filter((waypoint): waypoint is Waypoint => waypoint !== undefined);

  if (selected.length === 0) {
    return (
      <EmptyState title="Nothing selected">
        Click a waypoint, or drag a box on the map. Shift-click adds to the selection.
      </EmptyState>
    );
  }

  return (
    <>
      {selected.length === 1 ? (
        <SingleIdentity waypoint={selected[0]} />
      ) : (
        <GroupIdentity selected={selected} />
      )}
      <Flags selected={selected} />
      {selected.length === 1 && <GridAlignment waypoint={selected[0]} />}
      {selected.length === 1 && <MarkerEditor wpId={selected[0].id} />}
      <RouteTools selected={selected} />
    </>
  );
}

function SingleIdentity({ waypoint }: { waypoint: Waypoint }) {
  return (
    <Section>
      <div className="identity">
        <span className="dot" />
        <span className="name">Waypoint</span>
        <span className="id">#{waypoint.id}</span>
      </div>
      {/* coordinates in mono so digits line up while nudging */}
      <div className="stat-tiles">
        <Coordinate label="X" value={waypoint.x} />
        <Coordinate label="Y" value={waypoint.y} />
        <Coordinate label="Z" value={waypoint.z} />
      </div>
    </Section>
  );
}

function Coordinate({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-tile">
      <span className="value">{value.toFixed(2)}</span>
      <span className="label">{label}</span>
    </div>
  );
}

/** For a set, coordinates are meaningless — the count becomes the headline. */
function GroupIdentity({ selected }: { selected: Waypoint[] }) {
  const subprio = selected.filter((waypoint) => (waypoint.flags & FLAG_SUBPRIO) !== 0).length;
  const state = useStore();
  const links = countLinks(
    selected.map((waypoint) => waypoint.id),
    state.network.waypoints
  );

  return (
    <Section>
      <div className="metric">
        <span className="value">{selected.length}</span>
        <span className="unit">waypoints selected</span>
      </div>
      <div className="stat-row">
        <span className="stat">
          <span className="swatch" style={{ background: "#E9F0EE" }} />
          {selected.length - subprio} normal
        </span>
        <span className="stat">
          <span className="swatch" style={{ background: "var(--accent)" }} />
          {subprio} subprio
        </span>
        <span className="stat">{links} links</span>
      </div>
    </Section>
  );
}

/** Line the grid up with an existing waypoint, so snapping follows the road. */
function GridAlignment({ waypoint }: { waypoint: Waypoint }) {
  const state = useStore();
  const aligned =
    wrapOffset(waypoint.x, state.settings.gridSize) === state.settings.gridOffsetX &&
    wrapOffset(waypoint.z, state.settings.gridSize) === state.settings.gridOffsetZ;

  return (
    <Section>
      <Button
        wide
        disabled={aligned}
        title="Shift the grid so its lines cross this waypoint"
        onClick={() => alignGridToWaypoint(waypoint.id)}
      >
        {aligned ? "Grid aligned to this waypoint" : "Align grid to this waypoint"}
      </Button>
    </Section>
  );
}

function Flags({ selected }: { selected: Waypoint[] }) {
  const withFlag = (flag: number) => selected.filter((waypoint) => (waypoint.flags & flag) !== 0).length;
  const subprio = withFlag(FLAG_SUBPRIO);
  const traffic = withFlag(FLAG_TRAFFIC_SYSTEM);

  return (
    <Section>
      {/* the flag names mean nothing to a new player, so each carries a line of plain language */}
      <Toggle
        label="Subprio"
        hint="avoid unless necessary"
        checked={subprio === selected.length}
        mixed={subprio > 0 && subprio < selected.length}
        onChange={(checked) => setSelectionFlag(FLAG_SUBPRIO, checked)}
      />
      <Toggle
        label="Traffic system"
        hint="yield to AI traffic here"
        checked={traffic === selected.length}
        mixed={traffic > 0 && traffic < selected.length}
        onChange={(checked) => setSelectionFlag(FLAG_TRAFFIC_SYSTEM, checked)}
      />
    </Section>
  );
}

function RouteTools({ selected }: { selected: Waypoint[] }) {
  const state = useStore();
  const pair = selected.length === 2 ? selected : null;
  const connection = pair ? connectionBetween(state.network, pair[0].id, pair[1].id) : null;

  return (
    <Section title="Route tools">
      <div className="field-row">
        <Button
          wide
          disabled={!pair}
          title={pair ? undefined : "Needs exactly 2 waypoints"}
          onClick={() => pair && connectNodes(pair[0].id, pair[1].id, state.settings.connectionMode)}
        >
          Connect
        </Button>
        <Button wide disabled={!connection} onClick={() => pair && disconnectNodes(pair[0].id, pair[1].id)}>
          Disconnect
        </Button>
      </div>
      <div className="field-row">
        <Button
          wide
          disabled={!connection}
          onClick={() => pair && insertMidpointBetween(pair[0].id, pair[1].id)}
        >
          Insert midpoint
        </Button>
        <Button wide disabled={!pair} onClick={() => pair && createSmoothCurve(pair[0].id, pair[1].id)}>
          Smooth
        </Button>
      </div>
      <Button
        wide
        disabled={selected.length < 3}
        title={selected.length < 3 ? "Needs 3+ waypoints in a path" : undefined}
        onClick={() => spaceSelectionEvenly(selected.map((waypoint) => waypoint.id))}
      >
        Space evenly
      </Button>
      <div className="field-row">
        <span className="hint" style={{ flex: 1 }}>
          Smooth segments
        </span>
        <input
          className="input mono"
          type="number"
          min={2}
          max={64}
          style={{ width: 64 }}
          value={state.settings.curveSegments}
          onChange={(event) => {
            const value = Math.round(Number(event.target.value));
            if (value >= 2 && value <= 64) store.update((s) => (s.settings.curveSegments = value));
          }}
        />
      </div>
      {/* the only red control in the panel, and it is last */}
      <Button variant="danger" wide shortcut="Del" onClick={() => requestDeleteSelection()}>
        Delete {selected.length} waypoint{selected.length === 1 ? "" : "s"}
      </Button>
    </Section>
  );
}

/** Links among the selection, counted once per pair. */
function countLinks(ids: number[], waypoints: Map<number, Waypoint>): number {
  const selected = new Set(ids);
  const pairs = new Set<string>();
  for (const id of selected) {
    const waypoint = waypoints.get(id);
    if (!waypoint) continue;
    for (const target of waypoint.out) {
      if (!selected.has(target)) continue;
      pairs.add(id < target ? `${id}-${target}` : `${target}-${id}`);
    }
  }
  return pairs.size;
}
