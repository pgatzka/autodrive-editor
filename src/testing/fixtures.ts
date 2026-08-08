import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Test fixture loading. Specs run in a jsdom environment where import.meta.url
 * is an http URL, so paths resolve from the project root instead.
 */
const ASSETS = path.join(process.cwd(), "tests", "assets");

export function readFixtureText(name: string): string {
  return readFileSync(path.join(ASSETS, name), "utf-8");
}

export function readFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(ASSETS, name)));
}
