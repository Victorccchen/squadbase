import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyImportCatalog, previewMatchRecords, type ImportTeam } from "./import-validate.ts";

const SENIOR = "77777777-7777-4777-8777-777777777777";
const U12 = "88888888-8888-4888-8888-888888888888";

function team(id: string, name: string, ageBand: string): ImportTeam {
  return {
    id,
    name,
    kind: "competition_team",
    age_band: ageBand,
    layer_key: ageBand.toLowerCase(),
    eligible_birth_ages: [ageBand],
    status: "active",
  };
}

function minutes(draft: { startsAt: string; endsAt: string } | null | undefined): number {
  assert.ok(draft);
  return (Date.parse(draft.endsAt) - Date.parse(draft.startsAt)) / 60_000;
}

describe("CSV match import default length", () => {
  const catalog = {
    ...emptyImportCatalog(),
    teams: [team(SENIOR, "台中FUTURO 一線隊", "senior"), team(U12, "Futuro U12", "U12")],
  };
  const base = { title: "台企甲", kind: "league", starts_at: "2026-10-11 15:30", opponent: "台電" };

  it("uses 150 minutes for the first team and 90 for youth when ends_at is blank", () => {
    const rows = previewMatchRecords(
      [
        { line: 2, values: { ...base, team_id: SENIOR } },
        { line: 3, values: { ...base, team_id: U12 } },
      ],
      catalog,
    );
    assert.equal(rows[0]?.valid, true);
    assert.equal(minutes(rows[0]?.draft as never), 150);
    assert.equal(minutes(rows[1]?.draft as never), 90);
  });

  it("keeps an explicit ends_at", () => {
    const rows = previewMatchRecords(
      [{ line: 2, values: { ...base, team_id: SENIOR, ends_at: "2026-10-11 17:00" } }],
      catalog,
    );
    assert.equal(minutes(rows[0]?.draft as never), 90);
  });
});
