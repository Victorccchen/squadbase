import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMinutesToOffsetIso,
  formatClubDateTime,
  isEndsAfterStart,
  isSessionOpenForSignup,
  parseClubDateTimeLocal,
  parseDurationMinutes,
  toDateTimeLocalInput,
} from "./session-time.ts";

describe("parseClubDateTimeLocal", () => {
  it("maps Taipei wall time to +08:00", () => {
    assert.equal(parseClubDateTimeLocal("2026-09-10T18:00"), "2026-09-10T18:00:00+08:00");
    assert.equal(parseClubDateTimeLocal("2026-09-10T18:00:30"), "2026-09-10T18:00:30+08:00");
  });

  it("rejects invalid calendar days and out-of-range clocks", () => {
    assert.equal(parseClubDateTimeLocal("2026-02-30T18:00"), null);
    assert.equal(parseClubDateTimeLocal("2026-09-10T24:00"), null);
    assert.equal(parseClubDateTimeLocal("2026-09-10 18:00"), null);
    assert.equal(parseClubDateTimeLocal(""), null);
  });
});

describe("parseDurationMinutes", () => {
  it("accepts 15–480 minutes", () => {
    assert.equal(parseDurationMinutes("15"), 15);
    assert.equal(parseDurationMinutes("90"), 90);
    assert.equal(parseDurationMinutes("480"), 480);
  });

  it("rejects too short, too long, or non-integers", () => {
    assert.equal(parseDurationMinutes("14"), null);
    assert.equal(parseDurationMinutes("481"), null);
    assert.equal(parseDurationMinutes("90.5"), null);
    assert.equal(parseDurationMinutes(""), null);
  });
});

describe("addMinutesToOffsetIso / isEndsAfterStart", () => {
  it("adds 90 minutes to a Taipei offset timestamp", () => {
    const end = addMinutesToOffsetIso("2026-09-10T18:00:00+08:00", 90);
    assert.equal(end, "2026-09-10T11:30:00.000Z");
    assert.equal(isEndsAfterStart("2026-09-10T18:00:00+08:00", end ?? ""), true);
  });

  it("rejects equal or reversed ranges", () => {
    assert.equal(
      isEndsAfterStart("2026-09-10T18:00:00+08:00", "2026-09-10T18:00:00+08:00"),
      false,
    );
    assert.equal(
      isEndsAfterStart("2026-09-10T19:00:00+08:00", "2026-09-10T18:00:00+08:00"),
      false,
    );
  });
});

describe("isSessionOpenForSignup", () => {
  const now = new Date("2026-09-10T10:00:00.000Z");

  it("is open only while active and not yet ended", () => {
    assert.equal(
      isSessionOpenForSignup(
        { status: "active", ends_at: "2026-09-10T12:00:00.000Z" },
        now,
      ),
      true,
    );
    assert.equal(
      isSessionOpenForSignup(
        { status: "inactive", ends_at: "2026-09-10T12:00:00.000Z" },
        now,
      ),
      false,
    );
    assert.equal(
      isSessionOpenForSignup(
        { status: "active", ends_at: "2026-09-10T09:00:00.000Z" },
        now,
      ),
      false,
    );
  });
});

describe("toDateTimeLocalInput", () => {
  it("renders a UTC instant as Taipei wall time", () => {
    assert.equal(toDateTimeLocalInput("2026-09-10T10:00:00.000Z"), "2026-09-10T18:00");
  });
});

describe("formatClubDateTime", () => {
  it("formats in the club time zone", () => {
    const text = formatClubDateTime("2026-09-10T10:00:00.000Z", "en");
    assert.match(text, /18:00/);
  });
});
