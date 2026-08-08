import { useState } from "react";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";

/** Create, rename or remove the map marker attached to a single waypoint. */
export function MarkerEditor({ wpId }: { wpId: number }) {
  const state = useStore();
  const marker = state.network.markers.find((m) => m.wpId === wpId);
  const [name, setName] = useState(marker?.name ?? "");
  const [group, setGroup] = useState(marker?.group ?? "All");

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    store.mutate((s) => {
      const existing = s.network.markers.find((m) => m.wpId === wpId);
      if (existing) {
        existing.name = trimmed;
        existing.group = group;
      } else {
        s.network.markers.push({ wpId, name: trimmed, group });
      }
      s.statusMessage = `Marker "${trimmed}" set`;
    });
  };

  const remove = () => {
    store.mutate((s) => {
      s.network.markers = s.network.markers.filter((m) => m.wpId !== wpId);
      s.statusMessage = "Marker removed";
    });
  };

  return (
    <div>
      <h4>Map marker</h4>
      <div className="row">
        <input placeholder="Marker name" value={name} onChange={(event) => setName(event.target.value)} />
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          {state.network.groups.map((groupName) => (
            <option key={groupName}>{groupName}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <button disabled={!name.trim()} onClick={save}>
          {marker ? "Update marker" : "Add marker"}
        </button>
        {marker && (
          <button className="danger" onClick={remove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
