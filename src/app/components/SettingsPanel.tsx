import type { PostKind } from "../../shared/types";
import type { FilterSettings } from "../settings";

const KINDS: PostKind[] = ["text", "image", "link", "audio", "video"];

type Props = {
  settings: FilterSettings;
  onChange: (settings: FilterSettings) => void;
  onClose: () => void;
};

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="settings-panel">
      <h2>Post types</h2>
      {KINDS.map((kind) => (
        <label key={kind} className="settings-row">
          <input
            type="checkbox"
            checked={settings.kinds[kind]}
            onChange={(e) =>
              onChange({
                kinds: { ...settings.kinds, [kind]: e.target.checked },
              })
            }
          />
          {kind}
        </label>
      ))}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
