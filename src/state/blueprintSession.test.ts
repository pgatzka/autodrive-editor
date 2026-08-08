import { beforeEach, describe, expect, it, vi } from "vitest";
import { addWaypoint, connect } from "../model/graph";
import { emptyNetwork } from "../model/types";
import { discardBlueprintEditor, enterBlueprintEditor, saveBlueprintEditor } from "./blueprintSession";
import { store } from "./store";

vi.mock("../files/fileio", () => ({
  persistBlueprintLibrary: vi.fn(),
}));

/** A map network with two connected nodes, standing in for open work. */
function seedMap() {
  store.update((s) => {
    s.network = emptyNetwork();
    const a = addWaypoint(s.network, 0, 100, 0);
    const b = addWaypoint(s.network, 10, 100, 0);
    connect(s.network, a.id, b.id, "oneway");
    s.selection = new Set([a.id]);
    s.filePath = "/saves/AutoDrive_config.xml";
    s.view = { cx: 5, cz: 5, scale: 4 };
    s.dirty = true;
    s.blueprints = [];
    s.blueprintEdit = null;
  });
  store.clearHistory();
}

beforeEach(seedMap);

describe("enterBlueprintEditor", () => {
  it("stashes the map session and opens an empty workspace", () => {
    enterBlueprintEditor(null);

    expect(store.state.blueprintEdit).not.toBeNull();
    expect(store.state.network.waypoints.size).toBe(0);
    expect(store.state.tool).toBe("add");
    expect(store.state.view).toEqual({ cx: 0, cz: 0, scale: 12 });
    expect(store.state.blueprintEdit!.stash.network.waypoints.size).toBe(2);
  });

  it("loads an existing blueprint for editing", () => {
    enterBlueprintEditor(null);
    store.mutate((s) => {
      addWaypoint(s.network, -5, 0, 0);
      addWaypoint(s.network, 5, 0, 0);
    });
    saveBlueprintEditor(true);

    enterBlueprintEditor(0);

    expect(store.state.network.waypoints.size).toBe(2);
    expect(store.state.tool).toBe("select");
    expect(store.state.blueprintEdit!.index).toBe(0);
  });

  it("ignores an unknown index and re-entry while open", () => {
    enterBlueprintEditor(5);
    expect(store.state.blueprintEdit).toBeNull();

    enterBlueprintEditor(null);
    const session = store.state.blueprintEdit;
    enterBlueprintEditor(null);
    expect(store.state.blueprintEdit).toBe(session);
  });
});

describe("saveBlueprintEditor", () => {
  it("adds a new blueprint and keeps the workspace open", () => {
    enterBlueprintEditor(null);
    store.update((s) => (s.blueprintEdit = { ...s.blueprintEdit!, name: "Loop" }));
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });

    expect(saveBlueprintEditor(false)).toBe(true);

    expect(store.state.blueprints).toHaveLength(1);
    expect(store.state.blueprints[0].name).toBe("Loop");
    expect(store.state.blueprintEdit).not.toBeNull();
    expect(store.state.blueprintEdit!.index).toBe(0);
  });

  it("updates in place instead of adding a duplicate", () => {
    enterBlueprintEditor(null);
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    saveBlueprintEditor(false);
    store.mutate((s) => {
      addWaypoint(s.network, 10, 0, 0);
    });
    saveBlueprintEditor(false);

    expect(store.state.blueprints).toHaveLength(1);
    expect(store.state.blueprints[0].nodes).toHaveLength(2);
  });

  it("refuses to save an empty blueprint", () => {
    enterBlueprintEditor(null);

    expect(saveBlueprintEditor(true)).toBe(false);
    expect(store.state.blueprints).toHaveLength(0);
    expect(store.state.blueprintEdit).not.toBeNull();
    expect(store.state.statusMessage).toMatch(/empty/i);
  });

  it("falls back to a placeholder name", () => {
    enterBlueprintEditor(null);
    store.update((s) => (s.blueprintEdit = { ...s.blueprintEdit!, name: "   " }));
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    saveBlueprintEditor(true);

    expect(store.state.blueprints[0].name).toBe("Unnamed");
  });

  it("does nothing when the workspace is closed", () => {
    expect(saveBlueprintEditor(false)).toBe(false);
  });
});

describe("leaving the workspace", () => {
  it("restores the map session exactly", () => {
    enterBlueprintEditor(null);
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });

    saveBlueprintEditor(true);

    expect(store.state.blueprintEdit).toBeNull();
    expect(store.state.network.waypoints.size).toBe(2);
    expect(store.state.filePath).toBe("/saves/AutoDrive_config.xml");
    expect(store.state.view).toEqual({ cx: 5, cz: 5, scale: 4 });
    expect(store.state.dirty).toBe(true);
    expect(store.state.tool).toBe("select");
  });

  it("discards changes without touching the library", () => {
    enterBlueprintEditor(null);
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });

    discardBlueprintEditor();

    expect(store.state.blueprints).toHaveLength(0);
    expect(store.state.network.waypoints.size).toBe(2);
  });

  it("restores the map undo history rather than the blueprint's", () => {
    enterBlueprintEditor(null);
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    discardBlueprintEditor();

    // the map had no history at entry, so undo must not resurrect blueprint edits
    store.undo();
    expect(store.state.network.waypoints.size).toBe(2);
  });

  it("ignores a discard when no workspace is open", () => {
    const version = store.getVersion();
    discardBlueprintEditor();
    expect(store.getVersion()).toBe(version);
  });
});
