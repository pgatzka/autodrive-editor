import { describe, expect, it } from "vitest";
import { readFixtureText } from "../testing/fixtures";
import { connectionBetween, deleteWaypoints } from "./graph";
import { parseAutoDriveXml, serializeAutoDriveXml } from "./xml";

const SAMPLE = readFixtureText("sample_config.xml");

describe("parseAutoDriveXml", () => {
  it("reads waypoints, metadata, markers and groups", () => {
    const { network } = parseAutoDriveXml(SAMPLE);

    expect(network.waypoints.size).toBe(6);
    expect(network.mapName).toBe("MapUS");
    expect(network.routeAuthor).toBe("phil");
    expect(network.waypoints.get(5)?.out).toEqual([6, 1]);
    expect(network.waypoints.get(3)?.flags).toBe(1);
    expect(network.markers).toHaveLength(2);
    expect(network.groups).toContain("Fields");
  });

  it("distinguishes one-way, two-way and reverse connections", () => {
    const { network } = parseAutoDriveXml(SAMPLE);

    expect(connectionBetween(network, 1, 2)).toMatchObject({ from: 1, to: 2, kind: "oneway" });
    // 5 -> 1 exists in `out` but not in 1's `incoming`, which encodes a reverse link
    expect(connectionBetween(network, 5, 1)).toMatchObject({ from: 5, kind: "reverse" });
  });

  it("rejects files that are not AutoDrive configs", () => {
    expect(() => parseAutoDriveXml("<other/>")).toThrow(/Not an AutoDrive config/);
    expect(() => parseAutoDriveXml("<AutoDrive")).toThrow(/not a valid xml/i);
  });

  it("rejects mismatched coordinate lists", () => {
    const broken = "<AutoDrive><waypoints><x>1,2</x><y>1</y><z>1,2</z></waypoints></AutoDrive>";
    expect(() => parseAutoDriveXml(broken)).toThrow(/mismatched lengths/);
  });

  it("drops connections pointing at missing waypoints", () => {
    const dangling =
      "<AutoDrive><waypoints><id>1</id><x>0</x><y>0</y><z>0</z><out>7</out><incoming>-1</incoming><flags>0</flags></waypoints></AutoDrive>";
    expect(parseAutoDriveXml(dangling).network.waypoints.get(1)?.out).toEqual([]);
  });
});

describe("serializeAutoDriveXml", () => {
  it("round-trips a config without losing data", () => {
    const { network, originalText } = parseAutoDriveXml(SAMPLE);
    const { network: reparsed } = parseAutoDriveXml(serializeAutoDriveXml(network, originalText));

    expect(reparsed.waypoints.size).toBe(network.waypoints.size);
    for (const waypoint of network.waypoints.values()) {
      expect(reparsed.waypoints.get(waypoint.id)).toEqual(waypoint);
    }
    expect(reparsed.markers).toEqual(network.markers);
  });

  it("preserves settings sections of the original file", () => {
    const { network, originalText } = parseAutoDriveXml(SAMPLE);
    const xml = serializeAutoDriveXml(network, originalText);

    expect(xml).toContain("autoConnectStart_userDefault");
    expect(xml).toContain("experimentalFeatures");
  });

  it("compacts ids to 1..N and remaps every reference", () => {
    const { network, originalText } = parseAutoDriveXml(SAMPLE);
    deleteWaypoints(network, [1]);

    const { network: reparsed } = parseAutoDriveXml(serializeAutoDriveXml(network, originalText));

    expect([...reparsed.waypoints.keys()]).toEqual([1, 2, 3, 4, 5]);
    // old waypoint 2 (x=10) becomes id 1 and still points at old 3 (x=20), now id 2
    expect(reparsed.waypoints.get(1)).toMatchObject({ x: 10, out: [2] });
    // the marker on the deleted waypoint is gone, the other one survives remapped
    expect(reparsed.markers).toEqual([{ wpId: 3, name: "Field 7", group: "Fields" }]);
  });

  it("writes a standalone file when no original is given", () => {
    const { network } = parseAutoDriveXml(SAMPLE);
    const xml = serializeAutoDriveXml(network);

    expect(xml).toMatch(/^<\?xml/);
    expect(parseAutoDriveXml(xml).network.waypoints.size).toBe(6);
  });

  it("falls back to a fresh document when the original is unusable", () => {
    const { network } = parseAutoDriveXml(SAMPLE);
    expect(parseAutoDriveXml(serializeAutoDriveXml(network, "<nonsense")).network.waypoints.size).toBe(6);
  });
});
