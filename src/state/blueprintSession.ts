import { persistBlueprintLibrary } from "../files/fileio";
import { blueprintToNetwork, captureBlueprint } from "../model/blueprint";
import { emptyNetwork } from "../model/types";
import { store } from "./store";

/**
 * The blueprint editor reuses the whole main editor: the current session
 * (network, selection, view, undo history) is stashed, the canvas edits the
 * blueprint's content as a small standalone network centered on the origin,
 * and saving captures it back into the library.
 */

export function enterBlueprintEditor(index: number | null) {
  const s = store.state;
  if (s.blueprintEdit) return;
  const bp = index !== null ? s.blueprints[index] : null;
  if (index !== null && !bp) return;
  const stash = {
    network: s.network,
    selection: s.selection,
    view: { ...s.view },
    filePath: s.filePath,
    originalXml: s.originalXml,
    dirty: s.dirty,
    statusMessage: s.statusMessage,
    history: store.takeHistory(),
  };
  store.update((st) => {
    st.blueprintEdit = { index, name: bp?.name ?? "New blueprint", stash };
    st.network = bp ? blueprintToNetwork(bp) : emptyNetwork();
    st.selection = new Set();
    st.pendingConnectFrom = null;
    st.placement = null;
    st.tool = bp ? "select" : "add";
    st.view = { cx: 0, cz: 0, scale: 12 };
    st.statusMessage = bp
      ? `Editing blueprint "${bp.name}" — the map is untouched until you stamp it`
      : "New blueprint — build it with the normal tools, then Save";
  });
}

/** Persist the edited content into the library. Returns false if there is nothing to save. */
export function saveBlueprintEditor(close: boolean): boolean {
  const s = store.state;
  const session = s.blueprintEdit;
  if (!session) return false;
  if (s.network.waypoints.size === 0) {
    store.update((st) => (st.statusMessage = "Blueprint is empty — add nodes or discard it"));
    return false;
  }
  const name = session.name.trim() || "Unnamed";
  const bp = captureBlueprint(s.network, new Set(s.network.waypoints.keys()), name);
  if (!bp) return false;
  store.update((st) => {
    if (session.index === null) {
      st.blueprints = [...st.blueprints, bp];
      st.blueprintEdit = { ...session, index: st.blueprints.length - 1, name };
    } else {
      st.blueprints = st.blueprints.map((b, i) => (i === session.index ? bp : b));
      st.blueprintEdit = { ...session, name };
    }
    st.statusMessage = `Blueprint "${name}" saved (${bp.nodes.length} nodes)`;
  });
  void persistBlueprintLibrary();
  if (close) exitBlueprintEditor(`Blueprint "${name}" saved`);
  return true;
}

export function discardBlueprintEditor() {
  exitBlueprintEditor("Blueprint changes discarded");
}

function exitBlueprintEditor(message: string) {
  const session = store.state.blueprintEdit;
  if (!session) return;
  const stash = session.stash;
  store.update((s) => {
    s.network = stash.network;
    s.selection = stash.selection;
    s.view = stash.view;
    s.filePath = stash.filePath;
    s.originalXml = stash.originalXml;
    s.dirty = stash.dirty;
    s.statusMessage = message;
    s.blueprintEdit = null;
    s.pendingConnectFrom = null;
    s.placement = null;
    s.tool = "select";
  });
  store.restoreHistory(stash.history);
}
