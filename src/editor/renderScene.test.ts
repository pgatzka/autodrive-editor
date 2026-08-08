import { beforeEach, describe, expect, it } from "vitest";
import { captureBlueprint } from "../model/blueprint";
import { addWaypoint, connect } from "../model/graph";
import { emptyNetwork, FLAG_SUBPRIO } from "../model/types";
import { store } from "../state/store";
import { renderScene } from "./renderScene";
import { CANVAS_COLORS, CONNECTION_COLORS, edgeWidth, nodeRadius } from "./theme";
import { createViewport } from "./viewport";

/** Records the drawing calls a scene makes, so layers can be asserted. */
function recordingContext() {
  const calls: { op: string; args: unknown[] }[] = [];
  const styles: string[] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setLineDash: (dash: number[]) => calls.push({ op: "setLineDash", args: [dash] }),
    beginPath: () => calls.push({ op: "beginPath", args: [] }),
    moveTo: (...args: unknown[]) => calls.push({ op: "moveTo", args }),
    lineTo: (...args: unknown[]) => calls.push({ op: "lineTo", args }),
    closePath: () => calls.push({ op: "closePath", args: [] }),
    arc: (...args: unknown[]) => calls.push({ op: "arc", args }),
    fill: function () {
      styles.push(String(this.fillStyle));
      calls.push({ op: "fill", args: [this.fillStyle] });
    },
    stroke: function () {
      styles.push(String(this.strokeStyle));
      calls.push({ op: "stroke", args: [this.strokeStyle] });
    },
    fillRect: function (...args: unknown[]) {
      styles.push(String(this.fillStyle));
      calls.push({ op: "fillRect", args });
    },
    strokeRect: (...args: unknown[]) => calls.push({ op: "strokeRect", args }),
    fillText: (...args: unknown[]) => calls.push({ op: "fillText", args }),
    drawImage: (...args: unknown[]) => calls.push({ op: "drawImage", args }),
  };
  return {
    ctx: context as unknown as CanvasRenderingContext2D,
    calls,
    styles,
    ops: () => calls.map((call) => call.op),
    texts: () => calls.filter((call) => call.op === "fillText").map((call) => String(call.args[0])),
  };
}

const VIEWPORT = createViewport({ cx: 0, cz: 0, scale: 4 }, 800, 600);
const NO_OVERLAYS = { cursor: null, marquee: null };

beforeEach(() => {
  store.update((s) => {
    s.network = emptyNetwork();
    s.selection = new Set();
    s.background = null;
    s.blueprintEdit = null;
    s.placement = null;
    s.pendingConnectFrom = null;
    s.settings.gridSize = 2;
    s.settings.showIcons = true;
    s.settings.backgroundOpacity = 0.85;
  });
});

