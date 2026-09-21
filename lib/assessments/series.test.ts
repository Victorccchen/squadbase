import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDimensionSeries, chartHasEnoughPoints } from "./series.ts";

describe("ability time-series charts (T5C-3)", () => {
  it("is empty with fewer than two points", () => {
    const one = buildDimensionSeries(
      [
        {
          assessed_at: "2026-09-01T00:00:00+08:00",
          scores: [{ dimension_kind: "trait", dimension_code: "A", score: 3 }],
        },
      ],
      "trait",
    );
    assert.equal(chartHasEnoughPoints(one), false);
    assert.equal(one.find((s) => s.code === "A")?.points.length, 1);
  });

  it("builds a trait line when a code has two dates", () => {
    const series = buildDimensionSeries(
      [
        {
          assessed_at: "2026-09-10T00:00:00+08:00",
          scores: [{ dimension_kind: "trait", dimension_code: "A", score: 4 }],
        },
        {
          assessed_at: "2026-09-01T00:00:00+08:00",
          scores: [{ dimension_kind: "trait", dimension_code: "A", score: 2 }],
        },
      ],
      "trait",
    );
    assert.equal(chartHasEnoughPoints(series), true);
    assert.deepEqual(
      series.find((item) => item.code === "A")?.points.map((point) => point.score),
      [2, 4],
    );
  });

  it("keeps phase series separate from traits", () => {
    const series = buildDimensionSeries(
      [
        {
          assessed_at: "2026-09-01T00:00:00+08:00",
          scores: [
            { dimension_kind: "phase", dimension_code: "attack", score: 3 },
            { dimension_kind: "trait", dimension_code: "A", score: 5 },
          ],
        },
        {
          assessed_at: "2026-09-08T00:00:00+08:00",
          scores: [{ dimension_kind: "phase", dimension_code: "attack", score: 4 }],
        },
      ],
      "phase",
    );
    assert.equal(chartHasEnoughPoints(series), true);
    assert.equal(series.find((item) => item.code === "attack")?.points.length, 2);
  });
});
