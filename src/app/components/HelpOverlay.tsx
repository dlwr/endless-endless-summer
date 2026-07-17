const SHORTCUTS: [string, string][] = [
  ["j / k", "next / previous post"],
  ["t", "reblog instantly"],
  ["shift+t", "reblog with comment"],
  ["l", "like / unlike"],
  ["o", "open original post"],
  ["r", "reroll the whole feed"],
  ["?", "toggle this help"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 閉じる操作は ? キーでも可能
    <div
      className="help-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="help-panel">
        <h2>Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.map(([keys, description]) => (
            <div className="help-row" key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
