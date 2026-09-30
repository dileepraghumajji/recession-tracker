import { describe, expect, it } from "vitest";
import { relativeAge } from "./live-status";

describe("relativeAge", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  it("formats recent, minute, hour and day ages", () => {
    expect(relativeAge("2026-09-30T11:59:30Z", now)).toBe("just now");
    expect(relativeAge("2026-09-30T11:55:00Z", now)).toBe("5m ago");
    expect(relativeAge("2026-09-30T09:00:00Z", now)).toBe("3h ago");
    expect(relativeAge("2026-09-27T12:00:00Z", now)).toBe("3d ago");
  });
  it("never shows a negative age for clock skew", () => {
    expect(relativeAge("2026-09-30T12:05:00Z", now)).toBe("just now");
  });
});
