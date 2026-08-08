import { parseXml, textOf } from "./xmlDom";

/** A world-space icon (placeable or vehicle) read from a savegame XML file. */
export interface WorldIcon {
  x: number;
  z: number;
  label: string;
}

export function parseMapTitle(careerXml: string): string {
  const doc = parseXml(careerXml);
  return doc ? textOf(doc.querySelector("mapTitle")) : "";
}

/**
 * World icons from placeables.xml / vehicles.xml. Placeables carry
 * position="x y z" on the element itself; vehicles carry it on their first
 * component, so fall back to the nearest positioned descendant.
 */
export function parseWorldIcons(xml: string, tagName: string): WorldIcon[] {
  const doc = parseXml(xml);
  if (!doc) return [];
  const icons: WorldIcon[] = [];
  for (const el of Array.from(doc.getElementsByTagName(tagName))) {
    const positioned = el.hasAttribute("position") ? el : el.querySelector("[position]");
    const position = parseVector3(positioned?.getAttribute("position"));
    if (!position) continue;
    icons.push({ x: position[0], z: position[2], label: iconLabel(el) });
  }
  return icons;
}

function iconLabel(el: Element): string {
  const name = el.getAttribute("name");
  if (name) return name;
  const filename = el.getAttribute("filename") ?? "";
  return (
    filename
      .split("/")
      .pop()
      ?.replace(/\.xml$/i, "") ?? ""
  );
}

function parseVector3(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return [parts[0], parts[1], parts[2]];
}
