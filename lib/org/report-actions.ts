"use server";

import { getPublicSupabaseEnv } from "@/lib/env";
import { loadSignedInAccount } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { OrgErrorKey } from "@/lib/org/errors";
import { reportCopyForLocale } from "@/lib/org/report-copy";
import {
  queryAttendanceReport,
  queryLedgerReport,
  queryMatchRosterReport,
  queryRegistrationsReport,
} from "@/lib/org/report-queries";
import {
  attendanceTable,
  bytesToBase64,
  encodeReportFile,
  ledgerTable,
  matchRosterTable,
  parseReportFormData,
  registrationsTable,
  reportCapError,
  reportFilename,
  tableHasPiiHeaders,
} from "@/lib/org/reports";

export type ReportExportState = {
  ok: boolean;
  errorKey: OrgErrorKey | null;
  attempted: boolean;
  filename: string | null;
  mime: string | null;
  base64: string | null;
  rowCount: number;
};

export const INITIAL_REPORT_EXPORT_STATE: ReportExportState = {
  ok: false,
  errorKey: null,
  attempted: false,
  filename: null,
  mime: null,
  base64: null,
  rowCount: 0,
};

export async function exportAdminReport(formData: FormData): Promise<ReportExportState> {
  const failed = (errorKey: OrgErrorKey): ReportExportState => ({
    ...INITIAL_REPORT_EXPORT_STATE,
    attempted: true,
    errorKey,
  });

  if (!getPublicSupabaseEnv().isConfigured) {
    return failed("notConfigured");
  }
  const { user, roles } = await loadSignedInAccount();
  if (!user || !canAccessAdmin(roles)) {
    return failed("forbidden");
  }

  const parsed = parseReportFormData(formData);
  if (!parsed.ok) {
    return failed(parsed.errorKey);
  }
  const { filters } = parsed;
  const supabase = await createClient();
  const copy = reportCopyForLocale(filters.locale);
  const exportedAt = new Date();

  let table: string[][] = [];
  if (filters.reportType === "attendance") {
    const result = await queryAttendanceReport(supabase, filters);
    if (!result.ok) {
      return failed(result.errorKey);
    }
    table = attendanceTable(result.rows, copy, filters.locale);
  } else if (filters.reportType === "registrations") {
    const result = await queryRegistrationsReport(supabase, filters);
    if (!result.ok) {
      return failed(result.errorKey);
    }
    table = registrationsTable(result.rows, copy, filters.locale);
  } else if (filters.reportType === "credit_ledger") {
    const result = await queryLedgerReport(supabase, filters);
    if (!result.ok) {
      return failed(result.errorKey);
    }
    table = ledgerTable(result.rows, copy, filters.locale);
  } else {
    const result = await queryMatchRosterReport(supabase, filters);
    if (!result.ok) {
      return failed(result.errorKey);
    }
    table = matchRosterTable(result.rows, copy, filters.locale);
  }

  const dataRowCount = Math.max(0, table.length - 1);
  const cap = reportCapError(dataRowCount);
  if (cap) {
    return failed(cap);
  }
  if (tableHasPiiHeaders(table)) {
    return failed("generic");
  }

  const file = encodeReportFile(table, filters.format);
  const filename = reportFilename({
    reportType: filters.reportType,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    exportedAt,
    format: filters.format,
  });

  return {
    ok: true,
    errorKey: null,
    attempted: true,
    filename,
    mime: file.mime,
    base64: bytesToBase64(file.bytes),
    rowCount: dataRowCount,
  };
}
