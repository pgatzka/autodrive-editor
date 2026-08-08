import { useCallback, useEffect, useRef, useState } from "react";
import { EditorCanvas } from "./editor/EditorCanvas";
import { useKeyboardShortcuts } from "./editor/useKeyboardShortcuts";
import { loadBlueprintLibrary } from "./files/fileio";
import { useStore } from "./state/useStore";
import { Sidebar } from "./ui/Sidebar";
import { Toolbar } from "./ui/Toolbar";

export default function App() {
  const state = useStore();
  const [cursor, setCursor] = useState({ x: 0, z: 0 });
  const cursorFrame = useRef(0);

  // the canvas reports every mouse move; repaint the readout at most once per frame
  const onCursorMove = useCallback((x: number, z: number) => {
    cancelAnimationFrame(cursorFrame.current);
    cursorFrame.current = requestAnimationFrame(() => setCursor({ x, z }));
  }, []);

  useKeyboardShortcuts();
  useEffect(() => {
    void loadBlueprintLibrary();
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <EditorCanvas onCursorMove={onCursorMove} />
        <Sidebar />
      </div>
      <div className="statusbar">
        {state.blueprintEdit && <span className="mode-chip">BLUEPRINT</span>}
        <span>{state.statusMessage}</span>
        <span className="spacer" />
        <span>
          x {cursor.x.toFixed(1)} z {cursor.z.toFixed(1)} · zoom {state.view.scale.toFixed(2)}px/m ·{" "}
          {state.network.waypoints.size} nodes
          {state.settings.snapEnabled ? ` · snap ${state.settings.gridSize}m` : " · snap off"}
        </span>
      </div>
    </div>
  );
}
