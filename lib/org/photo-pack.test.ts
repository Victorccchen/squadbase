import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessAdmin } from "../auth/roles.ts";
import { parseXlsxTable } from "./import-xlsx-read.ts";
import { htmlLeaksPlayerPhoto } from "./player-photos.ts";
import {
  PHOTO_PACK_MANIFEST_CSV,
  PHOTO_PACK_PLAYER_CAP,
  PHOTO_PACK_ROSTER_XLSX,
  allocatePackedFiles,
  buildPhotoPackZipEntries,
  canExportPhotoPack,
  encodePhotoPackZip,
  filterActiveMembersForCompetitionTeam,
  jerseyForScope,
  parsePhotoPackFormData,
  photoPackCapError,
  photoPackFileStem,
  photoPackIdShort,
  photoPackTable,
  playersInPhotoPackScope,
  sanitizePhotoPackAsciiPart,
  storagePathsToDownload,
  uniquePhotoPackStem,
  type PhotoPackCopy,
  type PhotoPackSourceRow,
} from "./photo-pack.ts";
import { listZipStoreEntries } from "./zip-store.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TEAM_A = "22222222-2222-4222-8222-222222222222";
const TEAM_B = "33333333-3333-4333-8333-333333333333";
const PLAYER_A = "11111111-1111-4111-8111-111111111111";
const PLAYER_B = "44444444-4444-4444-8444-444444444444";
const PLAYER_C = "55555555-5555-4555-8555-555555555555";

function jpegBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function copy(): PhotoPackCopy {
  return {
    jersey: "Jersey",
    player: "Player",
    nameEn: "English name",
    birthDate: "Birth date",
    unit: "Unit",
    hasPhoto: "Has photo",
    hasPdf: "Has PDF",
    photoFile: "Photo file",
    pdfFile: "PDF file",
    yes: "Yes",
    no: "No",
  };
}

function names(overrides: { given?: string; family?: string } = {}) {
  return {
    name_zh: "小凱",
    name_en_given: overrides.given ?? "Kai",
    name_en_family: overrides.family ?? "Chen",
    name_ja: "カイ",
  };
}

function source(overrides: Partial<PhotoPackSourceRow> & Pick<PhotoPackSourceRow, "playerId">): PhotoPackSourceRow {
  return {
    player: names(),
    birthDate: "2018-03-01",
    jersey: 7,
    unitLabel: "Victory U8",
    photoPath: null,
    idPdfPath: null,
    ...overrides,
  };
}

function rosterRow(input: {
  playerId: string;
  teamId: string;
  kind: "competition_team" | "age_squad";
  status: "active" | "inactive";
  jersey: number;
}) {
  return {
    membership: { status: input.status, team_id: input.teamId, jersey_number: input.jersey },
    team: { id: input.teamId, kind: input.kind, name: "Team" },
    player: { id: input.playerId },
  };
}

describe("TD-1 Admin roster+photos ZIP has xlsx + images for players with photos", () => {
  it("packs roster.xlsx and photos/ only for downloaded headshots", () => {
    const withPhoto = source({
      playerId: PLAYER_A,
      photoPath: `${PLAYER_A}/headshot-1-a.jpg`,
    });
    const without = source({
      playerId: PLAYER_B,
      jersey: 8,
      player: names({ given: "Mei", family: "Lin" }),
    });
    const downloaded = new Map<string, Uint8Array>([[withPhoto.photoPath!, jpegBytes()]]);
    const { entries, table } = buildPhotoPackZipEntries({
      rows: [withPhoto, without],
      downloaded,
      copy: copy(),
      locale: "en",
    });
    const zip = encodePhotoPackZip(entries);
    const listed = listZipStoreEntries(zip);
    const namesInZip = listed.map((entry) => entry.name);
    assert.ok(namesInZip.includes(PHOTO_PACK_ROSTER_XLSX));
    assert.ok(namesInZip.includes(PHOTO_PACK_MANIFEST_CSV));
    const photoName = "photos/Kai_Chen_7.jpg";
    assert.ok(namesInZip.includes(photoName), namesInZip.join(","));
    assert.equal(namesInZip.some((name) => name.startsWith("photos/") && name.includes("Lin")), false);

    const xlsx = listed.find((entry) => entry.name === PHOTO_PACK_ROSTER_XLSX);
    assert.ok(xlsx);
    const parsed = parseXlsxTable(xlsx.data);
    assert.deepEqual(parsed[0]?.slice(0, 7), [
      "Jersey",
      "Player",
      "English name",
      "Birth date",
      "Unit",
      "Has photo",
      "Has PDF",
    ]);
    assert.equal(parsed[1]?.[5], "Yes");
    assert.equal(parsed[1]?.[7], photoName);
    assert.equal(parsed[2]?.[0], "8");
    assert.equal(parsed[2]?.[5], "No");
    assert.equal(parsed[2]?.[7], "");
    assert.equal(table.length, 3);
  });
});

