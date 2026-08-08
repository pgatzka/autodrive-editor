import { useCallback, useEffect, useRef, useState } from "react";
import { EditorCanvas } from "./editor/EditorCanvas";
import { loadBlueprintLibrary, openConfig, saveConfig } from "./files/fileio";
import { deleteWaypoints } from "./model/graph";
import { saveBlueprintEditor } from "./state/blueprintSession";
import { store } from "./state/store";
import { useStore } from "./state/useStore";
import { Sidebar } from "./ui/Sidebar";
import { Toolbar } from "./ui/Toolbar";

export default function App() {
  const s = useStore();
  const [cursor, setCursor] = useState({ x: 0, z: 0 });
  const cursorRaf = useRef(0);

  const onCursor = useCallback((x: number, z: number) => {
    cancelAnimationFrame(cursorRaf.current);
    cursorRaf.current = requestAnimationFrame(() => setCursor({ x, z }));
  }, []);

  useEffect(() => {
    void loadBlueprintLibrary();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if ((ctrl && e.key.toLowerCase() === "y") || (ctrl && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        store.redo();
      } else if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (store.state.blueprintEdit) saveBlueprintEditor(false);
        else void saveConfig(e.shiftKey);
      } else if (ctrl && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (!store.state.blueprintEdit) void openConfig();
      } else if (ctrl && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.update((st) => (st.selection = new Set(st.network.waypoints.keys())));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (store.state.selection.size > 0) {
          e.preventDefault();
          store.mutate((st) => {
            const n = st.selection.size;
            deleteWaypoints(st.network, st.selection);
            st.selection = new Set();
            st.statusMessage = `Deleted ${n} node(s)`;
          });
        }
      } else if (e.key === "Escape") {
        store.update((st) => {
          if (st.placement) {
            st.placement = null;
            st.tool = "select";
          } else if (st.pendingConnectFrom !== null) {
            st.pendingConnectFrom = null;
          } else {
            st.selection = new Set();
          }
        });
      } else if (e.key === "r" || e.key === "R") {
        if (store.state.placement) {
          const step = ((e.shiftKey ? -15 : 15) * Math.PI) / 180;
          store.update((st) => {
            st.placement = { ...st.placement!, rotation: st.placement!.rotation + step };
          });
        }
      } else if (e.key === "g" || e.key === "G") {
        store.update((st) => (st.settings.snapEnabled = !st.settings.snapEnabled));
      } else if (e.key >= "1" && e.key <= "4" && !ctrl) {
        const tools = ["select", "add", "connect", "gridroute"] as const;
        store.update((st) => {
          st.tool = tools[Number(e.key) - 1];
          st.pendingConnectFrom = null;
          st.placement = null;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <EditorCanvas onCursor={onCursor} />
        <Sidebar />
      </div>
      <div className="statusbar">
        {s.blueprintEdit && <span className="mode-chip">BLUEPRINT</span>}
        <span>{s.statusMessage}</span>
        <span className="spacer" />
        <span>
          x {cursor.x.toFixed(1)} z {cursor.z.toFixed(1)} · zoom {s.view.scale.toFixed(2)}px/m · {s.network.waypoints.size} nodes
          {s.settings.snapEnabled ? ` · snap ${s.settings.gridSize}m` : " · snap off"}
        </span>
      </div>
    </div>
  );
}