describe("renderScene", () => {
  it("paints the map backdrop and grid", () => {
    const { ctx, styles, ops } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles[0]).toBe(CANVAS_COLORS.background);
    expect(ops()).toContain("stroke"); // grid lines
  });

  it("uses the blueprint backdrop and draws the anchor in the workspace", () => {
    store.update((s) => {
      s.blueprintEdit = {
        index: null,
        name: "x",
        stash: {
          network: emptyNetwork(),
          selection: new Set(),
          view: s.view,
          dirty: false,
          statusMessage: "",
          history: { undo: [], redo: [] },
        },
      };
    });
    const { ctx, styles, texts } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles[0]).toBe(CANVAS_COLORS.backgroundBlueprint);
    expect(texts()).toContain("anchor");
  });

  it("skips the grid when it would be denser than the pixel budget", () => {
    store.update((s) => (s.settings.gridSize = 0.01));
    const { ctx, ops } = recordingContext();

    renderScene(ctx, store.state, createViewport({ cx: 0, cz: 0, scale: 0.2 }, 800, 600), NO_OVERLAYS);

    expect(ops().filter((op) => op === "stroke")).toHaveLength(0);
  });

  it("colors edges by connection type", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, -10, 0, 0);
      const b = addWaypoint(s.network, 0, 0, 0);
      const c = addWaypoint(s.network, 10, 0, 0);
      const d = addWaypoint(s.network, 20, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
      connect(s.network, b.id, c.id, "dual");
      connect(s.network, c.id, d.id, "reverse");
    });
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles).toContain(CONNECTION_COLORS.oneway);
    expect(styles).toContain(CONNECTION_COLORS.dual);
    expect(styles).toContain(CONNECTION_COLORS.reverse);
  });

  it("distinguishes subprio nodes, selection and markers", () => {
    store.update((s) => {
      const plain = addWaypoint(s.network, 0, 0, 0);
      const subprio = addWaypoint(s.network, 10, 0, 0);
      subprio.flags = FLAG_SUBPRIO;
      s.selection = new Set([plain.id]);
      s.network.markers.push({ wpId: plain.id, name: "Farm", group: "All" });
    });
    const { ctx, styles, texts } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(styles).toContain(CANVAS_COLORS.node);
    expect(styles).toContain(CANVAS_COLORS.nodeSubprio);
    expect(styles).toContain(CANVAS_COLORS.nodeSelected);
    expect(styles).toContain(CANVAS_COLORS.marker);
    expect(texts()).toContain("Farm");
  });

  it("draws the terrain image and world icons when a background is loaded", () => {
    store.update((s) => {
      s.background = {
        canvas: { width: 4, height: 4 } as HTMLCanvasElement,
        field: { samples: 2, sizeMeters: 1, values: new Uint16Array(4) },
        sizeMeters: 100,
        mapTitle: "Test",
        placeables: [{ x: 0, z: 0, label: "silo" }],
        vehicles: [{ x: 10, z: 10, label: "tractor" }],
        hasGroundTextures: true,
      };
    });
    const { ctx, styles, ops, texts } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(ops()).toContain("drawImage");
    expect(styles).toContain(CANVAS_COLORS.placeable);
    expect(styles).toContain(CANVAS_COLORS.vehicle);
    expect(texts()).toEqual(expect.arrayContaining(["silo", "tractor"]));
  });

  it("hides world icons when the setting is off", () => {
    store.update((s) => {
      s.settings.showIcons = false;
      s.background = {
        canvas: { width: 4, height: 4 } as HTMLCanvasElement,
        field: { samples: 2, sizeMeters: 1, values: new Uint16Array(4) },
        sizeMeters: 100,
        mapTitle: "Test",
        placeables: [{ x: 0, z: 0, label: "silo" }],
        vehicles: [],
        hasGroundTextures: false,
      };
    });
    const { ctx, texts } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, NO_OVERLAYS);

    expect(texts()).not.toContain("silo");
  });

  it("draws the pending connection to the cursor", () => {
    let id = 0;
    store.update((s) => {
      id = addWaypoint(s.network, 0, 0, 0).id;
      s.pendingConnectFrom = id;
    });
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, { cursor: { x: 20, z: 20 }, marquee: null });

    expect(styles).toContain(CANVAS_COLORS.ghost);
  });

  it("draws the blueprint ghost at the cursor", () => {
    store.update((s) => {
      const a = addWaypoint(s.network, 0, 0, 0);
      const b = addWaypoint(s.network, 10, 0, 0);
      connect(s.network, a.id, b.id, "oneway");
      const blueprint = captureBlueprint(s.network, new Set([a.id, b.id]), "pair")!;
      s.placement = { blueprint, rotation: 0 };
    });
    const { ctx, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, { cursor: { x: 50, z: 50 }, marquee: null });

    expect(styles).toContain(CANVAS_COLORS.ghost);
  });

  it("draws the marquee rectangle", () => {
    const { ctx, ops, styles } = recordingContext();

    renderScene(ctx, store.state, VIEWPORT, { cursor: null, marquee: { x0: 10, y0: 10, x1: 100, y1: 80 } });

    expect(ops()).toContain("strokeRect");
    expect(styles).toContain(CANVAS_COLORS.marquee);
  });
});

describe("theme sizing", () => {
  it("clamps node radius and edge width across zoom levels", () => {
    expect(nodeRadius(0.01)).toBe(3);
    expect(nodeRadius(1000)).toBe(9);
    expect(nodeRadius(10)).toBe(5);

    expect(edgeWidth(0.01)).toBe(1);
    expect(edgeWidth(1000)).toBe(4);
  });
});
