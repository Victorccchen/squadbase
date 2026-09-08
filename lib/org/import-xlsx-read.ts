/**
 * Minimal XLSX reader for Stage 6A admin import (first worksheet).
 * Server-only: uses node:zlib for DEFLATE entries from Excel.
 */

import { inflateRawSync } from "node:zlib";
import { recordsFromTable, type CsvRecord } from "./import-csv.ts";

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

type ZipFile = {
  name: string;
  data: Uint8Array;
};

function readZip(buffer: Uint8Array): ZipFile[] {
  const files: ZipFile[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = u32(buffer, offset);
    if (sig !== 0x04034b50) {
      break;
    }
    const method = u16(buffer, offset + 8);
    const compressedSize = u32(buffer, offset + 18);
    const nameLen = u16(buffer, offset + 26);
    const extraLen = u16(buffer, offset + 28);
    const nameStart = offset + 30;
    const name = decodeUtf8(buffer.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`unsupported zip method ${method}`);
    }
    files.push({ name, data });
    offset = dataStart + compressedSize;
  }
  return files;
}

function xmlDecode(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function colIndexFromRef(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function rowIndexFromRef(ref: string): number {
  const digits = /\d+/.exec(ref)?.[0];
  return digits ? Number(digits) - 1 : 0;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let match: RegExpExecArray | null;
  while ((match = siRe.exec(xml))) {
    const texts = [...match[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) =>
      xmlDecode(item[1] ?? ""),
    );
    out.push(texts.join(""));
  }
  return out;
}

function excelSerialToIso(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const whole = Math.floor(serial);
  const frac = serial - whole;
  const ms = epoch + whole * 86400000 + Math.round(frac * 86400000);
  const date = new Date(ms);
  if (frac === 0) {
    return date.toISOString().slice(0, 10);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function cellText(inner: string, type: string | undefined, shared: string[]): string {
  if (type === "inlineStr") {
    const texts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) =>
      xmlDecode(item[1] ?? ""),
    );
    return texts.join("");
  }
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(inner)?.[1] ?? "";
  const value = xmlDecode(raw);
  if (type === "s") {
    const index = Number(value);
    return shared[index] ?? "";
  }
  if (type === "str" || type === "b") {
    return value;
  }
  if (value && /^[0-9]+(\.[0-9]+)?$/.test(value)) {
    const n = Number(value);
    if (n > 20000 && n < 80000) {
      return excelSerialToIso(n);
    }
  }
  return value;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows = new Map<number, string[]>();
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(xml))) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const ref = /r="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const type = /t="([^"]+)"/.exec(attrs)?.[1];
    if (!ref) {
      continue;
    }
    const row = rowIndexFromRef(ref);
    const col = colIndexFromRef(ref);
    const current = rows.get(row) ?? [];
    while (current.length <= col) {
      current.push("");
    }
    current[col] = cellText(inner, type, shared);
    rows.set(row, current);
  }
  const maxRow = Math.max(-1, ...rows.keys());
  const table: string[][] = [];
  for (let i = 0; i <= maxRow; i += 1) {
    table.push(rows.get(i) ?? []);
  }
  return table;
}

export function parseXlsxTable(buffer: Uint8Array): string[][] {
  const files = readZip(buffer);
  const byName = new Map(files.map((file) => [file.name.replaceAll("\\", "/"), file]));
  const sharedXml = byName.get("xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(decodeUtf8(sharedXml.data)) : [];
  const sheet =
    byName.get("xl/worksheets/sheet1.xml") ??
    files.find((file) => /xl\/worksheets\/sheet\d+\.xml$/i.test(file.name));
  if (!sheet) {
    return [];
  }
  return parseSheet(decodeUtf8(sheet.data), shared);
}

export function recordsFromXlsx(buffer: Uint8Array): {
  headers: string[];
  records: CsvRecord[];
} {
  return recordsFromTable(parseXlsxTable(buffer));
}
