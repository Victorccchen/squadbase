/**
 * RFC 4180-ish CSV helpers for Stage 6A admin import.
 * Excel-friendly: UTF-8 BOM on stringify, BOM stripped on parse.
 */

export const CSV_BOM = "\uFEFF";

export function stringifyCsv(rows: readonly (readonly string[])[]): string {
  const lines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < source.length) {
    const ch = source[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (inQuotes) {
    return rows;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim().length > 0));
}

export type CsvRecord = {
  line: number;
  values: Record<string, string>;
};

export function recordsFromTable(table: string[][]): {
  headers: string[];
  records: CsvRecord[];
} {
  if (table.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = table[0]!.map((header) => normalizeHeader(header));
  const records: CsvRecord[] = [];
  for (let i = 1; i < table.length; i += 1) {
    const row = table[i]!;
    const values: Record<string, string> = {};
    for (let col = 0; col < headers.length; col += 1) {
      const key = headers[col]!;
      if (!key) {
        continue;
      }
      values[key] = (row[col] ?? "").trim();
    }
    if (Object.values(values).every((value) => value.length === 0)) {
      continue;
    }
    records.push({ line: i + 1, values });
  }
  return { headers: headers.filter(Boolean), records };
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "_");
}
