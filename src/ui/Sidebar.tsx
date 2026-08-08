import { useState } from "react";
import { BlueprintsPanel } from "./panels/BlueprintsPanel";
import { FilePanel } from "./panels/FilePanel";
import { MarkersPanel } from "./panels/MarkersPanel";
import { SelectionPanel } from "./panels/SelectionPanel";

const TABS = [
  { id: "selection", label: "Selection", Panel: SelectionPanel },
  { id: "markers", label: "Markers", Panel: MarkersPanel },
  { id: "blueprints", label: "Blueprints", Panel: BlueprintsPanel },
  { id: "file", label: "File", Panel: FilePanel },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Sidebar() {
  const [active, setActive] = useState<TabId>("selection");
  const ActivePanel = TABS.find((tab) => tab.id === active)!.Panel;

  return (
    <div className="sidebar">
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={active === tab.id ? "active" : ""}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panel">
        <ActivePanel />
      </div>
    </div>
  );
}
