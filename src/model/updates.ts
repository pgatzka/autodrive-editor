export type UpdateChannel = "stable" | "unstable";

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  apiUrl: string;
}

export interface ReleaseInfo {
  tag: string;
  version: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string | null;
  htmlUrl: string;
  body: string;
  assets: ReleaseAsset[];
}

/**
 * Semver comparison including prerelease rules:
 * 1.0.0-dev.2 < 1.0.0-dev.10 < 1.0.0
 * Returns negative / zero / positive like a sort comparator.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1; // release > prerelease
  if (pb.pre.length === 0) return -1;
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1; // shorter prerelease list is lower
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x) ? Number(x) : null;
    const yn = /^\d+$/.test(y) ? Number(y) : null;
    if (xn !== null && yn !== null) {
      if (xn !== yn) return xn - yn;
    } else if (xn !== null) {
      return -1; // numeric identifiers are lower than alphanumeric
    } else if (yn !== null) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function parseVersion(v: string): { core: number[]; pre: string[] } {
  const cleaned = v.replace(/^v/, "").split("+")[0];
  const [core, ...preParts] = cleaned.split("-");
  const pre = preParts.length ? preParts.join("-").split(".") : [];
  const nums = core.split(".").map((n) => {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  while (nums.length < 3) nums.push(0);
  return { core: nums, pre };
}

/**
 * Pick the newest release for a channel.
 * stable: published full releases only.
 * unstable: everything, including drafts (visible with a token) and prereleases.
 */
export function pickLatest(releases: ReleaseInfo[], channel: UpdateChannel): ReleaseInfo | null {
  const eligible = channel === "stable" ? releases.filter((r) => !r.draft && !r.prerelease) : releases;
  if (eligible.length === 0) return null;
  return eligible.slice().sort((a, b) => compareVersions(b.version, a.version))[0];
}

/** The installer asset for the current OS, if the release carries one. */
export function assetForPlatform(release: ReleaseInfo, platform: string): ReleaseAsset | null {
  const ext = platform === "win32" ? ".exe" : platform === "darwin" ? ".dmg" : ".appimage";
  return release.assets.find((a) => a.name.toLowerCase().endsWith(ext)) ?? null;
}
