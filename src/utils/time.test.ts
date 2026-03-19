import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { formatRelativeTimeShort } from "./time";

describe("time", () => {
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-19T10:00:00Z").getTime(),
    );
    await initializeI18n();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats short relative time in English when UI language is English", async () => {
    await i18n.changeLanguage("en");

    expect(formatRelativeTimeShort(Date.now() + 60 * 60 * 1000)).toBe("1h");
  });

  it("formats short relative time in Chinese when UI language is Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    expect(formatRelativeTimeShort(Date.now() + 60 * 60 * 1000)).toBe("1小时");
  });
});
