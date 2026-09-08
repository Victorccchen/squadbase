import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_PLAYER_PHOTO_KEYS,
  attachmentFlag,
  canReadPlayerPhoto,
  canWritePlayerPhoto,
  filterPlayersMissingHeadshot,
  headshotListMarker,
  htmlLeaksPlayerPhoto,
  inspectHeadshotBuffer,
  inspectIdPdfBuffer,
  isMissingHeadshotFilter,
  isRejectedExecutable,
  nextHeadshotPath,
  nextIdPdfPath,
  playerHasHeadshot,
  playerIdFromStoragePath,
  replaceUpdatesPath,
  writeDeniedErrorKey,
  MAX_HEADSHOT_BYTES,
  MAX_ID_PDF_BYTES,
} from "./player-photos.ts";
import { extraPublicRosterKeys, publicPayloadHasForbiddenKeys } from "./match.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function jpegBytes(length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function pngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

function pdfBytes(): Uint8Array {
  return Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
}

function exeBytes(): Uint8Array {
  return Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
}

describe("TP-1 admin jpeg → thumb vs missing", () => {
  it("accepts jpeg/png/webp and maps list marker to thumb when photo_path is set", () => {
    assert.equal(inspectHeadshotBuffer(jpegBytes()).ok, true);
    assert.equal(inspectHeadshotBuffer(pngBytes()).ok, true);
    assert.equal(inspectHeadshotBuffer(webpBytes()).ok, true);
    if (inspectHeadshotBuffer(jpegBytes()).ok) {
      assert.equal(inspectHeadshotBuffer(jpegBytes()).mime, "image/jpeg");
    }
    const withPhoto = { photo_path: "11111111-1111-1111-1111-111111111111/headshot-1-a.jpg" };
    const missing = { photo_path: null };
    assert.equal(headshotListMarker(withPhoto), "thumb");
    assert.equal(headshotListMarker(missing), "missing");
    assert.equal(playerHasHeadshot(withPhoto), true);
  });
});

describe("TP-2 parent linked vs unlinked vs coach write", () => {
  it("allows admin and approved guardian writes; denies coach and unlinked parent", () => {
    assert.equal(
      canWritePlayerPhoto({ isAdmin: true, isApprovedGuardian: false, isAssignedCoach: false }),
      true,
    );
    assert.equal(
      canWritePlayerPhoto({ isAdmin: false, isApprovedGuardian: true, isAssignedCoach: false }),
      true,
    );
    assert.equal(
      canWritePlayerPhoto({ isAdmin: false, isApprovedGuardian: false, isAssignedCoach: true }),
      false,
    );
    assert.equal(
      canWritePlayerPhoto({ isAdmin: false, isApprovedGuardian: false, isAssignedCoach: false }),
      false,
    );
    assert.equal(
      writeDeniedErrorKey({ isAdmin: false, isApprovedGuardian: false, isAssignedCoach: false }),
      "notApprovedGuardian",
    );
    assert.equal(
      writeDeniedErrorKey({ isAdmin: false, isApprovedGuardian: false, isAssignedCoach: true }),
      "forbidden",
    );
  });

  it("lets assigned coaches read but not write", () => {
    const coach = { isAdmin: false, isApprovedGuardian: false, isAssignedCoach: true };
    assert.equal(canReadPlayerPhoto(coach), true);
    assert.equal(canWritePlayerPhoto(coach), false);
  });
});

describe("TP-3 reject exe / oversize", () => {
  it("rejects MZ executables and oversize images", () => {
    assert.equal(isRejectedExecutable(exeBytes()), true);
    const exe = inspectHeadshotBuffer(exeBytes());
    assert.equal(exe.ok, false);
    if (!exe.ok) {
      assert.equal(exe.errorKey, "invalidPhotoType");
    }
    const huge = inspectHeadshotBuffer(new Uint8Array(MAX_HEADSHOT_BYTES + 1));
    assert.equal(huge.ok, false);
    if (!huge.ok) {
      assert.equal(huge.errorKey, "photoTooLarge");
    }
  });
});

describe("TP-4 replace updates path", () => {
  it("writes a new object key under the player id", () => {
    const playerId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const first = nextHeadshotPath(playerId, "image/jpeg", 1000, "one");
    const second = nextHeadshotPath(playerId, "image/png", 1001, "two");
    assert.equal(first, `${playerId}/headshot-1000-one.jpg`);
    assert.equal(second, `${playerId}/headshot-1001-two.png`);
    assert.equal(replaceUpdatesPath(first, second), true);
    assert.equal(playerIdFromStoragePath(second), playerId);
    assert.equal(playerIdFromStoragePath("../escape.jpg"), null);
  });
});

