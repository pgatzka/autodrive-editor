import { useEffect, useState } from "react";
import {
  assetForPlatform,
  compareVersions,
  pickLatest,
  ReleaseInfo,
  UpdateChannel,
} from "../model/updates";
import { bridge } from "../state/store";

export function UpdatePanel() {
  const b = bridge();
  const [version, setVersion] = useState("dev");
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [latest, setLatest] = useState<ReleaseInfo | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!b) return;
    void b.getVersion().then(setVersion);
    void b.loadSettings().then((s) => {
      if (s.updateChannel === "stable" || s.updateChannel === "unstable") setChannel(s.updateChannel);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!b) {
    return <p className="hint">Updates are only available in the desktop app.</p>;
  }

  const selectChannel = (next: UpdateChannel) => {
    setChannel(next);
    setChecked(false);
    setLatest(null);
    setStatus("");
    void b.loadSettings().then((s) => b.saveSettings({ ...s, updateChannel: next }));
  };

  const check = async () => {
    setBusy(true);
    setStatus("Checking…");
    setLatest(null);
    try {
      const releases = (await b.checkUpdates(undefined)) as ReleaseInfo[];
      const found = pickLatest(releases, channel);
      setLatest(found);
      setChecked(true);
      if (!found) {
        setStatus("No releases found on this channel yet.");
      } else {
        const cmp = compareVersions(found.version, version);
        setStatus(
          cmp > 0
            ? `Update available: ${found.version} (installed: ${version})`
            : cmp === 0
              ? `You are up to date (${version}).`
              : `Installed version ${version} is newer than the latest ${channel} release (${found.version}).`
        );
      }
    } catch (err) {
      setStatus(`Check failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!latest) return;
    const asset = assetForPlatform(latest, b.platform);
    if (!asset) {
      setStatus(`Release ${latest.version} has no installer for this platform.`);
      return;
    }
    setBusy(true);
    setStatus(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
    try {
      const result = await b.downloadUpdate(asset, undefined);
      setStatus(
        result.launched
          ? "Installer started — it will replace this installation. The app may close."
          : `Saved to ${result.path}. Run it to update.`
      );
    } catch (err) {
      setStatus(`Download failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const updateAvailable = latest !== null && compareVersions(latest.version, version) > 0;

  return (
    <div>
      <h4>Updates</h4>
      <p className="hint">Installed version: {version}</p>
      <div className="row">
        <label className="row">
          <input type="radio" name="channel" checked={channel === "stable"} onChange={() => selectChannel("stable")} />
          Stable
        </label>
        <label className="row">
          <input
            type="radio"
            name="channel"
            checked={channel === "unstable"}
            onChange={() => selectChannel("unstable")}
          />
          Unstable (dev builds)
        </label>
      </div>
      {channel === "unstable" && (
        <p className="hint">Dev builds are published automatically from every change on main.</p>
      )}
      <div className="row">
        <button disabled={busy} onClick={() => void check()}>
          Check for updates
        </button>
        {checked && updateAvailable && (
          <button disabled={busy} onClick={() => void download()}>
            Download &amp; install
          </button>
        )}
      </div>
      {status && <p className="hint">{status}</p>}
      {latest && (
        <div className="group-block">
          <p className="hint">
            {latest.name} · {latest.draft ? "draft" : latest.prerelease ? "prerelease" : "release"} ·{" "}
            {new Date(latest.publishedAt ?? latest.createdAt).toLocaleDateString()}
          </p>
          {!latest.draft && (
            <button className="link" onClick={() => void b.openReleasePage(latest.htmlUrl)}>
              Open release page
            </button>
          )}
        </div>
      )}
    </div>
  );
}