describe("TD-2 Team ZIP only that competition_team’s active members", () => {
  it("keeps active members of one 隊伍 and drops inactive or other teams", () => {
    const rows = [
      rosterRow({ playerId: PLAYER_A, teamId: TEAM_A, kind: "competition_team", status: "active", jersey: 7 }),
      rosterRow({ playerId: PLAYER_B, teamId: TEAM_A, kind: "competition_team", status: "inactive", jersey: 8 }),
      rosterRow({ playerId: PLAYER_C, teamId: TEAM_B, kind: "competition_team", status: "active", jersey: 9 }),
      rosterRow({ playerId: PLAYER_A, teamId: TEAM_A, kind: "age_squad", status: "active", jersey: 7 }),
    ];
    const kept = filterActiveMembersForCompetitionTeam(rows, TEAM_A);
    assert.deepEqual(
      kept.map((row) => row.player.id),
      [PLAYER_A],
    );
  });

  it("limits the reports-scope pack to selected units’ active memberships", () => {
    const players = [
      {
        id: PLAYER_A,
        memberships: [{ status: "active" as const, team_id: TEAM_A }],
      },
      {
        id: PLAYER_B,
        memberships: [{ status: "active" as const, team_id: TEAM_B }],
      },
      {
        id: PLAYER_C,
        memberships: [{ status: "inactive" as const, team_id: TEAM_A }],
      },
    ];
    assert.deepEqual(
      playersInPhotoPackScope(players, [TEAM_A]).map((row) => row.id),
      [PLAYER_A],
    );
  });
});

describe("TD-3 Parent/coach cannot export", () => {
  it("uses the same admin gate as Stage R reports", () => {
    assert.equal(canExportPhotoPack(["parent"]), false);
    assert.equal(canExportPhotoPack(["coach"]), false);
    assert.equal(canExportPhotoPack(["parent", "coach"]), false);
    assert.equal(canExportPhotoPack(["admin"]), true);
    assert.equal(canAccessAdmin(["coach"]), false);
    const source = readFileSync(join(root, "lib/org/photo-pack-actions.ts"), "utf8");
    assert.match(source, /canExportPhotoPack\(roles\)/);
    assert.match(source, /failed\("forbidden"\)/);
  });
});

describe("TD-4 Missing photo does not fail ZIP", () => {
  it("lists the player and omits photos/ when the object is missing", () => {
    const missingPath = source({
      playerId: PLAYER_A,
      photoPath: `${PLAYER_A}/headshot-missing.jpg`,
    });
    const noPath = source({ playerId: PLAYER_B, jersey: 9 });
    const downloaded = new Map<string, Uint8Array>();
    const packed = allocatePackedFiles([missingPath, noPath], downloaded);
    assert.equal(packed.get(PLAYER_A)?.photoZipPath, null);
    assert.equal(storagePathsToDownload([missingPath, noPath]).includes(missingPath.photoPath!), true);
    const { entries } = buildPhotoPackZipEntries({
      rows: [missingPath, noPath],
      downloaded,
      copy: copy(),
      locale: "en",
    });
    const zip = encodePhotoPackZip(entries);
    const namesInZip = listZipStoreEntries(zip).map((entry) => entry.name);
    assert.ok(namesInZip.includes(PHOTO_PACK_ROSTER_XLSX));
    assert.equal(namesInZip.some((name) => name.startsWith("photos/")), false);
    const table = photoPackTable([missingPath, noPath], packed, copy(), "en");
    assert.equal(table[1]?.[5], "No");
    assert.equal(table[2]?.[5], "No");
    assert.equal(photoPackCapError(PHOTO_PACK_PLAYER_CAP), null);
    assert.equal(photoPackCapError(PHOTO_PACK_PLAYER_CAP + 1), "photoPackTooMany");
  });
});

describe("TD-5 Public pages still clean", () => {
  it("does not mention player-photos on public match UI", () => {
    const files = [
      "app/[locale]/matches/page.tsx",
      "app/[locale]/matches/[id]/page.tsx",
      "components/matches/public-match-card.tsx",
    ];
    for (const relative of files) {
      const source = readFileSync(join(root, relative), "utf8");
      assert.equal(htmlLeaksPlayerPhoto(source), false, relative);
      assert.equal(source.includes("exportAdminPhotoPack"), false, relative);
      assert.equal(source.includes("PhotoPackExportForm"), false, relative);
    }
  });
});

describe("photo pack form parse", () => {
  it("accepts a competition_team id and locale", () => {
    const form = new FormData();
    form.set("locale", "zh-Hant");
    form.set("teamId", TEAM_A);
    const parsed = parsePhotoPackFormData(form);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.scope.teamId, TEAM_A);
      assert.equal(parsed.scope.locale, "zh-Hant");
    }
  });
});

