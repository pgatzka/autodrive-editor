import { useState } from "react";
import { MapMarker } from "../../model/types";
import { focusOnWaypoint } from "../../state/actions";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";

export function MarkersPanel() {
  const state = useStore();
  const [newGroup, setNewGroup] = useState("");
  const grouped = groupMarkers(state.network.groups, state.network.markers);

  const addGroup = () => {
    const name = newGroup.trim();
    if (!name || state.network.groups.includes(name)) return;
    store.mutate((s) => s.network.groups.push(name));
    setNewGroup("");
  };

  return (
    <div>
      <h3>Markers &amp; groups</h3>
      <div className="row">
        <input
          placeholder="New group name"
          value={newGroup}
          onChange={(event) => setNewGroup(event.target.value)}
        />
        <button
          disabled={!newGroup.trim() || state.network.groups.includes(newGroup.trim())}
          onClick={addGroup}
        >
          Add group
        </button>
      </div>

      {Array.from(grouped.entries()).map(([group, markers]) => (
        <div key={group} className="group-block">
          <h4>
            {group} <span className="hint">({markers.length})</span>
            {group !== "All" && markers.length === 0 && (
              <button
                className="danger small"
                onClick={() =>
                  store.mutate((s) => (s.network.groups = s.network.groups.filter((g) => g !== group)))
                }
              >
                remove
              </button>
            )}
          </h4>
          {markers.map((marker) => (
            <div key={marker.wpId} className="row marker-row">
              <button className="link" onClick={() => focusOnWaypoint(marker.wpId)}>
                {marker.name}
              </button>
              <span className="hint">#{marker.wpId}</span>
            </div>
          ))}
        </div>
      ))}

      {state.network.markers.length === 0 && (
        <p className="hint">No markers yet. Select a single node to add one.</p>
      )}
    </div>
  );
}

/** Markers by group, including groups that currently hold none. */
function groupMarkers(groups: string[], markers: MapMarker[]): Map<string, MapMarker[]> {
  const byGroup = new Map<string, MapMarker[]>(groups.map((group) => [group, []]));
  for (const marker of markers) {
    const bucket = byGroup.get(marker.group);
    if (bucket) bucket.push(marker);
    else byGroup.set(marker.group, [marker]);
  }
  return byGroup;
}
