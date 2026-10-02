/**
 * PR-09 AI read-out of a paper session card. Server only: import it from
 * "use server" modules, never from client components. The API key is the
 * server variable ANTHROPIC_API_KEY (never NEXT_PUBLIC_*). The photos go to
 * the Claude API and nowhere else; nothing here logs them.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  PAPER_CARD_EXTRACTION_SCHEMA,
  estimateCostUsd,
  parseExtraction,
  type PaperCardExtraction,
} from "./paper-card.ts";

export const PAPER_CARD_MODEL = "claude-opus-5-5";

export type CardPhoto = { mime: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array };

export type ExtractResult =
  | { status: "succeeded"; extraction: PaperCardExtraction; output: unknown; costUsd: number | null }
  | { status: "failed" | "refused" | "invalid"; output: unknown; costUsd: number | null };

export function isPaperCardAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

const INSTRUCTIONS = `You read a football club's paper session card from photos (front and back).
Front: the child's name, the plan circled (10, 20 or 30 sessions), a handwritten card number, a price table.
Back: 30 cells. A coach writes the date of each session attended, in month/day form (for example 9/2), in reading order.
A mark such as "8.10" (often in a corner) is a squad mark for the U8 and U10 squads, not a date: put it in squad_marks.
The printed terms are in Chinese and Japanese.

Rules:
- Do not output the child's name anywhere.
- Report every one of the 30 cells by position, blank cells included (text "" and date null).
- Dates have no year. Today is {TODAY}. Use the most recent year that puts the date on or before today.
- If a cell could be read more than one way (for example 6/1 or 6/11), give your best reading and set confidence to "low".
- Set confidence to "high" only when the writing is clear.`;

/**
 * One call per card. Errors, refusals and output that fails the schema all
 * come back as a non-success status so the page falls back to manual entry.
 */
export async function extractPaperCard(photos: readonly CardPhoto[], today: string): Promise<ExtractResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), maxRetries: 1, timeout: 120_000 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: PAPER_CARD_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: PAPER_CARD_EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((photo) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: photo.mime,
                data: Buffer.from(photo.bytes).toString("base64"),
              },
            })),
            { type: "text" as const, text: INSTRUCTIONS.replace("{TODAY}", today) },
          ],
        },
      ],
    });
  } catch (error) {
    // Message only: the request body (the photos) is never logged.
    if (error instanceof Anthropic.APIError) {
      console.error("extractPaperCard", error.status, error.message);
    } else {
      console.error("extractPaperCard", error instanceof Error ? error.message : "unknown error");
    }
    return { status: "failed", output: null, costUsd: null };
  }

  const costUsd = estimateCostUsd({
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  if (response.stop_reason === "refusal") {
    return { status: "refused", output: { category: response.stop_details?.category ?? null }, costUsd };
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "invalid", output: { stop_reason: response.stop_reason }, costUsd };
  }
  const extraction = parseExtraction(json);
  if (!extraction) {
    return { status: "invalid", output: json, costUsd };
  }
  return { status: "succeeded", extraction, output: json, costUsd };
}
