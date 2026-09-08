/**
 * Parse uploaded CSV or XLSX buffers into headered records.
 */

import { parseCsv, recordsFromTable, type CsvRecord } from "./import-csv.ts";
import { recordsFromXlsx } from "./import-xlsx-read.ts";
import { MAX_IMPORT_BYTES } from "./import-validate.ts";
import type { OrgErrorKey } from "./errors.ts";

export function looksLikeZip(buffer: Uint8Array): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export function parseImportBuffer(buffer: Uint8Array):
  | { ok: true; headers: string[]; records: CsvRecord[] }
  | { ok: false; errorKey: OrgErrorKey } {
  if (buffer.length === 0) {
    return { ok: false, errorKey: "importEmpty" };
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    return { ok: false, errorKey: "importTooLarge" };
  }

  try {
    if (looksLikeZip(buffer)) {
      const parsed = recordsFromXlsx(buffer);
      if (parsed.headers.length === 0) {
        return { ok: false, errorKey: "importInvalidFile" };
      }
      return { ok: true, ...parsed };
    }
    const text = new TextDecoder("utf-8").decode(buffer);
    const table = parseCsv(text);
    if (table.length === 0) {
      return { ok: false, errorKey: "importEmpty" };
    }
    return { ok: true, ...recordsFromTable(table) };
  } catch {
    return { ok: false, errorKey: "importInvalidFile" };
  }
}
