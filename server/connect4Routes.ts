// HTTP routes for Connect Four. The server holds the only real copy of each game.
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { checkWinner, createBoard, dropPiece, type Board, type Player, type WinInfo } from "../shared/connect4.ts";
import { getClaudeMove, MODEL, PRESETS, type AiMoveResult, type Difficulty } from "./llm/claudeConnect4.ts";

const HUMAN: Player = 1;
const AI: Player = 2;
const GAME_TTL_MS = 2 * 60 * 60 * 1000;

interface Game {
  id: string;
  board: Board;
  turn: Player;
  history: number[];
  result: WinInfo | null;
  difficulty: Difficulty;
  humanFirst: boolean;
  aiThinking: boolean;
  lastAi: AiMoveResult | null;
  updatedAt: number;
}

const games = new Map<string, Game>();

// Drop abandoned games so memory doesn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - GAME_TTL_MS;
  for (const [id, g] of games) if (g.updatedAt < cutoff) games.delete(id);
}, 10 * 60 * 1000).unref();

function view(g: Game) {
  return {
    id: g.id,
    board: g.board,
    turn: g.turn,
    history: g.history,
    result: g.result,
    difficulty: g.difficulty,
    humanFirst: g.humanFirst,
    timeLimitMs: PRESETS[g.difficulty].timeLimitMs,
    model: MODEL,
    lastAi: g.lastAi,
  };
}
export type GameView = ReturnType<typeof view>;

function applyMove(g: Game, col: number, player: Player) {
  const { board } = dropPiece(g.board, col, player);
  g.board = board;
  g.history.push(col);
  g.result = checkWinner(board);
  g.turn = player === HUMAN ? AI : HUMAN;
  g.updatedAt = Date.now();
}

function getGame(req: Request, res: Response): Game | null {
  const g = games.get(String(req.params.id));
  if (!g) res.status(404).json({ error: "Game not found. Start a new one." });
  return g ?? null;
}

export const connect4Router = Router();

connect4Router.post("/games", (req, res) => {
  const difficulty: Difficulty = req.body?.difficulty in PRESETS ? req.body.difficulty : "standard";
  const humanFirst = req.body?.humanFirst !== false;
  const g: Game = {
    id: randomUUID(),
    board: createBoard(),
    turn: humanFirst ? HUMAN : AI,
    history: [],
    result: null,
    difficulty,
    humanFirst,
    aiThinking: false,
    lastAi: null,
    updatedAt: Date.now(),
  };
  games.set(g.id, g);
  res.json(view(g));
});

connect4Router.get("/games/:id", (req, res) => {
  const g = getGame(req, res);
  if (g) res.json(view(g));
});

connect4Router.post("/games/:id/move", (req, res) => {
  const g = getGame(req, res);
  if (!g) return;
  if (g.result) return void res.status(409).json({ error: "Game is over." });
  if (g.turn !== HUMAN) return void res.status(409).json({ error: "It's not your turn." });
  const col = Number(req.body?.column);
  try {
    applyMove(g, col, HUMAN);
  } catch (e) {
    return void res.status(400).json({ error: (e as Error).message });
  }
  res.json(view(g));
});

connect4Router.post("/games/:id/ai-move", async (req, res) => {
  const g = getGame(req, res);
  if (!g) return;
  if (g.result) return void res.status(409).json({ error: "Game is over." });
  if (g.turn !== AI) return void res.status(409).json({ error: "It's your turn, not Claude's." });
  if (g.aiThinking) return void res.status(409).json({ error: "Claude is already thinking." });

  g.aiThinking = true;
  try {
    const move = await getClaudeMove(g.board, AI, g.history, g.difficulty);
    applyMove(g, move.column, AI);
    g.lastAi = move;
    console.log(
      `[connect4] ${g.id.slice(0, 8)} AI -> col ${move.column + 1} via ${move.source} in ${move.elapsedMs}ms` +
        (move.reason ? ` (${move.reason})` : ""),
    );
    res.json(view(g));
  } finally {
    g.aiThinking = false;
  }
});