describe("ZIP entry names use English given_family_jersey", () => {
  it("maps Liam Chen #24 to Liam_Chen_24.jpg and a related PDF name", () => {
    assert.equal(
      photoPackFileStem({ given: "Liam", family: "Chen", jersey: 24, playerId: PLAYER_A }),
      "Liam_Chen_24",
    );
    const liam = source({
      playerId: PLAYER_A,
      jersey: 24,
      player: names({ given: "Liam", family: "Chen" }),
      photoPath: `${PLAYER_A}/headshot-opaque.jpg`,
      idPdfPath: `${PLAYER_A}/id-opaque.pdf`,
    });
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const { entries } = buildPhotoPackZipEntries({
      rows: [liam],
      downloaded: new Map([
        [liam.photoPath!, jpegBytes()],
        [liam.idPdfPath!, pdf],
      ]),
      copy: copy(),
      locale: "zh-Hant",
    });
    const zip = encodePhotoPackZip(entries);
    const listed = listZipStoreEntries(zip);
    const namesInZip = listed.map((entry) => entry.name);
    assert.ok(namesInZip.includes("photos/Liam_Chen_24.jpg"), namesInZip.join(","));
    assert.ok(namesInZip.includes("pdfs/Liam_Chen_24.pdf"), namesInZip.join(","));
    const xlsx = listed.find((entry) => entry.name === PHOTO_PACK_ROSTER_XLSX);
    assert.ok(xlsx);
    const parsed = parseXlsxTable(xlsx.data);
    assert.equal(parsed[1]?.[7], "photos/Liam_Chen_24.jpg");
    assert.equal(parsed[1]?.[8], "pdfs/Liam_Chen_24.pdf");
  });

  it("sanitizes odd characters, uses X without jersey, and id slug when English is empty", () => {
    assert.equal(sanitizePhotoPackAsciiPart("O'Brien"), "OBrien");
    assert.equal(sanitizePhotoPackAsciiPart("Mary Jane"), "Mary_Jane");
    assert.equal(
      photoPackFileStem({ given: "Mary Jane", family: "O'Brien", jersey: 10, playerId: PLAYER_A }),
      "Mary_Jane_OBrien_10",
    );
    assert.equal(
      photoPackFileStem({ given: "Liam", family: "Chen", jersey: null, playerId: PLAYER_A }),
      "Liam_Chen_X",
    );
    assert.equal(
      photoPackFileStem({ given: "  ", family: "", jersey: 3, playerId: PLAYER_A }),
      `${photoPackIdShort(PLAYER_A)}_3`,
    );
  });

  it("appends a short player id when two files would share a stem", () => {
    const used = new Set<string>();
    assert.equal(uniquePhotoPackStem("Liam_Chen_24", used, PLAYER_A), "Liam_Chen_24");
    assert.equal(
      uniquePhotoPackStem("Liam_Chen_24", used, PLAYER_B),
      `Liam_Chen_24_${photoPackIdShort(PLAYER_B)}`,
    );
    const first = source({
      playerId: PLAYER_A,
      jersey: 24,
      player: names({ given: "Liam", family: "Chen" }),
      photoPath: `${PLAYER_A}/a.jpg`,
    });
    const second = source({
      playerId: PLAYER_B,
      jersey: 24,
      player: names({ given: "Liam", family: "Chen" }),
      photoPath: `${PLAYER_B}/b.jpg`,
    });
    const packed = allocatePackedFiles(
      [first, second],
      new Map([
        [first.photoPath!, jpegBytes()],
        [second.photoPath!, jpegBytes()],
      ]),
    );
    assert.equal(packed.get(PLAYER_A)?.photoZipPath, "photos/Liam_Chen_24.jpg");
    assert.equal(packed.get(PLAYER_B)?.photoZipPath, `photos/Liam_Chen_24_${photoPackIdShort(PLAYER_B)}.jpg`);
  });

  it("prefers the active 隊伍 jersey for an unscoped reports pack", () => {
    const jersey = jerseyForScope(
      [
        { status: "active", team_id: TEAM_B, jersey_number: 8, team: { kind: "age_squad" } },
        { status: "active", team_id: TEAM_A, jersey_number: 24, team: { kind: "competition_team" } },
      ],
      [],
    );
    assert.equal(jersey, 24);
    assert.equal(
      jerseyForScope(
        [
          { status: "active", team_id: TEAM_B, jersey_number: 8, team: { kind: "age_squad" } },
          { status: "active", team_id: TEAM_A, jersey_number: 24, team: { kind: "competition_team" } },
        ],
        [TEAM_B],
      ),
      8,
    );
  });
});
