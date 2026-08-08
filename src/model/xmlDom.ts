/** Small DOM helpers shared by the XML readers, so parsing quirks live in one place. */

/** Parse XML, returning null instead of throwing on malformed input. */
export function parseXml(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  return doc.querySelector("parsererror") ? null : doc;
}

/** Parse XML, throwing a readable error on malformed input. */
export function parseXmlOrThrow(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) throw new Error(`Not a valid XML file: ${error.textContent}`);
  return doc;
}

export function textOf(el: Element | null | undefined): string {
  return el ? el.textContent.trim() : "";
}

/** Direct child element by tag name (not a descendant search). */
export function childElement(parent: Element, tag: string): Element | null {
  for (const el of Array.from(parent.children)) {
    if (el.tagName === tag) return el;
  }
  return null;
}

/** Text of a direct child element, or null when the child is absent. */
export function childText(parent: Element, tag: string): string | null {
  const el = childElement(parent, tag);
  return el ? el.textContent : null;
}

/** Set (creating if needed) the text of a direct child element. */
export function setChildText(doc: Document, parent: Element, tag: string, text: string): Element {
  let el = childElement(parent, tag);
  if (!el) {
    el = doc.createElement(tag);
    parent.appendChild(el);
  }
  el.textContent = text;
  return el;
}

/** Remove every direct child with this tag and append a fresh empty one. */
export function replaceChild(doc: Document, parent: Element, tag: string): Element {
  for (const el of Array.from(parent.children)) {
    if (el.tagName === tag) parent.removeChild(el);
  }
  const el = doc.createElement(tag);
  parent.appendChild(el);
  return el;
}

export function serializeXml(doc: Document): string {
  const xml = new XMLSerializer().serializeToString(doc);
  const declaration = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n';
  return xml.startsWith("<?xml") ? xml : declaration + xml;
}
