import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessAdmin } from "../auth/roles.ts";
import { parseCsv, recordsFromTable, stringifyCsv } from "./import-csv.ts";
import { parseImportBuffer } from "./import-file.ts";
import {
  parseCoachImportValues,
  parseMatchImportValues,
  parsePlayerImportValues,
} from "./import-parse.ts";
import {
  PLAYER_TEMPLATE_HEADERS,
  COACH_TEMPLATE_HEADERS,
  MATCH_TEMPLATE_HEADERS,
  templateCsv,
  templateRows,
  templateXlsx,
} from "./import-templates.ts";
import {
  buildImportPreview,
  headersAreValid,
  type ImportCatalog,
} from "./import-validate.ts";
import { workbookToXlsx } from "./import-xlsx-write.ts";
import { parseXlsxTable } from "./import-xlsx-read.ts";
import { extractMatchFieldsFromHtml } from "./url-extract.ts";
import { assertSafePublicUrl, fetchPublicHtml, isBlockedIp } from "./url-ssrf.ts";

const SQUAD_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";

function catalog(overrides: Partial<ImportCatalog> = {}): ImportCatalog {
  return {
    teams: [
      {
        id: SQUAD_ID,
        name: "梯隊 U8",
        kind: "age_squad",
        age_band: "U8",
        layer_key: null,
        eligible_birth_ages: null,
        status: "active",
      },
      {
        id: TEAM_ID,
        name: "Futuro U8",
        kind: "competition_team",
        age_band: "U8",
        layer_key: "u8",
        eligible_birth_ages: ["U6", "U7", "U8"],
        status: "active",
      },
    ],
    players: [],
    jerseyHolders: [],
    profiles: [{ id: PROFILE_ID, phone: "+886912345678" }],
    coaches: [],
    ...overrides,
  };
}

const TODAY = "2026-09-08";

const FIXTURE_HTML = `<!doctype html>
<html>
<head>
  <title>Futuro U8 vs Rivals</title>
  <meta property="og:title" content="Victory League Rd 1" />
  <meta property="og:description" content="League match at Home ground" />
  <script type="application/ld+json">
  {
    "@type": "SportsEvent",
    "name": "Victory League Rd 1",
    "startDate": "2026-10-04T15:00:00+08:00",
    "endDate": "2026-10-04T16:30:00+08:00",
    "location": { "name": "Home ground" },
    "opponent": "Rivals"
  }
  </script>
</head>
<body>
  <time datetime="2026-10-04T15:00:00+08:00">kickoff</time>
</body>
</html>`;

describe("T6A-1 templates download", () => {
  it("CSV and XLSX templates include headers plus an example row", () => {
    for (const kind of ["players", "coaches", "matches"] as const) {
      const rows = templateRows(kind);
      assert.equal(rows.length, 2);
      assert.ok(rows[0]!.length > 0);
      assert.equal(rows[1]!.length, rows[0]!.length);
      const csv = parseCsv(templateCsv(kind));
      assert.deepEqual(csv[0], [...rows[0]!]);
      const xlsxRows = parseXlsxTable(templateXlsx(kind));
      assert.deepEqual(xlsxRows[0], [...rows[0]!]);
      assert.deepEqual(xlsxRows[1], [...rows[1]!]);
    }
    assert.ok(PLAYER_TEMPLATE_HEADERS.includes("name_en_given"));
    assert.ok(COACH_TEMPLATE_HEADERS.includes("profile_phone_e164"));
    assert.ok(MATCH_TEMPLATE_HEADERS.includes("kind"));
  });
});

