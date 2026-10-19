// Minimal engine checks. Run with: npm run test:engine
import assert from "node:assert/strict";
import { createBoard, dropPiece, checkWinner, legalColumns, type Board } from "./connect4.ts";
import { chooseFallbackMove } from "../server/bots/connect4Bot.ts";

function play(moves: [number, 1 | 2][]): Board {
  let b = createBoard();
  for (const [c, p] of moves) b = dropPiece(b, c, p).board;
  return b;
}

// Pieces stack from the bottom.
{
  const { row } = dropPiece(createBoard(), 3, 1);
  assert.equal(row, 5);
}

// Horizontal, vertical and diagonal wins.
assert.equal(checkWinner(play([[0, 1], [1, 1], [2, 1], [3, 1]]))?.winner, 1);
assert.equal(checkWinner(play([[4, 2], [4, 2], [4, 2], [4, 2]]))?.winner, 2);
{
  const b = play([
    [0, 1],
    [1, 2], [1, 1],
    [2, 2], [2, 2], [2, 1],
    [3, 2], [3, 2], [3, 2], [3, 1],
  ]);
  const win = checkWinner(b);
  assert.equal(win?.winner, 1);
  assert.equal(win?.line.length, 4);
}

// Full column is not legal and throws.
{
  let b = createBoard();
  for (let i = 0; i < 6; i++) b = dropPiece(b, 0, (i % 2) + 1 as 1 | 2).board;
  assert.ok(!legalColumns(b).includes(0));
  assert.throws(() => dropPiece(b, 0, 1));
}

// Fallback bot takes a win, and blocks an opponent win.
assert.equal(chooseFallbackMove(play([[0, 2], [1, 2], [2, 2]]), 2), 3);
assert.equal(chooseFallbackMove(play([[0, 1], [1, 1], [2, 1]]), 2), 3);

console.log("connect4 engine: all checks passed");
