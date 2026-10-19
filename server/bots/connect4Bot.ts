// Simple local bot. Used when Claude times out, answers with an illegal move,
// refuses, errors, or no API key is configured. It never waits on the network.
import { COLS, dropPiece, checkWinner, legalColumns, other, type Board, type Player } from "../../shared/connect4.ts";

const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

function winsAfter(board: Board, col: number, player: Player): boolean {
  const win = checkWinner(dropPiece(board, col, player).board);
  return win?.winner === player;
}

export function chooseFallbackMove(board: Board, me: Player): number {
  const legal = legalColumns(board);
  if (legal.length === 0) throw new Error("No legal moves");
  const opp = other(me);

  // 1. Win now.
  for (const c of legal) if (winsAfter(board, c, me)) return c;
  // 2. Block an immediate loss.
  for (const c of legal) if (winsAfter(board, c, opp)) return c;
  // 3. Prefer centre columns that don't hand the opponent a win on top.
  const safe = CENTER_ORDER.filter((c) => {
    if (!legal.includes(c)) return false;
    const after = dropPiece(board, c, me).board;
    return !legalColumns(after).some((oc) => winsAfter(after, oc, opp));
  });
  const pool = safe.length > 0 ? safe : CENTER_ORDER.filter((c) => legal.includes(c));
  // Small randomness among the top two so games don't repeat exactly.
  const pick = Math.random() < 0.75 ? 0 : Math.min(1, pool.length - 1);
  return pool[pick] ?? legal[Math.floor(Math.random() * COLS) % legal.length];
}