describe("T6A-2 player happy path", () => {
  it("previews a valid player row assigned to 梯隊 and optional 隊伍", () => {
    const csv = stringifyCsv([
      [...PLAYER_TEMPLATE_HEADERS],
      [
        "Kai",
        "Chen",
        "2018-08-15",
        "小凱",
        "",
        "",
        "梯隊 U8",
        "7",
        "",
        "Futuro U8",
        "10",
        "",
        "",
        "",
        "true",
      ],
    ]);
    const parsed = parseImportBuffer(new TextEncoder().encode(csv));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(headersAreValid("players", parsed.headers), true);
    const preview = buildImportPreview("players", parsed.records, catalog(), TODAY);
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      return;
    }
    assert.equal(preview.validCount, 1);
    assert.equal(preview.invalidCount, 0);
    assert.equal(preview.rows[0]?.valid, true);
  });
});

describe("T6A-3 jersey and duplicate errors", () => {
  it("blocks duplicate English+birth and jersey clashes per unit", () => {
    const existing = catalog({
      players: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name_en_given: "Kai",
          name_en_family: "Chen",
          birth_date: "2018-08-15",
        },
      ],
      jerseyHolders: [
        {
          player_id: "44444444-4444-4444-8444-444444444444",
          team_id: SQUAD_ID,
          jersey_number: 7,
        },
      ],
    });
    const parsedDup = parsePlayerImportValues(
      {
        name_en_given: "Kai",
        name_en_family: "Chen",
        birth_date: "2018-08-15",
        name_zh: "小凱",
        age_squad_name: "梯隊 U8",
        age_squad_jersey: "8",
      },
      TODAY,
    );
    assert.equal(parsedDup.ok, true);
    const csv = stringifyCsv([
      ["name_en_given", "name_en_family", "birth_date", "name_zh", "age_squad_name", "age_squad_jersey"],
      ["Kai", "Chen", "2018-08-15", "小凱", "梯隊 U8", "8"],
      ["Lin", "Wu", "2018-08-15", "小林", "梯隊 U8", "7"],
      ["A", "B", "2018-08-15", "甲", "梯隊 U8", "9"],
      ["A", "B", "2018-08-15", "乙", "梯隊 U8", "11"],
    ]);
    const parsed = parseImportBuffer(new TextEncoder().encode(csv));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    const preview = buildImportPreview("players", parsed.records, existing, TODAY);
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      return;
    }
    assert.ok(preview.rows[0]?.errorKeys.includes("duplicatePlayer"));
    assert.ok(preview.rows[1]?.errorKeys.includes("jerseyTaken"));
    assert.ok(preview.rows[3]?.errorKeys.includes("duplicateInFile"));
  });
});

describe("T6A-4 CJK required", () => {
  it("rejects a player with neither zh nor ja", () => {
    const parsed = parsePlayerImportValues(
      {
        name_en_given: "Kai",
        name_en_family: "Chen",
        birth_date: "2018-08-15",
        age_squad_name: "梯隊 U8",
        age_squad_jersey: "7",
      },
      TODAY,
    );
    assert.equal(parsed.ok, false);
    if (parsed.ok) {
      return;
    }
    assert.ok(parsed.errorKeys.includes("missingCjkName"));
  });
});

