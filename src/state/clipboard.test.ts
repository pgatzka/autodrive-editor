import { beforeEach, describe, expect, it } from "vitest";
import { connectionBetween } from "../model/graph";
import { emptyNetwork, FLAG_SUBPRIO } from "../model/types";
import {
  addNode,
  connectNodes,
  copySelection,
  cutSelection,
  MIN_PASTE_OFFSET_M,
  pasteClipboard,
  pasteStep,
  selectAll,
  setSelection,
  setSelectionFlag,
} from "./actions";
import { store } from "./store";

beforeEach(() => {
  store.update((s) => {
    s.network = emptyNetwork();
    s.selection = new Set();
    s.clipboard = null;
    s.blueprintEdit = null;
    s.background = null;
    s.settings.gridSize = 2;
    s.settings.snapEnabled = true;
  });
  store.clearHistory();
});

/** Two connected nodes 10 m apart, selected. */
function seedPair(): [number, number] {
  const a = addNode(0, 0, null, "oneway");
  const b = addNode(10, 0, a, "oneway");
  selectAll();
  return [a, b];
}

describe("pasteStep", () => {
  it("moves whole grid cells, so a pasted copy stays on the grid", () => {
    // a 40 m route wants 10 m and gets it in whole cells
    expect(pasteStep(2, 40)).toBe(10);
    expect(pasteStep(3, 40)).toBe(12);
    expect(pasteStep(0.5, 40)).toBe(10);
  });

  it("scales with what is being pasted", () => {
    expect(pasteStep(2, 400)).toBe(100);
    expect(pasteStep(2, 40)).toBe(10);
    expect(pasteStep(2, 4)).toBe(2);
  });

  it("never lands the copy on top of the original", () => {
    expect(pasteStep(0.1, 0)).toBeGreaterThanOrEqual(MIN_PASTE_OFFSET_M);
    expect(pasteStep(0, 0)).toBe(MIN_PASTE_OFFSET_M);
    expect(pasteStep(2, 0)).toBe(MIN_PASTE_OFFSET_M);
  });
});

describe("copy and paste", () => {
  it("copies the nodes, their link and their flags", () => {
    const [a, b] = seedPair();
    setSelectionFlag(FLAG_SUBPRIO, true);

    expect(copySelection()).toBe(true);
    expect(store.state.statusMessage).toBe("Copied 2 waypoints");

    pasteClipboard();

    const net = store.state.network;
    expect(net.waypoints.size).toBe(4);
    const pasted = [...store.state.selection];
    expect(pasted).toHaveLength(2);
    expect(pasted).not.toContain(a);
    expect(pasted).not.toContain(b);
    expect(connectionBetween(net, pasted[0], pasted[1])).not.toBeNull();
    expect(net.waypoints.get(pasted[0])!.flags).toBe(FLAG_SUBPRIO);
  });

  it("pastes beside the original rather than on top of it", () => {
    seedPair();
    copySelection();

    pasteClipboard();

    const pasted = [...store.state.selection].map((id) => store.state.network.waypoints.get(id)!);
    const xs = pasted.map((wp) => wp.x).sort((p, q) => p - q);
    // the pair spans 10 m, so it moves a quarter of that — 4 m in 2 m cells
    expect(xs).toEqual([4, 14]);
    expect(pasted.every((wp) => wp.z === 4)).toBe(true);
  });

  it("walks further out on every repeat instead of stacking copies", () => {
    seedPair();
    copySelection();

    pasteClipboard();
    const first = [...store.state.selection].map((id) => store.state.network.waypoints.get(id)!.x);
    pasteClipboard();
    const second = [...store.state.selection].map((id) => store.state.network.waypoints.get(id)!.x);

    expect(second[0] - first[0]).toBe(4);
    expect(store.state.network.waypoints.size).toBe(6);
  });

  it("brings the markers of the copied nodes, renaming to stay unique", () => {
    const [a] = seedPair();
    store.update((s) => s.network.markers.push({ wpId: a, name: "Silo", group: "All" }));
    copySelection();

    pasteClipboard();

    expect(store.state.network.markers.map((m) => m.name)).toEqual(["Silo", "Silo 2"]);
  });

  it("is one undo step", () => {
    seedPair();
    copySelection();

    pasteClipboard();
    expect(store.state.network.waypoints.size).toBe(4);

    store.undo();
    expect(store.state.network.waypoints.size).toBe(2);
  });

  it("says so and stores nothing when the selection is empty", () => {
    addNode(0, 0, null, "oneway");
    setSelection([]);

    expect(copySelection()).toBe(false);
    expect(store.state.clipboard).toBeNull();
    expect(store.state.statusMessage).toBe("Nothing selected to copy");
  });

  it("does nothing when there is nothing to paste", () => {
    const version = store.getVersion();

    pasteClipboard();

    expect(store.getVersion()).toBe(version);
  });

  it("keeps only the connections among the copied nodes", () => {
    const a = addNode(0, 0, null, "oneway");
    const b = addNode(10, 0, a, "oneway");
    const outside = addNode(20, 0, null, "oneway");
    connectNodes(b, outside, "oneway");
    setSelection([a, b]);
    copySelection();

    pasteClipboard();

    const net = store.state.network;
    const pasted = [...store.state.selection];
    const leaving = pasted.flatMap((id) => net.waypoints.get(id)!.out).filter((id) => !pasted.includes(id));
    expect(leaving).toEqual([]);
  });
});

describe("cut", () => {
  it("removes the selection and can paste it back", () => {
    seedPair();

    cutSelection();

    expect(store.state.network.waypoints.size).toBe(0);
    expect(store.state.statusMessage).toBe("Cut 2 waypoints");

    pasteClipboard();
    expect(store.state.network.waypoints.size).toBe(2);
  });

  it("leaves the map alone when nothing is selected", () => {
    addNode(0, 0, null, "oneway");
    setSelection([]);

    cutSelection();

    expect(store.state.network.waypoints.size).toBe(1);
  });
});

describe("the clipboard across workspaces", () => {
  it("survives so map nodes can be pasted into the blueprint editor", () => {
    seedPair();
    copySelection();
    const copied = store.state.clipboard;

    // standing in for entering the blueprint workspace
    store.update((s) => {
      s.network = emptyNetwork();
      s.selection = new Set();
    });

    expect(store.state.clipboard).toBe(copied);
    pasteClipboard();
    expect(store.state.network.waypoints.size).toBe(2);
  });
});