describe("TP-5 public match HTML never leaks photo URLs", () => {
  it("treats public storage URLs and photo columns as leaks", () => {
    assert.equal(htmlLeaksPlayerPhoto("<p>Chen #7</p>"), false);
    assert.equal(
      htmlLeaksPlayerPhoto(
        '<img src="https://ffksqfgscuezjwdbktcd.supabase.co/storage/v1/object/public/player-photos/x.jpg">',
      ),
      true,
    );
    assert.equal(
      htmlLeaksPlayerPhoto(
        "https://example.supabase.co/storage/v1/object/sign/player-photos/secret",
      ),
      true,
    );
    assert.equal(htmlLeaksPlayerPhoto(JSON.stringify({ photo_path: "x/y.jpg" })), true);
  });

  it("keeps public roster RPC rows free of photo keys", () => {
    assert.deepEqual(
      extraPublicRosterKeys({
        player_id: "p",
        name_zh: null,
        name_en_given: "Ming",
        name_en_family: "Chen",
        name_ja: null,
        jersey_number: 7,
      }),
      [],
    );
    for (const key of PUBLIC_PLAYER_PHOTO_KEYS) {
      assert.equal(publicPayloadHasForbiddenKeys({ title: "Cup", [key]: "secret" }), true);
    }
  });

  it("public match UI sources do not mention photo storage", () => {
    const files = [
      "app/[locale]/matches/page.tsx",
      "app/[locale]/matches/[id]/page.tsx",
      "components/matches/public-match-card.tsx",
      "supabase/migrations/20260907120000_stage5b_public_matches.sql",
    ];
    for (const relative of files) {
      const source = readFileSync(join(root, relative), "utf8");
      if (relative.endsWith(".sql")) {
        const rosterFn = source.slice(source.indexOf("list_published_match_roster"));
        const body = rosterFn.slice(0, rosterFn.indexOf("comment on function public.list_published_match_roster"));
        assert.equal(body.includes("photo_path"), false, relative);
        assert.equal(body.includes("id_pdf_path"), false, relative);
        assert.equal(body.includes("player-photos"), false, relative);
        continue;
      }
      assert.equal(htmlLeaksPlayerPhoto(source), false, relative);
    }
  });
});

describe("TP-6 missing-headshot filter", () => {
  it("lists only players without a current photo_path", () => {
    assert.equal(isMissingHeadshotFilter("1"), true);
    assert.equal(isMissingHeadshotFilter(["true"]), true);
    assert.equal(isMissingHeadshotFilter(undefined), false);
    const rows = [
      { id: "a", photo_path: "p/a.jpg" },
      { id: "b", photo_path: null },
      { id: "c", photo_path: "  " },
    ];
    assert.deepEqual(
      filterPlayersMissingHeadshot(rows).map((row) => row.id),
      ["b", "c"],
    );
  });
});

describe("TP-7 PDF attachment flag without replacing the image thumb rule", () => {
  it("stores PDF separately and prefers image thumb", () => {
    const pdf = inspectIdPdfBuffer(pdfBytes());
    assert.equal(pdf.ok, true);
    const hugePdf = inspectIdPdfBuffer(new Uint8Array(MAX_ID_PDF_BYTES + 1));
    assert.equal(hugePdf.ok, false);
    if (!hugePdf.ok) {
      assert.equal(hugePdf.errorKey, "pdfTooLarge");
    }
    const exeAsPdf = inspectIdPdfBuffer(exeBytes());
    assert.equal(exeAsPdf.ok, false);
    const playerId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    assert.equal(
      nextIdPdfPath(playerId, 9, "pdfnonce"),
      `${playerId}/id-document-9-pdfnonce.pdf`,
    );
    assert.equal(attachmentFlag({ photo_path: "p/a.jpg", id_pdf_path: "p/a.pdf" }), "image+pdf");
    assert.equal(attachmentFlag({ photo_path: null, id_pdf_path: "p/a.pdf" }), "pdf-only");
    assert.equal(attachmentFlag({ photo_path: "p/a.jpg", id_pdf_path: null }), "image");
    assert.equal(headshotListMarker({ photo_path: null, id_pdf_path: "p/a.pdf" }), "missing");
  });
});
