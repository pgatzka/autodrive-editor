import { useEffect, useState } from "react";
import { errorMessage } from "../../model/errors";
import {
  assetForPlatform,
  compareVersions,
  pickLatest,
  ReleaseInfo,
  UpdateChannel,
} from "../../model/updates";
import { AdBridge, bridge } from "../../state/store";

/** In-app updater: stable releases or automatically published dev builds. */
export function UpdatePanel() {
  const adBridge = bridge();
  return adBridge ? (
    <UpdateControls bridge={adBridge} />
  ) : (
    <p className="hint">Updates are only available in the desktop app.</p>
  );
}

function UpdateControls({ bridge: adBridge }: { bridge: AdBridge }) {
  const [version, setVersion] = useState("dev");
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [latest, setLatest] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    void adBridge.getVersion().then(setVersion);
    void adBridge.loadSettings().then((settings) => {
      const stored = settings.updateChannel;
      if (stored === "stable" || stored === "unstable") setChannel(stored);
    });
  }, [adBridge]);

  const selectChannel = (next: UpdateChannel) => {
    setChannel(next);
    setLatest(null);
    setStatus("");
    void adBridge
      .loadSettings()
      .then((settings) => adBridge.saveSettings({ ...settings, updateChannel: next }));
  };

  const check = async () => {
    setBusy(true);
    setStatus("Checking…");
    setLatest(null);
    try {
      const releases = (await adBridge.checkUpdates(undefined)) as ReleaseInfo[];
      const found = pickLatest(releases, channel);
      setLatest(found);
      setStatus(found ? describeUpdate(found, version, channel) : "No releases found on this channel yet.");
    } catch (error) {
      setStatus(`Check failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!latest) return;
    const asset = assetForPlatform(latest, adBridge.platform);
    if (!asset) {
      setStatus(`Release ${latest.version} has no installer for this platform.`);
      return;
    }
    setBusy(true);
    setStatus(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
    try {
      const result = await adBridge.downloadUpdate(asset, undefined);
      setStatus(
        result.launched
          ? "Installer started — it will replace this installation. The app may close."
          : `Saved to ${result.path}. Run it to update.`
      );
    } catch (error) {
      setStatus(`Download failed: ${errorMessage(error)}`);
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
        <ChannelRadio label="Stable" value="stable" active={channel} onSelect={selectChannel} />
        <ChannelRadio
          label="Unstable (dev builds)"
          value="unstable"
          active={channel}
          onSelect={selectChannel}
        />
      </div>
      {channel === "unstable" && (
        <p className="hint">Dev builds are published automatically from every change on main.</p>
      )}

      <div className="row">
        <button disabled={busy} onClick={() => void check()}>
          Check for updates
        </button>
        {updateAvailable && (
          <button disabled={busy} onClick={() => void download()}>
            Download &amp; install
          </button>
        )}
      </div>
      {status && <p className="hint">{status}</p>}
      {latest && <ReleaseSummary release={latest} onOpen={(url) => void adBridge.openReleasePage(url)} />}
    </div>
  );
}

function ChannelRadio({
  label,
  value,
  active,
  onSelect,
}: {
  label: string;
  value: UpdateChannel;
  active: UpdateChannel;
  onSelect: (channel: UpdateChannel) => void;
}) {
  return (
    <label className="row">
      <input type="radio" name="channel" checked={active === value} onChange={() => onSelect(value)} />
      {label}
    </label>
  );
}

function ReleaseSummary({ release, onOpen }: { release: ReleaseInfo; onOpen: (url: string) => void }) {
  const kind = release.draft ? "draft" : release.prerelease ? "prerelease" : "release";
  return (
    <div className="group-block">
      <p className="hint">
        {release.name} · {kind} · {new Date(release.publishedAt ?? release.createdAt).toLocaleDateString()}
      </p>
      {!release.draft && (
        <button className="link" onClick={() => onOpen(release.htmlUrl)}>
          Open release page
        </button>
      )}
    </div>
  );
}

function describeUpdate(release: ReleaseInfo, installed: string, channel: UpdateChannel): string {
  const comparison = compareVersions(release.version, installed);
  if (comparison > 0) return `Update available: ${release.version} (installed: ${installed})`;
  if (comparison === 0) return `You are up to date (${installed}).`;
  return `Installed version ${installed} is newer than the latest ${channel} release (${release.version}).`;
}
