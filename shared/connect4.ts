// Connect Four rules engine. Pure functions, no I/O.
// Shared by the server (authoritative game state) and the client (rendering).

export const ROWS = 6;
export const COLS = 7;

/** 0 = empty, 1 = human, 2 = AI */
export type Cell = 0 | 1 | 2;
export type Player = 1 | 2;
/** board[row][col], row 0 is the TOP row. */
export type Board = Cell[][];

export interface WinInfo {
  winner: Player | "draw";
  /** [row, col] pairs of the winning four, empty on a draw. */
  line: [number, number][];
}

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function legalColumns(board: Board): number[] {
  const cols: number[] = [];
  for (let c = 0; c < COLS; c++) if (board[0][c] === 0) cols.push(c);
  return cols;
}

/** Row a piece would land in, or -1 if the column is full. */
export function landingRow(board: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === 0) return r;
  return -1;
}

/** Returns a new board with the piece dropped, plus the row it landed in. */
export function dropPiece(board: Board, col: number, player: Player): { board: Board; row: number } {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) throw new Error(`Column ${col} is off the board`);
  const row = landingRow(board, col);
  if (row === -1) throw new Error(`Column ${col + 1} is full`);
  const next = cloneBoard(board);
  next[row][col] = player;
  return { board: next, row };
}

const DIRECTIONS: [number, number][] = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal down-right
  [1, -1], // diagonal down-left
];

export function checkWinner(board: Board): WinInfo | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p === 0) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line: [number, number][] = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr][cc] !== p) break;
          line.push([rr, cc]);
        }
        if (line.length === 4) return { winner: p, line };
      }
    }
  }
  if (legalColumns(board).length === 0) return { winner: "draw", line: [] };
  return null;
}

export function other(player: Player): Player {
  return player === 1 ? 2 : 1;
}

/** Text rendering for the LLM prompt. Columns are labelled 1-7 for humans and models. */
export function boardToText(board: Board, me: Player): string {
  const sym = (c: Cell) => (c === 0 ? "." : c === me ? "X" : "O");
  const header = " " + Array.from({ length: COLS }, (_, i) => ` ${i + 1}`).join("");
  const rows = board.map((row) => " |" + row.map(sym).join(" ") + "|");
  return [header, ...rows, " +" + "-".repeat(COLS * 2 - 1) + "+"].join("\n");
}
