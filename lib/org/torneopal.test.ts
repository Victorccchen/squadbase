import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { canonicalClubTeamName, looksLikeClubTeamName } from "./torneopal-aliases.ts";
import { isTorneopalHostname } from "./torneopal-hosts.ts";
import { fetchTorneopalHtml } from "./torneopal-fetch.ts";
import { parseTorneopalScheduleHtml } from "./torneopal-parse.ts";
import {
  buildTorneopalPreview,
  parseTorneopalPreviewJson,
  serializeTorneopalPreview,
  type ExistingMatchShell,
} from "./torneopal-preview.ts";
import { emptyImportCatalog, type ImportCatalog, type ImportTeam } from "./import-validate.ts";
import { assertSafePublicUrl } from "./url-ssrf.ts";

const root = dirname(fileURLToPath(import.meta.url));
const FIXTURE_HTML = readFileSync(join(root, "fixtures/torneopal-schedule.html"), "utf8");

const TEAM_IDS = {
  u8: "11111111-1111-4111-8111-111111111111",
  u9: "22222222-2222-4222-8222-222222222222",
  u10: "33333333-3333-4333-8333-333333333333",
  u11: "44444444-4444-4444-8444-444444444444",
  u12y: "55555555-5555-4555-8555-555555555555",
  u12b: "66666666-6666-4666-8666-666666666666",
} as const;

function team(
  id: string,
  name: string,
  ageBand: string,
  layerKey: string,
): ImportTeam {
  return {
    id,
    name,
    kind: "competition_team",
    age_band: ageBand,
    layer_key: layerKey,
    eligible_birth_ages: [ageBand],
    status: "active",
  };
}

function catalog(overrides: Partial<ImportCatalog> = {}): ImportCatalog {
  return {
    ...emptyImportCatalog(),
    teams: [
      team(TEAM_IDS.u8, "Futuro U8", "U8", "u8"),
      team(TEAM_IDS.u9, "Futuro U9", "U8", "u9"),
      team(TEAM_IDS.u10, "Futuro U10", "U10", "u10"),
      team(TEAM_IDS.u11, "Futuro U11", "U10", "u10"),
      team(TEAM_IDS.u12y, "Futuro U12 黃", "U12", "u12"),
      team(TEAM_IDS.u12b, "Futuro U12 藍", "U12", "u12"),
    ],
    ...overrides,
  };
}

describe("TL-1 parser fixture HTML", () => {
      it("reads schedule date headers and team-page ml_pvm dates without throwing", () => {
    const parsed = parseTorneopalScheduleHtml(FIXTURE_HTML);
    assert.equal(parsed.pageTitle, "Taichung 26/27");
    assert.equal(parsed.seasonStartYear, 2026);
    assert.ok(parsed.fixtures.length >= 12);
    const u8 = parsed.fixtures.find((row) => row.home === "台中FUTURO U8" && row.away === "台中藍鯨U8");
    assert.ok(u8);
    assert.equal(u8?.startsAt, "2026-09-20T14:00:00+08:00");
    const october = parsed.fixtures.find((row) => row.away === "SAMURAI" && row.home === "台中FUTURO U8");
    assert.equal(october?.startsAt, "2026-10-04T14:00:00+08:00");
    const scored = parsed.fixtures.find((row) => row.away === "ORIGINAL FC");
    assert.equal(scored?.startsAt, null);
    assert.doesNotThrow(() => parseTorneopalScheduleHtml("<html>not a schedule</html>"));
    assert.equal(parseTorneopalScheduleHtml("<html>not a schedule</html>").fixtures.length, 0);
    const classNotFirst = parseTorneopalScheduleHtml(
      `<html><title>Taichung 26/27</title><ul><li id="d1" class="title">Sun 20.9.2026</li><li id="m1" class="match played"><div class="ml_kotisiisti">台中FUTURO U8</div><div class="ml_tulosklo">14:00</div><div class="ml_vierassiisti">X</div></li></ul></html>`,
    );
    assert.equal(classNotFirst.fixtures.length, 1);
    assert.equal(classNotFirst.fixtures[0]?.startsAt, "2026-09-20T14:00:00+08:00");
  });
});

