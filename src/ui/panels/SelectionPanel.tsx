import { connectionBetween } from "../../model/graph";
import { FLAG_SUBPRIO, FLAG_TRAFFIC_SYSTEM, Waypoint } from "../../model/types";
import {
  connectNodes,
  createSmoothCurve,
  deleteSelection,
  disconnectNodes,
  insertMidpointBetween,
  setSelectionFlag,
  spaceSelectionEvenly,
} from "../../state/actions";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { CheckboxField, NumberField } from "../components/Field";
import { MarkerEditor } from "./MarkerEditor";

export function SelectionPanel() {
  const state = useStore();
  const ids = Array.from(state.selection);
  const selected = ids
    .map((id) => state.network.waypoints.get(id))
    .filter((wp): wp is Waypoint => wp !== undefined);

  if (selected.length === 0) {
    return <p className="hint">Nothing selected. Click or box-select nodes with the Select tool.</p>;
  }

  const hasFlag = (flag: number) => selected.every((wp) => (wp.flags & flag) !== 0);

  return (
    <div>
      <h3>{selected.length} node(s) selected</h3>
      {selected.length === 1 && (
        <p className="hint">
          #{selected[0].id} — x {selected[0].x.toFixed(2)}, y {selected[0].y.toFixed(2)}, z{" "}
          {selected[0].z.toFixed(2)}
        </p>
      )}

      <h4>Flags</h4>
      <CheckboxField
        label="Subprio (avoided unless needed — pathfinding cost ×20)"
        checked={hasFlag(FLAG_SUBPRIO)}
        onChange={(checked) => setSelectionFlag(FLAG_SUBPRIO, checked)}
      />
      <CheckboxField
        label="Traffic system"
        checked={hasFlag(FLAG_TRAFFIC_SYSTEM)}
        onChange={(checked) => setSelectionFlag(FLAG_TRAFFIC_SYSTEM, checked)}
      />

      {selected.length === 1 && <MarkerEditor wpId={selected[0].id} />}

      <h4>Route tools</h4>
      <div className="btn-col">
        {selected.length === 2 && <PairTools a={selected[0]} b={selected[1]} />}
        {selected.length >= 3 && (
          <button onClick={() => spaceSelectionEvenly(ids)}>Space evenly along path</button>
        )}
        <button className="danger" onClick={() => deleteSelection()}>
          Delete selection
        </button>
      </div>
    </div>
  );
}

function PairTools({ a, b }: { a: Waypoint; b: Waypoint }) {
  const state = useStore();
  const connection = connectionBetween(state.network, a.id, b.id);

  return (
    <>
      <button onClick={() => connectNodes(a.id, b.id, state.settings.connectionMode)}>
        Connect ({state.settings.connectionMode})
      </button>
      {connection && <button onClick={() => disconnectNodes(a.id, b.id)}>Disconnect</button>}
      {connection && <button onClick={() => insertMidpointBetween(a.id, b.id)}>Insert midpoint</button>}
      <button onClick={() => createSmoothCurve(a.id, b.id)}>
        Smooth curve ({state.settings.curveSegments} segments)
      </button>
      <label className="row">
        Segments:
        <NumberField
          value={state.settings.curveSegments}
          min={2}
          max={64}
          isValid={(value) => value >= 2 && value <= 64}
          onChange={(value) => store.update((s) => (s.settings.curveSegments = Math.round(value)))}
        />
      </label>
    </>
  );
}
