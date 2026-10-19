// Asks Claude for a Connect Four move.
// The engine stays in charge: Claude only picks from the legal columns we send,
// and every answer is validated. Anything slow or wrong falls back to the local bot.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { boardToText, legalColumns, type Board, type Player } from "../../shared/connect4.ts";
import { chooseFallbackMove } from "../bots/connect4Bot.ts";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

export type Difficulty = "blitz" | "standard" | "deep";

interface Preset {
  label: string;
  /** Hard wall-clock limit for Claude's move, including one retry. */
  timeLimitMs: number;
  thinking: Anthropic.MessageCreateParams["thinking"];
  effort: "low" | "medium" | "high";
  maxTokens: number;
}

// Sonnet 5.5 notes: thinking can't be "disabled"; `between_tools` is the
// thinking-off mode. Effort is the main speed/quality dial.
export const PRESETS: Record<Difficulty, Preset> = {
  blitz: { label: "Blitz", timeLimitMs: 8_000, thinking: { type: "between_tools" }, effort: "low", maxTokens: 1_000 },
  standard: { label: "Standard", timeLimitMs: 20_000, thinking: { type: "adaptive" }, effort: "low", maxTokens: 8_000 },
  deep: { label: "Deep think", timeLimitMs: 45_000, thinking: { type: "adaptive" }, effort: "medium", maxTokens: 16_000 },
};

const MoveSchema = z.object({
  column: z.number().int().describe("Column to drop your piece in, 1-7"),
  taunt: z.string().describe("One short, playful line of table talk to your opponent (max ~12 words)"),
});

const SYSTEM_PROMPT = `You are playing Connect Four against a human in a game arena.
Rules: a 7-column, 6-row board. Pieces fall to the lowest empty cell of the chosen column. The first player to connect four of their own pieces horizontally, vertically or diagonally wins.
You are X. Your opponent is O. Empty cells are ".". Row 1 of the picture is the top.
Before choosing, check whether you can win immediately and whether the opponent threatens to win next turn.
Choose only from the legal columns you are given. Reply with the column number (1-7) and a short, good-natured taunt.`;

export type MoveSource = "claude" | "fallback";

export interface AiMoveResult {
  /** 0-based column. */
  column: number;
  source: MoveSource;
  taunt: string | null;
  /** Why the fallback was used, if it was. */
  reason?: string;
  elapsedMs: number;
}

let client: Anthropic | null = null;
export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

function buildPrompt(board: Board, me: Player, history: number[], legal: number[], note?: string): string {
  const historyText =
    history.length === 0
      ? "No moves yet."
      : history.map((c, i) => `${i + 1}. ${i % 2 === 0 ? "first player" : "second player"} -> column ${c + 1}`).join("\n");
  return [
    "Current board:",
    boardToText(board, me),
    "",
    `Move history:\n${historyText}`,
    "",
    `Legal columns: ${legal.map((c) => c + 1).join(", ")}`,
    note ? `\nNote: ${note}` : "",
    "\nYour move.",
  ].join("\n");
}

export async function getClaudeMove(
  board: Board,
  me: Player,
  history: number[],
  difficulty: Difficulty,
): Promise<AiMoveResult> {
  const started = Date.now();
  const legal = legalColumns(board);
  const preset = PRESETS[difficulty];
  const fallback = (reason: string): AiMoveResult => ({
    column: chooseFallbackMove(board, me),
    source: "fallback",
    taunt: null,
    reason,
    elapsedMs: Date.now() - started,
  });

  if (!hasApiKey()) return fallback("No ANTHROPIC_API_KEY set in .env");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), preset.timeLimitMs);
  let note: string | undefined;

  try {
    // One retry if Claude names an illegal column, as long as time remains.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await getClient().messages.parse(
        {
          model: MODEL,
          max_tokens: preset.maxTokens,
          system: SYSTEM_PROMPT,
          thinking: preset.thinking,
          output_config: { effort: preset.effort, format: zodOutputFormat(MoveSchema) },
          messages: [{ role: "user", content: buildPrompt(board, me, history, legal, note) }],
        },
        { signal: controller.signal, maxRetries: 1 },
      );

      if (response.stop_reason === "refusal") return fallback("Claude declined to answer");
      if (response.stop_reason === "max_tokens") return fallback("Claude ran out of tokens");

      const parsed = response.parsed_output;
      const col = parsed ? parsed.column - 1 : -1;
      if (parsed && legal.includes(col)) {
        return {
          column: col,
          source: "claude",
          taunt: parsed.taunt.trim().slice(0, 140) || null,
          elapsedMs: Date.now() - started,
        };
      }
      note = `Column ${parsed?.column ?? "?"} is not legal. Pick one of: ${legal.map((c) => c + 1).join(", ")}.`;
    }
    return fallback("Claude picked an illegal column twice");
  } catch (err) {
    if (controller.signal.aborted) return fallback(`Claude took longer than ${preset.timeLimitMs / 1000}s`);
    if (err instanceof Anthropic.AuthenticationError) return fallback("API key was rejected");
    if (err instanceof Anthropic.RateLimitError) return fallback("Rate limited by the API");
    if (err instanceof Anthropic.APIError) return fallback(`API error ${err.status ?? ""}`.trim());
    console.error("[claude] unexpected error", err);
    return fallback("Unexpected error calling Claude");
  } finally {
    clearTimeout(timer);
  }
}