describe("TL-2 alias map", () => {
  it("maps Torneopal Futuro names onto the six exact 隊伍, collapsing U10 白/藍", () => {
    assert.equal(canonicalClubTeamName("台中FUTURO U8"), "Futuro U8");
    assert.equal(canonicalClubTeamName("台中FUTURO U9"), "Futuro U9");
    assert.equal(canonicalClubTeamName("台中FUTURO U10"), "Futuro U10");
    assert.equal(canonicalClubTeamName("台中FUTURO U10白"), "Futuro U10");
    assert.equal(canonicalClubTeamName("台中FUTURO U10藍"), "Futuro U10");
    assert.equal(canonicalClubTeamName("Futuro U10白"), "Futuro U10");
    assert.equal(canonicalClubTeamName("U10藍"), "Futuro U10");
    assert.equal(canonicalClubTeamName("台中FUTURO U11"), "Futuro U11");
    assert.equal(canonicalClubTeamName("台中FUTURO U12 黃"), "Futuro U12 黃");
    assert.equal(canonicalClubTeamName("台中FUTURO U12 藍"), "Futuro U12 藍");
    assert.equal(canonicalClubTeamName("Futuro U12 Yellow"), "Futuro U12 黃");
    assert.equal(canonicalClubTeamName("U12藍"), "Futuro U12 藍");
    assert.equal(canonicalClubTeamName("台中FUTURO U13"), null);
    assert.equal(looksLikeClubTeamName("台中FUTURO U13"), true);
    assert.equal(looksLikeClubTeamName("足夢蜻蜓"), false);
  });
});

describe("TL-3 preview mapping", () => {
  it("creates unpublished league shells, skips duplicates, and keeps row errors inline", () => {
    const parsed = parseTorneopalScheduleHtml(FIXTURE_HTML);
    const existing: ExistingMatchShell[] = [];
    const preview = buildTorneopalPreview({
      sourceUrl: "https://taichung.torneopal.com/",
      parsed,
      teams: catalog().teams,
      existing,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      return;
    }
    assert.equal(
      preview.rows.some((row) => row.summary.includes("足夢蜻蜓") && row.summary.includes("LCFC")),
      false,
    );
    const creates = preview.rows.filter((row) => row.status === "create");
    const skips = preview.rows.filter((row) => row.status === "skip");
    const errors = preview.rows.filter((row) => row.status === "error");
    assert.equal(creates.length, 11);
    assert.equal(skips.length, 1);
    assert.equal(errors.length, 2);
    assert.ok(skips[0]?.errorKeys.includes("duplicateMatch"));
    assert.ok(errors.some((row) => row.errorKeys.includes("unmappedTeam")));
    assert.ok(errors.some((row) => row.errorKeys.includes("invalidSessionTime")));

    const derby = creates.filter((row) => row.draft?.startsAt === "2026-09-20T15:00:00+08:00");
    assert.equal(derby.length, 2);
    const derbyTeams = new Set(derby.map((row) => row.draft?.teamRef));
    assert.deepEqual([...derbyTeams].sort(), [TEAM_IDS.u12y, TEAM_IDS.u12b].sort());
    assert.ok(derby.every((row) => row.draft?.kind === "league" && row.draft.isPublished === false));

    const u10Rows = creates.filter((row) => row.draft?.teamRef === TEAM_IDS.u10);
    assert.equal(u10Rows.length, 3);

    const json = serializeTorneopalPreview(preview);
    const roundTrip = parseTorneopalPreviewJson(json);
    assert.equal(roundTrip?.createCount, 11);
    assert.equal(roundTrip?.rows[0]?.summary.includes("Futuro"), true);

    const again = buildTorneopalPreview({
      sourceUrl: "https://taichung.torneopal.com/",
      parsed,
      teams: catalog().teams,
      existing: [
        {
          teamId: TEAM_IDS.u8,
          startsAt: "2026-09-20T14:00:00+08:00",
          opponent: "台中藍鯨U8",
        },
      ],
    });
    assert.equal(again.ok, true);
    if (!again.ok) {
      return;
    }
    assert.equal(again.rows.filter((row) => row.status === "skip").length, 2);
  });
});

describe("TL-4 allowlist", () => {
  it("allows Torneopal hosts and blocks others without fetching", async () => {
    assert.equal(isTorneopalHostname("taichung.torneopal.com"), true);
    assert.equal(isTorneopalHostname("victoryleague.torneopal.com"), true);
    assert.equal(isTorneopalHostname("spl.torneopal.fi"), true);
    assert.equal(isTorneopalHostname("example.com"), false);
    assert.equal(assertSafePublicUrl("http://127.0.0.1/").ok, false);

    let fetched = false;
    const blocked = await fetchTorneopalHtml("https://example.com/schedule", {
      fetch: async () => {
        fetched = true;
        return new Response("<html></html>");
      },
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.errorKey, "blockedUrl");
    }
    assert.equal(fetched, false);

    const loopback = await fetchTorneopalHtml("http://127.0.0.1/", {
      fetch: async () => {
        fetched = true;
        return new Response("nope");
      },
    });
    assert.equal(loopback.ok, false);
    assert.equal(fetched, false);

    const ok = await fetchTorneopalHtml("https://taichung.torneopal.com/", {
      lookup: async () => [{ address: "1.2.3.4", family: 4 }],
      fetch: async () => new Response(FIXTURE_HTML, { headers: { "content-type": "text/html" } }),
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.match(ok.html, /台中FUTURO U8/);
    }
  });
});
