import { useCallback, useEffect, useRef, useState } from "react";
import { EditorCanvas } from "./editor/EditorCanvas";
import { useKeyboardShortcuts } from "./editor/useKeyboardShortcuts";
import { loadBlueprintLibrary } from "./files/fileio";
import { watchGridSettings } from "./state/gridPersistence";
import { useStore } from "./state/useStore";
import { Inspector } from "./ui/Inspector";
import { Dialogs } from "./ui/overlays/Dialogs";
import { StatusBar } from "./ui/StatusBar";
import { TitleBar } from "./ui/TitleBar";
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
    return watchGridSettings();
  }, []);

  return (
    // the blueprint workspace swaps the accent for every control at once
    <div className={state.blueprintEdit ? "app blueprint-mode" : "app"}>
      <TitleBar />
      <Toolbar />
      <div className="main">
        <EditorCanvas onCursorMove={onCursorMove} />
        <Inspector />
      </div>
      <StatusBar cursor={cursor} />
      <Dialogs />
    </div>
  );
}
