import { emptyNetwork, MapMarker, RouteNetwork, Waypoint } from "./types";
import { childElement, childText, parseXmlOrThrow, replaceChild, serializeXml, setChildText } from "./xmlDom";

/**
 * Import/export of AutoDrive_config.xml (FS25 format, scripts/XML.lua in FS25_AutoDrive).
 *
 * <AutoDrive>
 *   <MapName>...</MapName> <ADRouteVersion/> <ADRouteAuthor/> ...settings...
 *   <waypoints>
 *     <id>1,2,3</id> <x>..,..</x> <y>..</y> <z>..</z>       (comma separated)
 *     <out>2;-1;1,2</out> <incoming>-1;3;1</incoming>        (";" between waypoints, "," inside, -1 = none)
 *     <flags>0,0,1</flags>
 *   </waypoints>
 *   <mapmarker> <mm1><id>5</id><name>Farm</name><group>All</group></mm1> ... </mapmarker>
 * </AutoDrive>
 */

const NO_CONNECTIONS = "-1";
/** AutoDrive stores millimetre precision. */
const COORD_PRECISION = 1000;

export interface ParsedConfig {
  network: RouteNetwork;
  /** original file text, kept to preserve settings sections on export */
  originalText: string;
}

export function parseAutoDriveXml(text: string): ParsedConfig {
  const root = parseXmlOrThrow(text).documentElement;
  if (root.tagName !== "AutoDrive") {
    throw new Error(`Not an AutoDrive config (root element is <${root.tagName}>)`);
  }

  const network = emptyNetwork();
  network.mapName = childText(root, "MapName")?.trim() ?? "";
  network.routeVersion = childText(root, "ADRouteVersion")?.trim() ?? "";
  network.routeAuthor = childText(root, "ADRouteAuthor")?.trim() ?? "";

  readWaypoints(root, network);
  readMarkers(root, network);
  return { network, originalText: text };
}

/**
 * Serialize the network back to AutoDrive_config.xml.
 * Waypoint ids are compacted to 1..N (AutoDrive requires contiguous ids).
 * When originalText is given, all sections other than waypoints/mapmarker/metadata
 * (user settings, experimental features, ...) are preserved untouched.
 */
export function serializeAutoDriveXml(network: RouteNetwork, originalText?: string): string {
  const doc = documentFor(originalText);
  const root = doc.documentElement;

  setChildText(doc, root, "MapName", network.mapName || "unknown");
  if (network.routeVersion) setChildText(doc, root, "ADRouteVersion", network.routeVersion);
  if (network.routeAuthor) setChildText(doc, root, "ADRouteAuthor", network.routeAuthor);

  const ordered = Array.from(network.waypoints.values()).sort((a, b) => a.id - b.id);
  const compactId = new Map(ordered.map((wp, index) => [wp.id, index + 1]));

  writeWaypoints(doc, root, ordered, compactId);
  writeMarkers(doc, root, network, compactId);
  return serializeXml(doc);
}

// ---------- reading ----------

function readWaypoints(root: Element, network: RouteNetwork): void {
  const wpEl = childElement(root, "waypoints");
  if (!wpEl) return;

  const xs = parseNumberList(childText(wpEl, "x"));
  const ys = parseNumberList(childText(wpEl, "y"));
  const zs = parseNumberList(childText(wpEl, "z"));
  const ids = parseNumberList(childText(wpEl, "id"));
  const flags = parseNumberList(childText(wpEl, "flags"));
  const count = xs.length;
  if (ys.length !== count || zs.length !== count) {
    throw new Error(
      `Waypoint coordinate lists have mismatched lengths (x:${xs.length} y:${ys.length} z:${zs.length})`
    );
  }
  const outs = parseIdGroups(childText(wpEl, "out"), count);
  const incomings = parseIdGroups(childText(wpEl, "incoming"), count);

  for (let i = 0; i < count; i++) {
    const id = Number.isFinite(ids[i]) ? Math.round(ids[i]) : i + 1;
    const waypoint: Waypoint = {
      id,
      x: xs[i],
      y: ys[i],
      z: zs[i],
      out: outs[i],
      incoming: incomings[i],
      flags: Number.isFinite(flags[i]) ? flags[i] : 0,
    };
    network.waypoints.set(id, waypoint);
    network.nextId = Math.max(network.nextId, id + 1);
  }

  // drop references to waypoints that don't exist (defensive against hand-edited files)
  for (const wp of network.waypoints.values()) {
    wp.out = wp.out.filter((id) => network.waypoints.has(id));
    wp.incoming = wp.incoming.filter((id) => network.waypoints.has(id));
  }
}

