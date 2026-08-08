// Model tests for XML round-trip, graph operations, grid routing and blueprints.
// The model code uses DOMParser, so the tests run in a real Chromium page served
// by Vite: `npm test`. Set CHROMIUM_PATH if auto-detection fails.
import { chromium } from "playwright-core";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sampleXml = readFileSync(path.join(root, "tests", "sample_config.xml"), "utf-8");

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    for (const dir of readdirSync(base)) {
      for (const bin of ["chrome-linux/headless_shell", "chrome-linux/chrome"]) {
        const p = path.join(base, dir, bin);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined; // let playwright-core resolve its own download
}

const { createServer } = await import("vite");
const server = await createServer({ root, server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
await page.goto(url);
await page.waitForSelector(".toolbar");

const results = await page.evaluate(async (xmlText) => {
  const out = [];
  const assert = (cond, msg) => out.push((cond ? "PASS " : "FAIL ") + msg);
  const xml = await import("/src/model/xml.ts");
  const graph = await import("/src/model/graph.ts");
  const bp = await import("/src/model/blueprint.ts");

  // ---- parse ----
  const { network, originalText } = xml.parseAutoDriveXml(xmlText);
  assert(network.waypoints.size === 6, "6 waypoints parsed");
  assert(network.mapName === "MapUS", "map name parsed");
  const wp5 = network.waypoints.get(5);
  assert(JSON.stringify(wp5.out) === "[6,1]", "wp5.out == [6,1], got " + JSON.stringify(wp5.out));
  assert(network.waypoints.get(3).flags === 1, "wp3 subprio flag");
  assert(network.markers.length === 2 && network.markers[1].group === "Fields", "markers + groups parsed");
  assert(network.groups.includes("Fields"), "group list contains Fields");

  // connection kinds
  const e12 = graph.connectionBetween(network, 1, 2);
  assert(e12 && e12.kind === "oneway" && e12.from === 1, "1->2 oneway");
  const e51 = graph.connectionBetween(network, 5, 1);
  assert(e51 && e51.kind === "reverse" && e51.from === 5, "5->1 reverse (no incoming)");

  // ---- serialize + passthrough ----
  const serialized = xml.serializeAutoDriveXml(network, originalText);
  assert(serialized.includes("autoConnectStart_userDefault"), "settings passthrough preserved");
  assert(serialized.includes("experimentalFeatures"), "experimental features preserved");
  const re = xml.parseAutoDriveXml(serialized);
  assert(re.network.waypoints.size === 6, "round trip waypoint count");
  assert(JSON.stringify(re.network.waypoints.get(5).out) === "[6,1]", "round trip wp5.out");
  assert(re.network.waypoints.get(3).flags === 1, "round trip flags");
  assert(re.network.markers.length === 2 && re.network.markers[0].name === "Farm", "round trip markers");
  const coordsEqual = [...network.waypoints.values()].every((wp) => {
    const r = re.network.waypoints.get(wp.id);
    return r && Math.abs(r.x - wp.x) < 1e-6 && Math.abs(r.y - wp.y) < 1e-6 && Math.abs(r.z - wp.z) < 1e-6;
  });
  assert(coordsEqual, "round trip coordinates exact");

  // ---- id compaction after delete ----
  graph.deleteWaypoints(network, [1]);
  const serialized2 = xml.serializeAutoDriveXml(network, originalText);
  const re2 = xml.parseAutoDriveXml(serialized2);
  assert(re2.network.waypoints.size === 5, "5 waypoints after delete");
  assert([...re2.network.waypoints.keys()].join(",") === "1,2,3,4,5", "ids compacted to 1..5");
  const n1 = re2.network.waypoints.get(1);
  assert(n1.x === 10 && JSON.stringify(n1.out) === "[2]", "references remapped after compaction");
  assert(re2.network.markers.length === 1 && re2.network.markers[0].name === "Field 7", "marker on deleted node dropped");

  // ---- grid route ----
  const net2 = xml.parseAutoDriveXml(xmlText).network;
  const created = graph.connectAcrossGrid(net2, 1, 2, 2, "oneway");
  assert(created.length === 4, "axis-aligned grid route created 4 nodes, got " + created.length);
  const chainOk = (() => {
    let cur = 1;
    for (let i = 0; i < 5; i++) {
      const next = net2.waypoints.get(cur).out.find((id) => created.includes(id) || id === 2);
      if (next === undefined) return false;
      cur = next;
    }
    return cur === 2;
  })();
  assert(chainOk, "grid route forms a connected chain 1 -> ... -> 2 (direct link replaced)");
  const xs = created.map((id) => net2.waypoints.get(id).x);
  assert(JSON.stringify(xs) === "[2,4,6,8]", "crossing positions [2,4,6,8], got " + JSON.stringify(xs));

  // diagonal through grid corners: crossings on both axes coincide and must merge
  const net3 = xml.parseAutoDriveXml(xmlText).network;
  const a = graph.addWaypoint(net3, 0, 0, 0);
  const b = graph.addWaypoint(net3, 10, 0, 10);
  const diag = graph.connectAcrossGrid(net3, a.id, b.id, 2, "dual");
  assert(diag.length === 4, "diagonal corner crossings merged (4 nodes), got " + diag.length);

  // ---- blueprint capture + stamp ----
  const net4 = xml.parseAutoDriveXml(xmlText).network;
  const blueprint = bp.captureBlueprint(net4, new Set([1, 2, 3]), "test");
  assert(blueprint.nodes.length === 3 && blueprint.edges.length === 2, "blueprint captured 3 nodes 2 edges");
  const before = net4.waypoints.size;
  const ids = bp.stampBlueprint(net4, blueprint, { x: 100, z: 100, rotation: Math.PI / 2 }, 90);
  assert(net4.waypoints.size === before + 3, "stamp added 3 nodes");
  const s0 = net4.waypoints.get(ids[0]);
  const s1 = net4.waypoints.get(ids[1]);
  assert(s0.out.includes(ids[1]) && s1.incoming.includes(ids[0]), "stamped edges reconnected");
  const d0 = { x: s0.x - 100, z: s0.z - 100 };
  assert(Math.abs(d0.x) < 1e-6 && Math.abs(d0.z + 10) < 1e-6, "rotation applied, got " + JSON.stringify(d0));

  // ---- blueprint editor round trip: blueprint -> network -> capture -> identical ----
  const bpNet = bp.blueprintToNetwork(blueprint);
  assert(bpNet.waypoints.size === 3, "blueprintToNetwork expands 3 nodes");
  const recaptured = bp.captureBlueprint(bpNet, new Set(bpNet.waypoints.keys()), blueprint.name);
  assert(JSON.stringify(recaptured.nodes) === JSON.stringify(blueprint.nodes), "blueprint nodes survive edit round trip");
  assert(JSON.stringify(recaptured.edges) === JSON.stringify(blueprint.edges), "blueprint edges survive edit round trip");
  assert(JSON.stringify(recaptured.markers) === JSON.stringify(blueprint.markers), "blueprint markers survive edit round trip");

  // ---- flags roundtrip: traffic system ----
  graph.setFlagOn(net4, [1], 2, true);
  const re3 = xml.parseAutoDriveXml(xml.serializeAutoDriveXml(net4));
  assert(re3.network.waypoints.get(1).flags === 2, "traffic flag survives roundtrip");

  // ---- savegame background: 16-bit heightmap + terrain sampling ----
  const bgMod = await import("/src/model/background.ts");
  const png16 = await import("/src/model/png16.ts");
  const hmBytes = new Uint8Array(await (await fetch("/tests/assets/terrain.heightmap.png")).arrayBuffer());
  const hm = await png16.decodeGray16Png(hmBytes);
  assert(hm.width === 2049 && hm.height === 2049, `heightmap decoded 2049x2049, got ${hm.width}x${hm.height}`);
  let hmMin = 0xffff;
  let hmMax = 0;
  for (const v of hm.data) {
    if (v < hmMin) hmMin = v;
    if (v > hmMax) hmMax = v;
  }
  // flat map: all heights within ~128±0.1 m (32890..32904 in 16-bit units)
  assert(hmMin >= 32880 && hmMax <= 32910, `flat-map height values in [32880,32910], got [${hmMin},${hmMax}]`);
  const background = await bgMod.buildBackground({
    heightmap: hmBytes,
    careerXml: "<careerSavegame><settings><mapTitle>Flat MAP</mapTitle></settings></careerSavegame>",
    placeablesXml:
      '<placeables><placeable filename="data/placeables/mapUS/trailerHouse/trailerHouse.xml" position="-296.356 128.000 -168.160"/></placeables>',
    vehiclesXml:
      '<vehicles><vehicle filename="data/vehicles/fendt/vario900/vario900.xml"><component1 position="-287.061 127.974 -55.177"/></vehicle></vehicles>',
  });
  assert(background.sizeMeters === 2048, "map size derived as 2048 m");
  assert(background.mapTitle === "Flat MAP", "map title parsed");
  assert(background.canvas.width === 2049, "hillshade canvas rendered");
  assert(background.placeables.length === 1 && background.placeables[0].label === "trailerHouse", "placeable icon parsed");
  assert(
    background.vehicles.length === 1 && background.vehicles[0].label === "vario900" && Math.abs(background.vehicles[0].z + 55.177) < 1e-6,
    "vehicle position from child component"
  );
  // real savegame ground truth: placeables sit at y=128.000 on this map
  const th = bgMod.terrainHeightAt(background, -296.356, -168.16);
  assert(th !== null && Math.abs(th - 128) < 0.1, `terrain height ~128 m at placeable, got ${th}`);
  assert(bgMod.terrainHeightAt(background, 5000, 0) === null, "outside-map sampling returns null");
  const netForY = { waypoints: new Map(), markers: [], groups: ["All"], mapName: "", routeAuthor: "", routeVersion: "", nextId: 1 };
  assert(Math.abs(bgMod.nodeHeightAt(background, netForY, 10, 10) - 128) < 0.1, "new node height from terrain");

  // ---- update channel logic ----
  const upd = await import("/src/model/updates.ts");
  assert(upd.compareVersions("0.1.0", "0.1.0") === 0, "semver equal");
  assert(upd.compareVersions("0.2.0", "0.1.9") > 0, "semver minor beats patch");
  assert(upd.compareVersions("0.1.1-dev.2", "0.1.1-dev.10") < 0, "numeric prerelease compare (2 < 10)");
  assert(upd.compareVersions("0.1.1", "0.1.1-dev.10") > 0, "release beats prerelease");
  assert(upd.compareVersions("v0.1.1-dev.3", "0.1.0") > 0, "dev build of next patch beats current stable");
  const releases = [
    { tag: "v0.1.0", version: "0.1.0", name: "v0.1.0", draft: false, prerelease: false, createdAt: "", publishedAt: "", htmlUrl: "", body: "", assets: [] },
    { tag: "v0.1.1-dev.5", version: "0.1.1-dev.5", name: "dev5", draft: true, prerelease: true, createdAt: "", publishedAt: null, htmlUrl: "", body: "", assets: [{ id: 1, name: "AutoDrive-Editor-Setup-0.1.1-dev.5.exe", size: 1, apiUrl: "" }] },
    { tag: "v0.1.1-dev.9", version: "0.1.1-dev.9", name: "dev9", draft: true, prerelease: true, createdAt: "", publishedAt: null, htmlUrl: "", body: "", assets: [] },
  ];
  assert(upd.pickLatest(releases, "stable")?.version === "0.1.0", "stable channel ignores drafts/prereleases");
  assert(upd.pickLatest(releases, "unstable")?.version === "0.1.1-dev.9", "unstable channel picks newest dev build");
  // dev builds ship as published (non-draft) prereleases — visible without a token
  const published = [
    releases[0],
    { ...releases[2], tag: "v0.1.1-dev.12", version: "0.1.1-dev.12", draft: false, prerelease: true },
  ];
  assert(upd.pickLatest(published, "unstable")?.version === "0.1.1-dev.12", "published prerelease found on unstable channel");
  assert(upd.pickLatest(published, "stable")?.version === "0.1.0", "published prerelease still hidden from stable channel");
  assert(upd.assetForPlatform(releases[1], "win32")?.name.endsWith(".exe"), "windows asset matched");
  assert(upd.assetForPlatform(releases[1], "linux") === null, "no linux asset in that release");

  return out;
}, sampleXml);

let failed = 0;
for (const r of results) {
  console.log(r);
  if (r.startsWith("FAIL")) failed++;
}
console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} TESTS FAILED`);
await browser.close();
await server.close();
process.exit(failed === 0 ? 0 : 1);
