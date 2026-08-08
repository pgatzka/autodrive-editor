import { describe, expect, it } from "vitest";
import { addWaypoint } from "../model/graph";
import { emptyNetwork } from "../model/types";
import { findNodeAt, findNodesInRect, pickRadius } from "./hitTest";
import { clampScale, createViewport, MAX_SCALE, MIN_SCALE, worldRectFromScreen, zoomAt } from "./viewport";

const VIEW = { cx: 0, cz: 0, scale: 2 };

describe("createViewport", () => {
  it("maps the view center to the middle of the canvas", () => {
    const viewport = createViewport(VIEW, 800, 600);
    expect(viewport.toScreenX(0)).toBe(400);
    expect(viewport.toScreenY(0)).toBe(300);
  });

  it("round-trips world and screen coordinates", () => {
    const viewport = createViewport({ cx: 123, cz: -45, scale: 3.5 }, 800, 600);
    expect(viewport.toWorldX(viewport.toScreenX(17))).toBeCloseTo(17);
    expect(viewport.toWorldZ(viewport.toScreenY(-9))).toBeCloseTo(-9);
  });

  it("treats a margin around the canvas as visible", () => {
    const viewport = createViewport(VIEW, 800, 600);
    expect(viewport.isVisible(400, 300)).toBe(true);
    expect(viewport.isVisible(-10, 300)).toBe(true);
    expect(viewport.isVisible(-100, 300)).toBe(false);
    expect(viewport.isVisible(400, 700, 0)).toBe(false);
  });
});

describe("zoomAt", () => {
  it("keeps the anchor point fixed on screen", () => {
    const before = createViewport(VIEW, 800, 600);
    const anchorScreenX = before.toScreenX(100);

    const zoomed = zoomAt(VIEW, 100, 50, 1.5);
    const after = createViewport(zoomed, 800, 600);

    expect(after.scale).toBeCloseTo(3);
    expect(after.toScreenX(100)).toBeCloseTo(anchorScreenX);
  });

  it("clamps the scale to its limits", () => {
    expect(zoomAt({ ...VIEW, scale: MAX_SCALE }, 0, 0, 10).scale).toBe(MAX_SCALE);
    expect(zoomAt({ ...VIEW, scale: MIN_SCALE }, 0, 0, 0.1).scale).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
  });
});

describe("worldRectFromScreen", () => {
  it("normalizes a rectangle dragged in any direction", () => {
    const viewport = createViewport(VIEW, 800, 600);
    const forward = worldRectFromScreen(viewport, 100, 100, 300, 200);
    const backward = worldRectFromScreen(viewport, 300, 200, 100, 100);
    expect(forward).toEqual(backward);
    expect(forward.minX).toBeLessThan(forward.maxX);
  });
});

describe("hit testing", () => {
  it("picks the nearest node inside the radius", () => {
    const net = emptyNetwork();
    const near = addWaypoint(net, 0, 0, 0).id;
    addWaypoint(net, 3, 0, 0);

    expect(findNodeAt(net, 0.2, 0.2, 2)?.id).toBe(near);
    expect(findNodeAt(net, 50, 50, 2)).toBeNull();
  });

  it("widens the pick radius as the view zooms out, down to a floor", () => {
    expect(pickRadius(0.1)).toBeGreaterThan(pickRadius(10));
    expect(pickRadius(1000)).toBe(0.8);
  });

  it("collects the nodes inside a rectangle", () => {
    const net = emptyNetwork();
    const inside = addWaypoint(net, 5, 0, 5).id;
    addWaypoint(net, 50, 0, 50);

    expect(findNodesInRect(net, { minX: 0, maxX: 10, minZ: 0, maxZ: 10 })).toEqual([inside]);
  });
});
