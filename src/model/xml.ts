import { emptyNetwork, MapMarker, RouteNetwork, Waypoint } from "./types";

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

function childText(parent: Element, tag: string): string | null {
  for (const el of Array.from(parent.children)) {
    if (el.tagName === tag) return el.textContent ?? "";
  }
  return null;
}

function parseNumberList(text: string | null): number[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed.split(",").map((v) => Number(v));
}

function parseIdGroups(text: string | null, count: number): number[][] {
  const result: number[][] = [];
  const parts = text === null || text.trim() === "" ? [] : text.trim().split(";");
  for (let i = 0; i < count; i++) {
    const part = parts[i];
    if (part === undefined || part.trim() === "" || part.trim() === "-1") {
      result.push([]);
    } else {
      result.push(
        part
          .split(",")
          .map((v) => Math.round(Number(v)))
          .filter((v) => Number.isFinite(v) && v > 0)
      );
    }
  }
  return result;
}

export interface ParsedConfig {
  network: RouteNetwork;
  /** original file text, kept to preserve settings sections on export */
  originalText: string;
}

export function parseAutoDriveXml(text: string): ParsedConfig {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Not a valid XML file: " + parseError.textContent);
  const root = doc.documentElement;
  if (root.tagName !== "AutoDrive") throw new Error("Not an AutoDrive config (root element is <" + root.tagName + ">)");

  const network = emptyNetwork();
  network.mapName = childText(root, "MapName")?.trim() ?? "";
  network.routeVersion = childText(root, "ADRouteVersion")?.trim() ?? "";
  network.routeAuthor = childText(root, "ADRouteAuthor")?.trim() ?? "";

  const wpEl = Array.from(root.children).find((el) => el.tagName === "waypoints");
  if (wpEl) {
    const xs = parseNumberList(childText(wpEl, "x"));
    const ys = parseNumberList(childText(wpEl, "y"));
    const zs = parseNumberList(childText(wpEl, "z"));
    const ids = parseNumberList(childText(wpEl, "id"));
    const flags = parseNumberList(childText(wpEl, "flags"));
    const count = xs.length;
    if (ys.length !== count || zs.length !== count) {
      throw new Error(`Waypoint coordinate lists have mismatched lengths (x:${xs.length} y:${ys.length} z:${zs.length})`);
    }
    const outs = parseIdGroups(childText(wpEl, "out"), count);
    const incomings = parseIdGroups(childText(wpEl, "incoming"), count);

    for (let i = 0; i < count; i++) {
      const id = ids[i] !== undefined && Number.isFinite(ids[i]) ? Math.round(ids[i]) : i + 1;
      const wp: Waypoint = {
        id,
        x: xs[i],
        y: ys[i],
        z: zs[i],
        out: outs[i],
        incoming: incomings[i],
        flags: flags[i] !== undefined && Number.isFinite(flags[i]) ? flags[i] : 0,
      };
      network.waypoints.set(id, wp);
      network.nextId = Math.max(network.nextId, id + 1);
    }

    // Drop references to waypoints that don't exist (defensive against hand-edited files)
    for (const wp of network.waypoints.values()) {
      wp.out = wp.out.filter((id) => network.waypoints.has(id));
      wp.incoming = wp.incoming.filter((id) => network.waypoints.has(id));
    }
  }

  const mmRoot = Array.from(root.children).find((el) => el.tagName === "mapmarker");
  if (mmRoot) {
    for (const mm of Array.from(mmRoot.children)) {
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

  return { network, originalText: text };
}

function formatCoord(v: number): string {
  // AutoDrive stores millimetre precision; trim trailing zeros to keep files small
  return String(Math.round(v * 1000) / 1000);
}

/**
 * Serialize the network back to AutoDrive_config.xml.
 * Waypoint ids are compacted to 1..N (AutoDrive requires contiguous ids).
 * If originalText is given, all sections other than waypoints/mapmarker/metadata
 * (user settings, experimental features, ...) are preserved untouched.
 */
export function serializeAutoDriveXml(network: RouteNetwork, originalText?: string): string {
  let doc: Document;
  if (originalText) {
    doc = new DOMParser().parseFromString(originalText, "application/xml");
    if (doc.querySelector("parsererror") || doc.documentElement.tagName !== "AutoDrive") {
      doc = newDoc();
    }
  } else {
    doc = newDoc();
  }
  const root = doc.documentElement;

  setChildText(doc, root, "MapName", network.mapName || "unknown");
  if (network.routeVersion) setChildText(doc, root, "ADRouteVersion", network.routeVersion);
  if (network.routeAuthor) setChildText(doc, root, "ADRouteAuthor", network.routeAuthor);

  // stable order + compact id mapping
  const sorted = Array.from(network.waypoints.values()).sort((a, b) => a.id - b.id);
  const idMap = new Map<number, number>();
  sorted.forEach((wp, i) => idMap.set(wp.id, i + 1));

  const ids: string[] = [];
  const xs: string[] = [];
  const ys: string[] = [];
  const zs: string[] = [];
  const outs: string[] = [];
  const incomings: string[] = [];
  const flags: string[] = [];
  for (const wp of sorted) {
    ids.push(String(idMap.get(wp.id)));
    xs.push(formatCoord(wp.x));
    ys.push(formatCoord(wp.y));
    zs.push(formatCoord(wp.z));
    const out = wp.out.filter((id) => idMap.has(id)).map((id) => idMap.get(id));
    const inc = wp.incoming.filter((id) => idMap.has(id)).map((id) => idMap.get(id));
    outs.push(out.length ? out.join(",") : "-1");
    incomings.push(inc.length ? inc.join(",") : "-1");
    flags.push(String(wp.flags));
  }

  const wpEl = replaceChild(doc, root, "waypoints");
  setChildText(doc, wpEl, "id", ids.join(","));
  setChildText(doc, wpEl, "x", xs.join(","));
  setChildText(doc, wpEl, "y", ys.join(","));
  setChildText(doc, wpEl, "z", zs.join(","));
  setChildText(doc, wpEl, "out", outs.join(";"));
  setChildText(doc, wpEl, "incoming", incomings.join(";"));
  setChildText(doc, wpEl, "flags", flags.join(","));

  const mmEl = replaceChild(doc, root, "mapmarker");
  const validMarkers = network.markers.filter((m) => idMap.has(m.wpId));
  validMarkers.forEach((marker, i) => {
    const mm = doc.createElement("mm" + (i + 1));
    setChildText(doc, mm, "id", String(idMap.get(marker.wpId)));
    setChildText(doc, mm, "name", marker.name);
    setChildText(doc, mm, "group", marker.group);
    mmEl.appendChild(mm);
  });

  const xml = new XMLSerializer().serializeToString(doc);
  const declaration = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n';
  return xml.startsWith("<?xml") ? xml : declaration + xml;
}

function newDoc(): Document {
  return new DOMParser().parseFromString("<AutoDrive></AutoDrive>", "application/xml");
}

function replaceChild(doc: Document, parent: Element, tag: string): Element {
  for (const el of Array.from(parent.children)) {
    if (el.tagName === tag) parent.removeChild(el);
  }
  const el = doc.createElement(tag);
  parent.appendChild(el);
  return el;
}

function setChildText(doc: Document, parent: Element, tag: string, text: string): Element {
  let el = Array.from(parent.children).find((e) => e.tagName === tag);
  if (!el) {
    el = doc.createElement(tag);
    parent.appendChild(el);
  }
  el.textContent = text;
  return el;
}
