import { useEffect, useState } from "react";
import { closeDialog, setShortcutsOpen, suppressConfirmation } from "../../state/feedback";
import { useStore } from "../../state/useStore";
import { Button, Keycap } from "../components/controls";

/** Blocking feedback: destruction above the threshold, and the shortcuts sheet. */
export function Dialogs() {
  const state = useStore();
  return (
    <>
      {state.dialog && <ConfirmDialogView />}
      {state.shortcutsOpen && <ShortcutsDialog />}
    </>
  );
}

function ConfirmDialogView() {
  const state = useStore();
  const dialog = state.dialog;
  const [suppress, setSuppress] = useState(false);
  useEscapeToClose(closeDialog);
  if (!dialog) return null;

  return (
    <Scrim onDismiss={closeDialog}>
      <h2>{dialog.title}</h2>
      <p className="body-text">{dialog.body}</p>
      {dialog.detail && <p className="hint">{dialog.detail}</p>}
      <div className="actions">
        {dialog.suppressKey && (
          <label className="toggle compact spacer">
            <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
            <span className="track" />
            <span className="labels">
              <span className="name">Don&apos;t ask again this session</span>
            </span>
          </label>
        )}
        <Button variant="ghost" onClick={closeDialog}>
          Cancel
        </Button>
        <Button
          variant="danger-solid"
          onClick={() => {
            if (suppress && dialog.suppressKey) suppressConfirmation(dialog.suppressKey);
            dialog.onConfirm();
          }}
        >
          {dialog.confirmLabel}
        </Button>
      </div>
    </Scrim>
  );
}

const SHORTCUTS: readonly { action: string; keys: string[] }[] = [
  { action: "Select tool", keys: ["1"] },
  { action: "Add waypoints", keys: ["2"] },
  { action: "Connect", keys: ["3"] },
  { action: "Grid route", keys: ["4"] },
  { action: "Chain from previous waypoint", keys: ["Ctrl", "click"] },
  { action: "Add to selection", keys: ["Shift", "click"] },
  { action: "Toggle snapping", keys: ["G"] },
  { action: "Rotate blueprint 15°", keys: ["R", "Shift+R"] },
  { action: "Undo · Redo", keys: ["Ctrl+Z", "Ctrl+Y"] },
  { action: "Save", keys: ["Ctrl+S"] },
  { action: "Select all", keys: ["Ctrl+A"] },
  { action: "Delete selection", keys: ["Del"] },
  { action: "Cancel / finish mode", keys: ["Esc"] },
] as const;

function ShortcutsDialog() {
  useEscapeToClose(() => setShortcutsOpen(false));
  return (
    <Scrim onDismiss={() => setShortcutsOpen(false)}>
      <h2>Keyboard shortcuts</h2>
      <div className="shortcut-grid">
        {SHORTCUTS.map((shortcut) => (
          <ShortcutRow key={shortcut.action} action={shortcut.action} keys={shortcut.keys} />
        ))}
      </div>
      <div className="actions">
        <Button onClick={() => setShortcutsOpen(false)}>Close</Button>
      </div>
    </Scrim>
  );
}

function ShortcutRow({ action, keys }: { action: string; keys: readonly string[] }) {
  return (
    <>
      <span className="body-text">{action}</span>
      <span className="keys">
        {keys.map((key) => (
          <Keycap key={key}>{key}</Keycap>
        ))}
      </span>
    </>
  );
}

/** Flat scrim, never a blur — the canvas keeps repainting behind it. */
function Scrim({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onDismiss()}>
      <div className="dialog" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

function useEscapeToClose(close: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);
}
