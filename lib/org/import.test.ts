import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { canAccessAdmin } from "../auth/roles.ts";
import { parseCsv, recordsFromTable, stringifyCsv } from "./import-csv.ts";
import { workbookToXlsx } from "./import-xlsx-write.ts";
import { parseXlsxTable } from "./import-xlsx-read.ts";
import { assertSafePublicUrl, fetchPublicHtml, isBlockedIp } from "./url-ssrf.ts";

describe("T6A-8 non-admin denied", () => {
  it("parent and coach cannot access admin import", () => {
    assert.equal(canAccessAdmin(["parent"]), false);
    assert.equal(canAccessAdmin(["coach"]), false);
    assert.equal(canAccessAdmin(["parent", "coach"]), false);
    assert.equal(canAccessAdmin(["admin"]), true);
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

describe("TL2 import page is match-URL only", () => {
  it("has no CSV/Excel import UI and no dedicated Torneopal nav link", () => {
    const workspace = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const importPanel = readFileSync(join(workspace, "components/admin/admin-import-panel.tsx"), "utf8");
    const subnav = readFileSync(join(workspace, "components/admin/admin-subnav.tsx"), "utf8");
    const home = readFileSync(join(workspace, "app/[locale]/app/admin/page.tsx"), "utf8");
    assert.match(importPanel, /previewTorneopalSchedule/);
    assert.doesNotMatch(importPanel, /previewOrgImport|templateCsv|downloadCsv|FileImportSection|assistMatchUrl/);
    assert.doesNotMatch(subnav, /\/app\/admin\/torneopal/);
    assert.doesNotMatch(home, /\/app\/admin\/torneopal/);
  });
});
