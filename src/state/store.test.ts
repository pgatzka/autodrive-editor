import { beforeEach, describe, expect, it, vi } from "vitest";
import { addWaypoint } from "../model/graph";
import { emptyNetwork } from "../model/types";
import { store } from "./store";

beforeEach(() => {
  store.update((s) => {
    s.network = emptyNetwork();
    s.selection = new Set();
    s.settings.gridSize = 2;
    s.settings.snapEnabled = true;
    s.dirty = false;
  });
  store.clearHistory();
});

describe("snap", () => {
  it("rounds to the nearest grid multiple when enabled", () => {
    expect(store.snap(3.2)).toBe(4);
    expect(store.snap(-3.2)).toBe(-4);
    expect(store.snap(1)).toBe(2);
  });

  it("passes values through when snapping is off or the grid is degenerate", () => {
    store.update((s) => (s.settings.snapEnabled = false));
    expect(store.snap(3.2)).toBe(3.2);

    store.update((s) => {
      s.settings.snapEnabled = true;
      s.settings.gridSize = 0;
    });
    expect(store.snap(3.2)).toBe(3.2);
  });
});

describe("undo and redo", () => {
  it("restores the network and selection of the previous step", () => {
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    expect(store.state.network.waypoints.size).toBe(1);
    expect(store.state.dirty).toBe(true);

    store.undo();
    expect(store.state.network.waypoints.size).toBe(0);

    store.redo();
    expect(store.state.network.waypoints.size).toBe(1);
  });

  it("does nothing when the history is empty", () => {
    store.undo();
    store.redo();
    expect(store.state.network.waypoints.size).toBe(0);
  });

  it("drops the redo stack once a new edit is made", () => {
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    store.undo();
    store.mutate((s) => {
      addWaypoint(s.network, 10, 0, 0);
    });
    store.redo();

    expect(store.state.network.waypoints.size).toBe(1);
    expect([...store.state.network.waypoints.values()][0].x).toBe(10);
  });

  it("snapshots deeply so undo is unaffected by later edits", () => {
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });
    store.mutate((s) => {
      const waypoint = [...s.network.waypoints.values()][0];
      waypoint.x = 500;
      waypoint.out.push(99);
    });

    store.undo();

    const waypoint = [...store.state.network.waypoints.values()][0];
    expect(waypoint.x).toBe(0);
    expect(waypoint.out).toEqual([]);
  });

  it("hands history over and back for the blueprint workspace", () => {
    store.mutate((s) => {
      addWaypoint(s.network, 0, 0, 0);
    });

    const history = store.takeHistory();
    store.undo();
    expect(store.state.network.waypoints.size).toBe(1); // history was taken away

    store.restoreHistory(history);
    store.undo();
    expect(store.state.network.waypoints.size).toBe(0);
  });
});

describe("subscriptions", () => {
  it("notifies listeners until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.update(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("advances the version on every change", () => {
    const before = store.getVersion();
    store.update(() => undefined);
    expect(store.getVersion()).toBeGreaterThan(before);
  });
});