describe("T6A-5 coach unknown phone", () => {
  it("fails when the phone is not an existing profile", () => {
    const parsed = parseCoachImportValues({ profile_phone_e164: "+886900000000" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    const preview = buildImportPreview(
      "coaches",
      [{ line: 2, values: { profile_phone_e164: "+886900000000" } }],
      catalog(),
      TODAY,
    );
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      return;
    }
    assert.equal(preview.rows[0]?.valid, false);
    assert.ok(preview.rows[0]?.errorKeys.includes("unknownProfilePhone"));
  });
});

describe("T6A-6 blank opponent unpublished", () => {
  it("creates a match draft with null opponent and is_published false", () => {
    const parsed = parseMatchImportValues({
      team_name: "Futuro U8",
      title: "Victory League Rd 1",
      kind: "league",
      starts_at: "2026-10-04T15:00",
      opponent: "",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.draft.opponent, null);
    assert.equal(parsed.draft.isPublished, false);
    const preview = buildImportPreview(
      "matches",
      [
        {
          line: 2,
          values: {
            team_name: "Futuro U8",
            title: "Victory League Rd 1",
            kind: "league",
            starts_at: "2026-10-04T15:00",
          },
        },
      ],
      catalog(),
      TODAY,
    );
    assert.equal(preview.ok, true);
    if (!preview.ok) {
      return;
    }
    assert.equal(preview.rows[0]?.valid, true);
    assert.match(preview.rows[0]?.summary ?? "", /published=false/);
  });
});

describe("T6A-7 reject training kind for match import", () => {
  it("rejects regular/special/training kinds", () => {
    for (const kind of ["regular", "special", "training"]) {
      const parsed = parseMatchImportValues({
        team_name: "Futuro U8",
        title: "Practice",
        kind,
        starts_at: "2026-10-04T15:00",
      });
      assert.equal(parsed.ok, false);
      if (parsed.ok) {
        continue;
      }
      assert.ok(parsed.errorKeys.includes("matchKindRequired"));
    }
  });
});

describe("T6A-8 non-admin denied", () => {
  it("parent and coach cannot access admin import", () => {
    assert.equal(canAccessAdmin(["parent"]), false);
    assert.equal(canAccessAdmin(["coach"]), false);
    assert.equal(canAccessAdmin(["parent", "coach"]), false);
    assert.equal(canAccessAdmin(["admin"]), true);
  });
});

describe("T6A-9 URL fixture suggestions", () => {
  it("extracts title, kickoff, location, opponent, and league kind", () => {
    const suggestions = extractMatchFieldsFromHtml(FIXTURE_HTML);
    assert.equal(suggestions.title, "Victory League Rd 1");
    assert.equal(suggestions.kind, "league");
    assert.ok(suggestions.startsAt);
    assert.equal(suggestions.location, "Home ground");
    assert.equal(suggestions.opponent, "Rivals");
  });
});

describe("T6A-10 SSRF localhost blocked", () => {
  it("blocks localhost, loopback, link-local, and metadata without fetching", async () => {
    assert.equal(isBlockedIp("127.0.0.1"), true);
    assert.equal(isBlockedIp("169.254.169.254"), true);
    assert.equal(isBlockedIp("10.0.0.1"), true);
    assert.equal(assertSafePublicUrl("http://127.0.0.1/").ok, false);
    assert.equal(assertSafePublicUrl("http://localhost/secret").ok, false);
    assert.equal(assertSafePublicUrl("http://169.254.169.254/latest").ok, false);
    assert.equal(assertSafePublicUrl("file:///etc/passwd").ok, false);
    let fetched = false;
    const result = await fetchPublicHtml("http://127.0.0.1/", {
      fetch: async () => {
        fetched = true;
        return new Response("nope");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorKey, "blockedUrl");
    }
    assert.equal(fetched, false);
    const rebound = await fetchPublicHtml("https://evil.example/", {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      fetch: async () => {
        fetched = true;
        return new Response("nope");
      },
    });
    assert.equal(rebound.ok, false);
    if (!rebound.ok) {
      assert.equal(rebound.errorKey, "blockedUrl");
    }
    assert.equal(fetched, false);
  });
});

describe("xlsx round-trip", () => {
  it("reads inline-string sheets written by the template writer", () => {
    const table = [
      ["name_en_given", "name_en_family"],
      ["Kai", "Chen"],
    ];
    const parsed = parseXlsxTable(workbookToXlsx(table));
    assert.deepEqual(parsed, table);
  });
});

describe("csv quoted fields", () => {
  it("round-trips commas and quotes", () => {
    const table = [
      ["title", "notes"],
      ['Cup, "final"', "line1"],
    ];
    const parsed = recordsFromTable(parseCsv(stringifyCsv(table)));
    assert.equal(parsed.records[0]?.values.title, 'Cup, "final"');
  });
});
