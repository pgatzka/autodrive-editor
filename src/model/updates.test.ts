import { describe, expect, it } from "vitest";
import { assetForPlatform, compareVersions, pickLatest, ReleaseInfo } from "./updates";

function release(version: string, overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    tag: `v${version}`,
    version,
    name: `v${version}`,
    draft: false,
    prerelease: false,
    createdAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    htmlUrl: "",
    body: "",
    assets: [],
    ...overrides,
  };
}

describe("compareVersions", () => {
  it("orders release versions", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v0.1.1", "0.1.0")).toBeGreaterThan(0);
  });

  it("orders prereleases below their release and numerically among themselves", () => {
    expect(compareVersions("0.1.1-dev.2", "0.1.1-dev.10")).toBeLessThan(0);
    expect(compareVersions("0.1.1", "0.1.1-dev.10")).toBeGreaterThan(0);
    expect(compareVersions("0.1.1-dev.3", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.1-alpha", "0.1.1-alpha.1")).toBeLessThan(0);
    expect(compareVersions("0.1.1-alpha", "0.1.1-beta")).toBeLessThan(0);
    expect(compareVersions("0.1.1-1", "0.1.1-alpha")).toBeLessThan(0);
  });

  it("tolerates malformed versions", () => {
    expect(compareVersions("", "0.0.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0+build", "1.0.0")).toBe(0);
  });
});

describe("pickLatest", () => {
  const releases = [
    release("0.1.0"),
    release("0.1.1-dev.5", { draft: true, prerelease: true }),
    release("0.1.1-dev.9", { draft: true, prerelease: true }),
    release("0.1.1-dev.12", { prerelease: true }),
  ];

  it("ignores drafts and prereleases on the stable channel", () => {
    expect(pickLatest(releases, "stable")?.version).toBe("0.1.0");
  });

  it("takes the newest build on the unstable channel", () => {
    expect(pickLatest(releases, "unstable")?.version).toBe("0.1.1-dev.12");
  });

  it("returns null when nothing matches", () => {
    expect(pickLatest([release("0.1.0", { prerelease: true })], "stable")).toBeNull();
    expect(pickLatest([], "unstable")).toBeNull();
  });
});

describe("assetForPlatform", () => {
  const withAssets = release("1.0.0", {
    assets: [
      { id: 1, name: "AutoDrive-Editor-Setup-1.0.0.exe", size: 1, apiUrl: "exe" },
      { id: 2, name: "AutoDrive-Editor-1.0.0.AppImage", size: 1, apiUrl: "appimage" },
    ],
  });

  it("matches the installer for the running platform", () => {
    expect(assetForPlatform(withAssets, "win32")?.apiUrl).toBe("exe");
    expect(assetForPlatform(withAssets, "linux")?.apiUrl).toBe("appimage");
  });

  it("returns null when the platform has no installer", () => {
    expect(assetForPlatform(withAssets, "darwin")).toBeNull();
  });
});
