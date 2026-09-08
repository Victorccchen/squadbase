import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIcs,
  calendarEventFromPublicFields,
  calendarTextHasForbiddenPrivateFields,
  googleCalendarUrl,
  icsFilename,
  outlookCalendarUrl,
  toUtcBasic,
} from "./calendar-export.ts";

const PUBLIC_FIELDS = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Victory League",
  starts_at: "2026-09-20T10:00:00.000Z",
  ends_at: "2026-09-20T11:30:00.000Z",
  location: "Taipei Stadium",
  kind: "league" as const,
  opponent: "Rivals FC",
};

const LABELS = { kindLabel: "League", opponentTbd: "TBD" };

describe("T6P-7 Google/.ics calendar", () => {
  it("builds ICS and Google URLs with title, times, location, and short description", () => {
    const event = calendarEventFromPublicFields(PUBLIC_FIELDS, LABELS);
    const ics = buildIcs(event, new Date("2026-09-01T00:00:00.000Z"));
    const google = googleCalendarUrl(event);
    const outlook = outlookCalendarUrl(event);

    assert.equal(toUtcBasic(PUBLIC_FIELDS.starts_at), "20260920T100000Z");
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /SUMMARY:Victory League/);
    assert.match(ics, /DTSTART:20260920T100000Z/);
    assert.match(ics, /DTEND:20260920T113000Z/);
    assert.match(ics, /LOCATION:Taipei Stadium/);
    assert.match(ics, /DESCRIPTION:League\. Rivals FC/);
    assert.equal(ics.includes("BEGIN:VEVENT"), true);
    assert.match(google, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    assert.match(google, /text=Victory(\+|%20)League/);
    assert.match(google, /20260920T100000Z/);
    assert.match(google, /20260920T113000Z/);
    assert.match(google, /location=Taipei(\+|%20)Stadium/);
    assert.match(outlook, /^https:\/\/outlook\.live\.com\/calendar\//);
    assert.match(outlook, /subject=Victory/);
    assert.equal(icsFilename("Victory League"), "victory-league.ics");
  });

  it("includes opponent for friendly matches", () => {
    const event = calendarEventFromPublicFields(
      { ...PUBLIC_FIELDS, kind: "friendly", title: "Saturday friendly" },
      { kindLabel: "Friendly", opponentTbd: "TBD" },
    );
    assert.match(event.description ?? "", /Friendly/);
    assert.match(event.description ?? "", /Rivals FC/);
  });

  it("uses TBD when opponent is missing", () => {
    const event = calendarEventFromPublicFields(
      { ...PUBLIC_FIELDS, opponent: null },
      LABELS,
    );
    assert.equal(event.description, "League. TBD");
  });
});

describe("T6P-8 public calendar no private fields", () => {
  it("ignores phones, credits, assessments, and guardian fields on the source object", () => {
    const fat = {
      ...PUBLIC_FIELDS,
      phone: "SECRET_PHONE_0912345678",
      email: "secret@example.test",
      credits_available: 42,
      last5: "SECRET_LAST5",
      guardian_user_id: "SECRET_GUARDIAN",
      parent_note: "SECRET_PARENT_NOTE",
      notes: "SECRET_STAFF_NOTE",
      no_debit: true,
      debit_override_n: 9,
      situations: { attack: { score: 5, note: "SECRET_ASSESSMENT" } },
    };
    const event = calendarEventFromPublicFields(fat, LABELS);
    const ics = buildIcs(event, new Date("2026-09-01T00:00:00.000Z"));
    const google = googleCalendarUrl(event);
    const outlook = outlookCalendarUrl(event);
    const blob = `${JSON.stringify(event)}\n${ics}\n${google}\n${outlook}`;

    assert.equal(blob.includes("SECRET_"), false);
    assert.equal(blob.includes("0912345678"), false);
    assert.equal(blob.includes("secret@example.test"), false);
    assert.equal("phone" in event, false);
    assert.equal("credits_available" in event, false);
    assert.equal("guardian_user_id" in event, false);
    assert.equal(calendarTextHasForbiddenPrivateFields(ics), false);
  });
});
