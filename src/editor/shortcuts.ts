import { openConfig, saveConfig } from "../files/fileio";
import { cancelCurrentInteraction, requestDeleteSelection, selectAll } from "../state/actions";
import { saveBlueprintEditor } from "../state/blueprintSession";
import { setShortcutsOpen } from "../state/feedback";
import { store, Tool } from "../state/store";

/** Tools reachable with keys 1..4, matching the toolbar order. */
export const TOOL_KEYS: readonly Tool[] = ["select", "add", "connect", "gridroute"];
export const BLUEPRINT_ROTATE_STEP_DEG = 15;

/**
 * Keyboard policy, separated from the React wiring so it can be exercised
 * directly. Returns true when the shortcut was handled and the browser
 * default should be suppressed.
 */
export function handleShortcut(event: KeyboardEvent): boolean {
  if (isTypingTarget(event.target)) return false;
  return event.ctrlKey || event.metaKey ? handleModified(event) : handlePlain(event);
}

function handleModified(event: KeyboardEvent): boolean {
  switch (event.key.toLowerCase()) {
    case "z":
      if (event.shiftKey) store.redo();
      else store.undo();
      return true;
    case "y":
      store.redo();
      return true;
    case "s":
      if (store.state.blueprintEdit) saveBlueprintEditor(false);
      else void saveConfig(event.shiftKey);
      return true;
    case "o":
      if (!store.state.blueprintEdit) void openConfig();
      return true;
    case "a":
      selectAll();
      return true;
    default:
      return false;
  }
}

function handlePlain(event: KeyboardEvent): boolean {
  if (event.key === "Delete" || event.key === "Backspace") {
    if (store.state.selection.size === 0) return false;
    requestDeleteSelection();
    return true;
  }
  if (event.key === "Escape") {
    cancelCurrentInteraction();
    return true;
  }
  if (event.key.toLowerCase() === "r" && store.state.placement) {
    rotatePlacement(event.shiftKey ? -BLUEPRINT_ROTATE_STEP_DEG : BLUEPRINT_ROTATE_STEP_DEG);
    return true;
  }
  if (event.key === "?") {
    setShortcutsOpen(true);
    return true;
  }
  if (event.key.toLowerCase() === "g") {
    store.update((s) => (s.settings.snapEnabled = !s.settings.snapEnabled));
    return true;
  }
  return selectToolByNumber(event.key);
}

function selectToolByNumber(key: string): boolean {
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= TOOL_KEYS.length) return false;
  store.update((s) => {
    s.tool = TOOL_KEYS[index];
    s.pendingConnectFrom = null;
    s.placement = null;
  });
  return true;
}

function rotatePlacement(degrees: number): void {
  store.update((s) => {
    if (!s.placement) return;
    s.placement = { ...s.placement, rotation: s.placement.rotation + (degrees * Math.PI) / 180 };
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
