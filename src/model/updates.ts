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
  const left = parseVersion(a);
  const right = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  return comparePrerelease(left.pre, right.pre);
}

/** A release outranks any of its prereleases; otherwise compare identifier by identifier. */
function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    // a shorter identifier list ranks lower (1.0.0-alpha < 1.0.0-alpha.1)
    if (i >= left.length) return -1;
    if (i >= right.length) return 1;
    const result = compareIdentifier(left[i], right[i]);
    if (result !== 0) return result;
  }
  return 0;
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);
  // numeric identifiers always rank below alphanumeric ones
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left === right ? 0 : left < right ? -1 : 1;
}

function asNumber(identifier: string): number | null {
  return /^\d+$/.test(identifier) ? Number(identifier) : null;
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
