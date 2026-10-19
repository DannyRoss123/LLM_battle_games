// Thin client for the game server. Types come straight from the server so they never drift.
import type { GameView } from "../server/connect4Routes.ts";
import type { Difficulty } from "../server/llm/claudeConnect4.ts";

export type { GameView, Difficulty };

export interface Health {
  ok: boolean;
  hasApiKey: boolean;
  model: string;
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  health: () => call<Health>("/api/health"),
  newGame: (difficulty: Difficulty, humanFirst: boolean) =>
    call<GameView>("/api/connect4/games", { difficulty, humanFirst }),
  move: (id: string, column: number) => call<GameView>(`/api/connect4/games/${id}/move`, { column }),
  aiMove: (id: string) => call<GameView>(`/api/connect4/games/${id}/ai-move`, {}),
};

export function prettyModel(id: string): string {
  // "claude-sonnet-5-5" -> "Claude Sonnet 5.5"
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?$/);
  if (!m) return id;
  const name = m[1][0].toUpperCase() + m[1].slice(1);
  return `Claude ${name} ${m[2]}${m[3] ? "." + m[3] : ""}`;
}
