/** Count `session_registrations` rows with status `registered` per session. */

export function tallyRegisteredCounts(
  rows: readonly { session_id: string; status: string }[],
): Map<string, number> {
  const registeredBySession = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "registered") {
      continue;
    }
    registeredBySession.set(row.session_id, (registeredBySession.get(row.session_id) ?? 0) + 1);
  }
  return registeredBySession;
}
