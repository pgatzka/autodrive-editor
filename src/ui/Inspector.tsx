import { useState } from "react";
import { useStore } from "../state/useStore";
import { BlueprintsPanel } from "./panels/BlueprintsPanel";
import { FilePanel } from "./panels/FilePanel";
import { MarkersPanel } from "./panels/MarkersPanel";
import { SelectionPanel } from "./panels/SelectionPanel";

/** Four tabs, fixed order, so the inspector never changes shape under the cursor. */
const TABS = [
  { id: "selection", label: "Selection", Panel: SelectionPanel },
  { id: "markers", label: "Markers", Panel: MarkersPanel },
  { id: "blueprints", label: "Blueprints", Panel: BlueprintsPanel },
  { id: "file", label: "File", Panel: FilePanel },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Inspector() {
  const state = useStore();
  const [active, setActive] = useState<TabId>("selection");
  const ActivePanel = TABS.find((tab) => tab.id === active)!.Panel;

  const counts: Record<TabId, number | null> = {
    selection: state.selection.size,
    markers: state.network.markers.length,
    blueprints: state.blueprints.length,
    file: null,
  };

  return (
    <aside className="inspector">
      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? "selected" : ""}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
            {counts[tab.id] !== null && <span className="tab-count">{counts[tab.id]}</span>}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        <ActivePanel />
      </div>
    </aside>
  );
}
