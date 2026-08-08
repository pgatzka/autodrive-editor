import { useState } from "react";
import { store } from "../../state/store";
import { useStore } from "../../state/useStore";
import { Button, Section } from "../components/controls";

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

  return (
    <Section title="Marker">
      <input
        className="input"
        placeholder="Marker name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="field-row">
        <select className="input" value={group} onChange={(event) => setGroup(event.target.value)}>
          {state.network.groups.map((groupName) => (
            <option key={groupName}>{groupName}</option>
          ))}
        </select>
        <Button disabled={!name.trim()} onClick={save}>
          {marker ? "Update" : "Add"}
        </Button>
        {marker && (
          <Button
            variant="danger"
            title="Remove marker"
            onClick={() =>
              store.mutate((s) => {
                s.network.markers = s.network.markers.filter((m) => m.wpId !== wpId);
                s.statusMessage = "Marker removed";
              })
            }
          >
            ✕
          </Button>
        )}
      </div>
    </Section>
  );
}
