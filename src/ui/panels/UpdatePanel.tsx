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
import { Button, Section, Segmented } from "../components/controls";

/**
 * The lowest-priority surface in the app: last in the File tab, and never
 * amber — an available update is informational, not a call to action
 * competing with Save.
 */
export function UpdatePanel() {
  const adBridge = bridge();
  if (!adBridge) return <p className="hint">Updates are only available in the desktop app.</p>;
  return <UpdateControls bridge={adBridge} />;
}

const CHANNELS = [
  { id: "stable" as const, label: "Stable", hint: "Published releases" },
  { id: "unstable" as const, label: "Unstable", hint: "Dev builds from every change on main" },
];

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
      setStatus(found ? describeUpdate(found, version, channel) : "No releases on this channel yet.");
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
    setStatus(`Downloading ${asset.name}…`);
    try {
      const result = await adBridge.downloadUpdate(asset, undefined);
      setStatus(
        result.launched
          ? "Installer started — it will replace this installation."
          : `Saved to ${result.path}. Run it to update.`
      );
    } catch (error) {
      setStatus(`Download failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const update = latest && compareVersions(latest.version, version) > 0 ? latest : null;

  return (
    <Section title="Updates">
      <div className="field-row">
        <span className="hint mono" style={{ flex: 1 }}>
          v{version}
        </span>
        <Segmented ariaLabel="Update channel" options={CHANNELS} value={channel} onChange={selectChannel} />
      </div>

      {update && (
        <div className="update-banner">
          <span className="grow">{update.version} available</span>
          <Button small onClick={() => void download()} disabled={busy}>
            Download &amp; install
          </Button>
        </div>
      )}

      <div className="field-row">
        <Button small variant="ghost" disabled={busy} onClick={() => void check()}>
          Check now
        </Button>
        {latest && !latest.draft && (
          <button className="link-btn" onClick={() => void adBridge.openReleasePage(latest.htmlUrl)}>
            Release notes
          </button>
        )}
      </div>
      {status && <p className="hint">{status}</p>}
    </Section>
  );
}

function describeUpdate(release: ReleaseInfo, installed: string, channel: UpdateChannel): string {
  const comparison = compareVersions(release.version, installed);
  if (comparison > 0) return `Update available: ${release.version}`;
  if (comparison === 0) return `You are up to date (${installed}).`;
  return `Installed ${installed} is newer than the latest ${channel} release (${release.version}).`;
}
