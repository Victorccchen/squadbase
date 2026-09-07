import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMinutesToOffsetIso,
  formatClubDateTime,
  formatClubDateWithWeekday,
  formatClubTime,
  formatParentVisibleDateTimeRange,
  isEndsAfterStart,
  isGuardianCancelLocked,
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
    assert.equal(
      isSessionOpenForSignup(
        {
          status: "active",
          ends_at: "2026-09-10T12:00:00.000Z",
          deleted_at: "2026-09-09T00:00:00.000Z",
        },
        now,
      ),
      false,
    );
  });
});

describe("isGuardianCancelLocked", () => {
  const now = new Date("2026-09-10T10:00:00.000Z");

  it("locks at or inside 24 hours of starts_at, matching timestamptz now()+24h", () => {
    assert.equal(isGuardianCancelLocked("2026-09-11T10:00:00.000Z", now), true);
    assert.equal(isGuardianCancelLocked("2026-09-11T09:59:59.000Z", now), true);
    assert.equal(isGuardianCancelLocked("2026-09-10T09:00:00.000Z", now), true);
    assert.equal(isGuardianCancelLocked("2026-09-11T10:00:01.000Z", now), false);
    assert.equal(isGuardianCancelLocked("2026-09-12T10:00:00.000Z", now), false);
  });

  it("locks invalid timestamps (fail closed)", () => {
    assert.equal(isGuardianCancelLocked("", now), true);
    assert.equal(isGuardianCancelLocked("not-a-date", now), true);
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

describe("formatClubTime", () => {
  it("formats clock time only in Taipei", () => {
    const text = formatClubTime("2026-09-10T10:00:00.000Z", "en");
    assert.match(text, /18:00/);
    assert.equal(text.includes("Sep"), false);
  });
});

describe("T6P-3 weekday labels three locales", () => {
  const sunday = "2026-09-20T00:00:00+08:00";
  const monday = "2026-09-21T18:00:00+08:00";

  it("appends locale weekday after the Asia/Taipei calendar date", () => {
    assert.equal(formatClubDateWithWeekday(sunday, "zh-Hant"), "2026-09-20（週日）");
    assert.equal(formatClubDateWithWeekday(sunday, "en"), "2026-09-20 (Sun)");
    assert.equal(formatClubDateWithWeekday(sunday, "ja"), "2026-09-20（日曜）");
    assert.equal(formatClubDateWithWeekday(monday, "zh-Hant"), "2026-09-21（週一）");
    assert.equal(formatClubDateWithWeekday(monday, "en"), "2026-09-21 (Mon)");
    assert.equal(formatClubDateWithWeekday(monday, "ja"), "2026-09-21（月曜）");
  });

  it("keeps weekday when a UTC instant falls on the next Taipei calendar day", () => {
    assert.equal(formatClubDateWithWeekday("2026-09-19T16:00:00.000Z", "zh-Hant"), "2026-09-20（週日）");
  });

  it("includes weekday in parent-visible ranges", () => {
    const range = formatParentVisibleDateTimeRange(
      "2026-09-20T10:00:00+08:00",
      "2026-09-20T11:30:00+08:00",
      "zh-Hant",
    );
    assert.match(range, /2026-09-20（週日）/);
    assert.match(range, /10:00/);
    assert.match(range, /11:30/);
  });
});
