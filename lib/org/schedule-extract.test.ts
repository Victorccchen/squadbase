import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  extractScheduleStructured,
  looksLikeLoginWall,
  parsePublicScheduleHtml,
} from "./schedule-extract.ts";
import { buildTorneopalPreview, type ExistingMatchShell } from "./torneopal-preview.ts";
import { emptyImportCatalog, type ImportCatalog, type ImportTeam } from "./import-validate.ts";
import { fetchScheduleHtml } from "./torneopal-fetch.ts";
import { fetchPublicHtml } from "./url-ssrf.ts";

const root = dirname(fileURLToPath(import.meta.url));
const GENERIC_HTML = readFileSync(join(root, "fixtures/generic-schedule.html"), "utf8");
const TORNEOPAL_HTML = readFileSync(join(root, "fixtures/torneopal-schedule.html"), "utf8");

const TEAM_IDS = {
  u8: "11111111-1111-4111-8111-111111111111",
  u9: "22222222-2222-4222-8222-222222222222",
  u10: "33333333-3333-4333-8333-333333333333",
  u11: "44444444-4444-4444-8444-444444444444",
} as const;

function team(id: string, name: string, ageBand: string, layerKey: string): ImportTeam {
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
    ],
    ...overrides,
  };
}

describe("L3-2 generic HTML fixture", () => {
  it("extracts table, JSON-LD, and visible-text fixtures without a live network", () => {
    const parsed = extractScheduleStructured(GENERIC_HTML);
    assert.equal(parsed.pageTitle, "Victory Cup 2026");
    const u8 = parsed.fixtures.find((row) => row.home === "Futuro U8" && row.away === "Blue Whales U8");
    assert.ok(u8);
    assert.equal(u8?.startsAt, "2026-09-20T14:00:00+08:00");
    assert.equal(u8?.venue, "Chaoma B");
    const jsonLd = parsed.fixtures.find(
      (row) => row.home === "Futuro U11" && row.away === "Iron Goats",
    );
    assert.ok(jsonLd);
    assert.equal(jsonLd?.startsAt, "2026-09-21T16:00:00+08:00");
    const visible = parsed.fixtures.find(
      (row) => row.home === "Futuro U10" && row.away === "SAMURAI A",
    );
    assert.ok(visible);
    assert.equal(visible?.startsAt, "2026-09-22T10:00:00+08:00");
    const missingKickoff = parsed.fixtures.find(
      (row) => row.home === "Futuro U9" && row.away === "NTES",
    );
    assert.equal(missingKickoff?.startsAt, null);
    const unmapped = parsed.fixtures.find((row) => row.home.includes("U13"));
    assert.ok(unmapped);
  });

  it("previews create / row-error shells and does not write", () => {
    const parsed = parsePublicScheduleHtml(GENERIC_HTML);
    assert.equal(parsed.source, "structured");
    assert.equal(parsed.loginWall, false);
    const existing: ExistingMatchShell[] = [];
    const preview = buildTorneopalPreview({
      sourceUrl: "https://league.example/fixtures",
      parsed,
      teams: catalog().teams,
      existing,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      return;
    }
    const creates = preview.rows.filter((row) => row.status === "create");
    const errors = preview.rows.filter((row) => row.status === "error");
    assert.ok(creates.some((row) => row.draft?.teamRef === TEAM_IDS.u8));
    assert.ok(creates.some((row) => row.draft?.teamRef === TEAM_IDS.u11));
    assert.ok(creates.some((row) => row.draft?.teamRef === TEAM_IDS.u10));
    assert.ok(creates.every((row) => row.draft?.kind === "league" && row.draft.isPublished === false));
    assert.ok(errors.some((row) => row.errorKeys.includes("unmappedTeam")));
    assert.ok(errors.some((row) => row.errorKeys.includes("invalidSessionTime")));
  });
});

describe("L3 Torneopal remains a fast path", () => {
  it("still prefers the Torneopal parser when that HTML is present", () => {
    const parsed = parsePublicScheduleHtml(TORNEOPAL_HTML);
    assert.equal(parsed.source, "torneopal");
    assert.ok(parsed.fixtures.length >= 12);
  });
});

describe("L3 login wall", () => {
  it("flags a public login page and does not invent fixtures", () => {
    const html = `<html><title>Sign in</title><body><form><input type="password" name="password"><button>Log in</button></form></body></html>`;
    assert.equal(looksLikeLoginWall(html), true);
    const parsed = parsePublicScheduleHtml(html);
    assert.equal(parsed.loginWall, true);
    assert.equal(parsed.fixtures.length, 0);
  });
});

describe("L3 fetch policy", () => {
  it("allows a non-Torneopal public host and still blocks SSRF", async () => {
    let fetched = false;
    const ok = await fetchScheduleHtml("https://league.example/fixtures", {
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetch: async () => {
        fetched = true;
        return new Response(GENERIC_HTML, { headers: { "content-type": "text/html" } });
      },
    });
    assert.equal(ok.ok, true);
    assert.equal(fetched, true);
    if (ok.ok) {
      assert.match(ok.html, /Victory Cup 2026/);
    }

    fetched = false;
    const loopback = await fetchScheduleHtml("http://127.0.0.1/", {
      fetch: async () => {
        fetched = true;
        return new Response("nope");
      },
    });
    assert.equal(loopback.ok, false);
    if (!loopback.ok) {
      assert.equal(loopback.errorKey, "blockedUrl");
    }
    assert.equal(fetched, false);

    const login = await fetchPublicHtml("https://league.example/private", {
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      fetch: async () => new Response("login", { status: 401 }),
    });
    assert.equal(login.ok, false);
    if (!login.ok) {
      assert.equal(login.errorKey, "urlLoginRequired");
    }
  });
});