function readMarkers(root: Element, network: RouteNetwork): void {
  const markerRoot = childElement(root, "mapmarker");
  if (!markerRoot) return;

  for (const mm of Array.from(markerRoot.children)) {
    if (!/^mm\d+$/.test(mm.tagName)) continue;
    const idText = childText(mm, "id");
    if (idText === null) continue;
    const wpId = Math.round(Number(idText));
    if (!network.waypoints.has(wpId)) continue;

    const marker: MapMarker = {
      wpId,
      name: childText(mm, "name")?.trim() || `marker_${wpId}`,
      group: childText(mm, "group")?.trim() || "All",
    };
    network.markers.push(marker);
    if (!network.groups.includes(marker.group)) network.groups.push(marker.group);
  }
}

function parseNumberList(text: string | null): number[] {
  const trimmed = text?.trim();
  if (!trimmed) return [];
  return trimmed.split(",").map(Number);
}

/** Semicolon-separated per-waypoint groups of comma-separated ids; "-1" means none. */
function parseIdGroups(text: string | null, count: number): number[][] {
  const trimmed = text?.trim();
  const parts = trimmed ? trimmed.split(";") : [];
  const groups: number[][] = [];
  for (let i = 0; i < count; i++) {
    const part = parts[i]?.trim();
    if (!part || part === NO_CONNECTIONS) {
      groups.push([]);
      continue;
    }
    groups.push(
      part
        .split(",")
        .map((value) => Math.round(Number(value)))
        .filter((id) => Number.isFinite(id) && id > 0)
    );
  }
  return groups;
}

// ---------- writing ----------

function documentFor(originalText?: string): Document {
  if (originalText) {
    const doc = new DOMParser().parseFromString(originalText, "application/xml");
    if (!doc.querySelector("parsererror") && doc.documentElement.tagName === "AutoDrive") return doc;
  }
  return new DOMParser().parseFromString("<AutoDrive></AutoDrive>", "application/xml");
}

function writeWaypoints(
  doc: Document,
  root: Element,
  ordered: Waypoint[],
  compactId: Map<number, number>
): void {
  const columns = {
    id: [] as string[],
    x: [] as string[],
    y: [] as string[],
    z: [] as string[],
    out: [] as string[],
    incoming: [] as string[],
    flags: [] as string[],
  };

  for (const wp of ordered) {
    columns.id.push(String(compactId.get(wp.id)));
    columns.x.push(formatCoord(wp.x));
    columns.y.push(formatCoord(wp.y));
    columns.z.push(formatCoord(wp.z));
    columns.out.push(formatIdGroup(wp.out, compactId));
    columns.incoming.push(formatIdGroup(wp.incoming, compactId));
    columns.flags.push(String(wp.flags));
  }

  const wpEl = replaceChild(doc, root, "waypoints");
  setChildText(doc, wpEl, "id", columns.id.join(","));
  setChildText(doc, wpEl, "x", columns.x.join(","));
  setChildText(doc, wpEl, "y", columns.y.join(","));
  setChildText(doc, wpEl, "z", columns.z.join(","));
  setChildText(doc, wpEl, "out", columns.out.join(";"));
  setChildText(doc, wpEl, "incoming", columns.incoming.join(";"));
  setChildText(doc, wpEl, "flags", columns.flags.join(","));
}

function writeMarkers(
  doc: Document,
  root: Element,
  network: RouteNetwork,
  compactId: Map<number, number>
): void {
  const markerRoot = replaceChild(doc, root, "mapmarker");
  network.markers
    .filter((marker) => compactId.has(marker.wpId))
    .forEach((marker, index) => {
      const mm = doc.createElement(`mm${index + 1}`);
      setChildText(doc, mm, "id", String(compactId.get(marker.wpId)));
      setChildText(doc, mm, "name", marker.name);
      setChildText(doc, mm, "group", marker.group);
      markerRoot.appendChild(mm);
    });
}

function formatIdGroup(ids: number[], compactId: Map<number, number>): string {
  const mapped = ids.filter((id) => compactId.has(id)).map((id) => compactId.get(id));
  return mapped.length > 0 ? mapped.join(",") : NO_CONNECTIONS;
}

function formatCoord(value: number): string {
  return String(Math.round(value * COORD_PRECISION) / COORD_PRECISION);
}
