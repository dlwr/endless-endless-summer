import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("settings", () => {
  it("保存前はデフォルト(全 kind 有効)を返す", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("save したものが load で返る", () => {
    const s = { kinds: { ...DEFAULT_SETTINGS.kinds, video: false } };
    saveSettings(s);
    expect(loadSettings().kinds.video).toBe(false);
  });

  it("壊れた JSON はデフォルトにフォールバックする", () => {
    localStorage.setItem("ees:settings", "{broken");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
