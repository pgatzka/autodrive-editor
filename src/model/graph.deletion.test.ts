import { describe, expect, it } from "vitest";
import { addWaypoint, connect, deletionImpact } from "./graph";
import { emptyNetwork } from "./types";

describe("deletionImpact", () => {
  it("counts nodes, links and markers that would go", () => {
    const net = emptyNetwork();
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;
    const c = addWaypoint(net, 20, 0, 0).id;
    connect(net, a, b, "dual");
    connect(net, b, c, "oneway");
    net.markers.push({ wpId: b, name: "Silo", group: "All" });

    const impact = deletionImpact(net, [a, b]);

    expect(impact.nodes).toBe(2);
    expect(impact.connections).toBe(2);
    // only b -> c leaves the selection
    expect(impact.externalLinks).toBe(1);
    expect(impact.markers).toEqual(["Silo"]);
  });

  it("counts a two-way link once", () => {
    const net = emptyNetwork();
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;
    connect(net, a, b, "dual");

    expect(deletionImpact(net, [a, b]).connections).toBe(1);
  });

  it("sees reverse links, which live only in the other node's out list", () => {
    const net = emptyNetwork();
    const a = addWaypoint(net, 0, 0, 0).id;
    const b = addWaypoint(net, 10, 0, 0).id;
    connect(net, a, b, "reverse");

    // deleting only b must still report the link from a
    expect(deletionImpact(net, [b])).toMatchObject({ connections: 1, externalLinks: 1 });
  });

  it("ignores ids that are not in the network", () => {
    const net = emptyNetwork();
    addWaypoint(net, 0, 0, 0);

    expect(deletionImpact(net, [999])).toMatchObject({ nodes: 0, connections: 0, markers: [] });
  });
});
