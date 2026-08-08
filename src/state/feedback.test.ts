import { beforeEach, describe, expect, it, vi } from "vitest";
import { addWaypoint, connect } from "../model/graph";
import { emptyNetwork } from "../model/types";
import { DELETE_CONFIRM_THRESHOLD, requestDeleteSelection, selectAll } from "./actions";
import {
  closeDialog,
  confirmAction,
  dismissToast,
  setShortcutsOpen,
  showToast,
  suppressConfirmation,
} from "./feedback";
import { store } from "./store";

function seed(nodeCount: number): number[] {
  const ids: number[] = [];
  store.update((s) => {
    s.network = emptyNetwork();
    let previous: number | null = null;
    for (let i = 0; i < nodeCount; i++) {
      const waypoint = addWaypoint(s.network, i * 10, 0, 0);
      if (previous !== null) connect(s.network, previous, waypoint.id, "oneway");
      previous = waypoint.id;
      ids.push(waypoint.id);
    }
    s.selection = new Set();
    s.toasts = [];
    s.dialog = null;
    s.pendingDeletion = null;
    s.suppressedConfirmations = new Set();
  });
  store.clearHistory();
  return ids;
}

beforeEach(() => seed(0));

describe("toasts", () => {
  it("adds and dismisses toasts", () => {
    const id = showToast("success", "Saved", { detail: "12 markers" });

    expect(store.state.toasts).toHaveLength(1);
    expect(store.state.toasts[0]).toMatchObject({ kind: "success", title: "Saved", detail: "12 markers" });

    dismissToast(id);
    expect(store.state.toasts).toHaveLength(0);
  });

  it("gives toasts carrying Undo a longer life than plain confirmations", () => {
    showToast("success", "Saved");
    showToast("danger", "Deleted", { undo: () => undefined });

    const [confirmation, loss] = store.state.toasts;
    expect(loss.timeoutMs).toBeGreaterThan(confirmation.timeoutMs);
  });
});

describe("confirmAction", () => {
  it("opens a dialog and closes it again", () => {
    const onConfirm = vi.fn();
    confirmAction({ title: "t", body: "b", confirmLabel: "go", onConfirm });

    expect(store.state.dialog).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    closeDialog();
    expect(store.state.dialog).toBeNull();
  });

  it("runs straight away once the user silenced this confirmation", () => {
    const onConfirm = vi.fn();
    suppressConfirmation("delete-waypoints");

    confirmAction({ title: "t", body: "b", confirmLabel: "go", onConfirm, suppressKey: "delete-waypoints" });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(store.state.dialog).toBeNull();
  });

  it("clears the pending-deletion highlight when dismissed", () => {
    store.update((s) => (s.pendingDeletion = new Set([1])));
    closeDialog();
    expect(store.state.pendingDeletion).toBeNull();
  });
});

describe("requestDeleteSelection", () => {
  it("deletes small selections immediately with an undo toast", () => {
    const ids = seed(DELETE_CONFIRM_THRESHOLD);
    store.update((s) => (s.selection = new Set(ids)));

    requestDeleteSelection();

    expect(store.state.network.waypoints.size).toBe(0);
    expect(store.state.dialog).toBeNull();
    expect(store.state.toasts[0]).toMatchObject({ kind: "danger" });
    expect(store.state.toasts[0].undo).toBeTypeOf("function");
  });

  it("asks first above the threshold and names the collateral damage", () => {
    const ids = seed(DELETE_CONFIRM_THRESHOLD + 3);
    store.update((s) => {
      s.network.markers.push({ wpId: ids[0], name: "Field 12", group: "All" });
      // leave the last waypoint out, so one link crosses the selection boundary
      s.selection = new Set(ids.slice(0, -1));
    });

    requestDeleteSelection();

    expect(store.state.network.waypoints.size).toBe(ids.length);
    expect(store.state.pendingDeletion?.size).toBe(ids.length - 1);
    const dialog = store.state.dialog!;
    expect(dialog.title).toBe(`Delete ${ids.length - 1} waypoints?`);
    expect(dialog.body).toContain("1 link(s) to waypoints outside the selection");
    expect(dialog.body).toContain("Field 12");
    expect(dialog.detail).toMatch(/undoable/i);
  });

  it("carries out the delete when the dialog is confirmed", () => {
    const ids = seed(DELETE_CONFIRM_THRESHOLD + 2);
    store.update((s) => (s.selection = new Set(ids)));
    requestDeleteSelection();

    store.state.dialog!.onConfirm();

    expect(store.state.network.waypoints.size).toBe(0);
    expect(store.state.dialog).toBeNull();
    expect(store.state.pendingDeletion).toBeNull();
  });

  it("restores everything when the undo in the toast is used", () => {
    const ids = seed(3);
    store.update((s) => (s.selection = new Set(ids)));
    requestDeleteSelection();

    store.state.toasts[0].undo!();

    expect(store.state.network.waypoints.size).toBe(3);
  });

  it("does nothing without a selection", () => {
    seed(3);
    const version = store.getVersion();
    requestDeleteSelection();
    expect(store.getVersion()).toBe(version);
  });

  it("deletes without asking once the confirmation is suppressed", () => {
    const ids = seed(DELETE_CONFIRM_THRESHOLD + 2);
    suppressConfirmation("delete-waypoints");
    selectAll();
    expect(store.state.selection.size).toBe(ids.length);

    requestDeleteSelection();

    expect(store.state.dialog).toBeNull();
    expect(store.state.network.waypoints.size).toBe(0);
  });
});

describe("shortcuts sheet", () => {
  it("opens and closes", () => {
    setShortcutsOpen(true);
    expect(store.state.shortcutsOpen).toBe(true);
    setShortcutsOpen(false);
    expect(store.state.shortcutsOpen).toBe(false);
  });
});
