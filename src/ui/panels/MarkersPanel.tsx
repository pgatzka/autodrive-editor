import { useState } from "react";
import { MapMarker } from "../../model/types";
import { focusOnWaypoint } from "../../state/actions";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, EmptyState, Section } from "../components/controls";

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
    <>
      <Section title="Groups">
        <div className="field-row">
          <input
            className="input"
            placeholder="New group name"
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
          />
          <Button
            disabled={!newGroup.trim() || state.network.groups.includes(newGroup.trim())}
            onClick={addGroup}
          >
            Add
          </Button>
        </div>
      </Section>

      {state.network.markers.length === 0 && (
        <EmptyState title="No markers yet">
          Select a single waypoint to name it — markers are what AutoDrive routes to.
        </EmptyState>
      )}

      {Array.from(grouped.entries()).map(([group, markers]) => (
        <Section key={group} title={`${group} · ${markers.length}`}>
          {markers.map((marker) => (
            <div key={marker.wpId} className="list-row">
              <button className="link-btn grow" onClick={() => focusOnWaypoint(marker.wpId)}>
                {marker.name}
              </button>
              <span className="sub">#{marker.wpId}</span>
            </div>
          ))}
          {group !== "All" && markers.length === 0 && (
            <Button
              small
              variant="ghost"
              onClick={() =>
                store.mutate((s) => (s.network.groups = s.network.groups.filter((g) => g !== group)))
              }
            >
              Remove empty group
            </Button>
          )}
        </Section>
      ))}
    </>
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
