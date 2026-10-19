import { useCallback, useEffect, useRef, useState } from "react";
import { COLS, ROWS, dropPiece, landingRow, type Board, type Cell } from "../../../shared/connect4.ts";
import { api, prettyModel, type Difficulty, type GameView, type Health } from "../../api.ts";

const HUMAN = 1;
const AI = 2;
/** Even an instant reply waits this long, so the opponent feels like it's "thinking". */
const MIN_THINK_MS = 700;

const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: "blitz", label: "Blitz", hint: "No thinking, 8s limit" },
  { id: "standard", label: "Standard", hint: "Light thinking, 20s limit" },
  { id: "deep", label: "Deep think", hint: "More thinking, 45s limit" },
];

interface Score {
  wins: number;
  losses: number;
  draws: number;
}
const SCORE_KEY = "llmb.connect4.score";
function loadScore(): Score {
  try {
    const s = JSON.parse(localStorage.getItem(SCORE_KEY) || "");
    if (typeof s?.wins === "number") return s;
  } catch {
    /* ignore */
  }
  return { wins: 0, losses: 0, draws: 0 };
}
function saveScore(s: Score) {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Connect4Game({ health, onExit }: { health: Health | null; onExit: () => void }) {
  const [game, setGame] = useState<GameView | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [humanFirst, setHumanFirst] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [thinkStart, setThinkStart] = useState(0);
  const [pending, setPending] = useState(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<Score>(loadScore);
  const scoredGame = useRef<string | null>(null);
  const started = useRef(false);

  const runAi = useCallback(async (id: string) => {
    setAiThinking(true);
    setThinkStart(Date.now());
    try {
      const [next] = await Promise.all([api.aiMove(id), sleep(MIN_THINK_MS)]);
      setGame(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiThinking(false);
    }
  }, []);

  const startGame = useCallback(
    async (diff = difficulty, first = humanFirst) => {
      setError(null);
      setPending(true);
      try {
        const g = await api.newGame(diff, first);
        setGame(g);
        if (g.turn === AI) await runAi(g.id);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPending(false);
      }
    },
    [difficulty, humanFirst, runAi],
  );

  // Start a game on first visit (guarded so StrictMode doesn't start two).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startGame();
  }, [startGame]);

  // Tally results once per game.
  useEffect(() => {
    if (!game?.result || scoredGame.current === game.id) return;
    scoredGame.current = game.id;
    setScore((s) => {
      const next = { ...s };
      if (game.result!.winner === HUMAN) next.wins++;
      else if (game.result!.winner === AI) next.losses++;
      else next.draws++;
      saveScore(next);
      return next;
    });
  }, [game]);

  const canMove = !!game && !game.result && game.turn === HUMAN && !aiThinking && !pending;

  const play = useCallback(
    async (col: number) => {
      if (!game || !canMove || landingRow(game.board, col) === -1) return;
      setError(null);
      setPending(true);
      // Optimistic drop so the disc falls instantly; the server response replaces it.
      const optimistic = dropPiece(game.board, col, HUMAN).board;
      setGame({ ...game, board: optimistic, turn: AI, history: [...game.history, col] });
      try {
        const next = await api.move(game.id, col);
        setGame(next);
        if (!next.result) await runAi(next.id);
      } catch (e) {
        setError((e as Error).message);
        setGame(game); // roll back
      } finally {
        setPending(false);
      }
    },
    [game, canMove, runAi],
  );

  // Keys 1-7 drop a disc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= COLS) void play(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  const modelName = prettyModel(game?.model ?? health?.model ?? "claude-sonnet-5-5");
  const result = game?.result ?? null;
  const winSet = new Set(result?.line.map(([r, c]) => `${r}-${c}`) ?? []);
  const lastAi = game?.lastAi ?? null;

  let status: string;
  let statusTone: "you" | "ai" | "end" = "you";
  if (!game) status = "Setting up the board…";
  else if (result) {
    statusTone = "end";
    status = result.winner === HUMAN ? "You win! 🎉" : result.winner === AI ? `${modelName} wins.` : "It's a draw.";
  } else if (aiThinking || game.turn === AI) {
    statusTone = "ai";
    status = `${modelName} is thinking…`;
  } else status = "Your move";

  return (
    <main className="c4-page">
      <div className="c4-layout">
        <section className="c4-stage">
          <div className="players">
            <PlayerTag name="You" disc={HUMAN} active={!!game && !result && game.turn === HUMAN && !aiThinking} />
            <div className="score" title="Your record vs. the model">
              <b>{score.wins}</b>
              <span>–</span>
              <b>{score.losses}</b>
              {score.draws > 0 && <small> ({score.draws} draw{score.draws === 1 ? "" : "s"})</small>}
            </div>
            <PlayerTag name={modelName} disc={AI} active={aiThinking} right />
          </div>

          <div className={`status status-${statusTone}`} role="status" aria-live="polite">
            {status}
          </div>

          <BoardView
            board={game?.board ?? emptyBoard}
            winSet={winSet}
            canMove={canMove}
            hoverCol={hoverCol}
            setHoverCol={setHoverCol}
            onPlay={play}
            dim={!!result && result.winner !== "draw"}
          />

          <ThinkBar active={aiThinking} start={thinkStart} limitMs={game?.timeLimitMs ?? 20000} />
          <p className="kbd-hint">Tip: press keys 1–7 to drop a disc.</p>
        </section>

        <aside className="c4-panel">
          <div className="panel-card speech-card">
            <div className="speech-head">
              <span className="avatar" aria-hidden>
                ✳
              </span>
              <div>
                <div className="speech-name">{modelName}</div>
                <div className="speech-sub">
                  {lastAi
                    ? lastAi.source === "claude"
                      ? `Played column ${lastAi.column + 1} in ${(lastAi.elapsedMs / 1000).toFixed(1)}s`
                      : `Backup bot played column ${lastAi.column + 1}`
                    : "Waiting for your first move"}
                </div>
              </div>
            </div>
            {aiThinking ? (
              <div className="bubble bubble-thinking">
                <span />
                <span />
                <span />
              </div>
            ) : lastAi?.taunt ? (
              <div className="bubble">“{lastAi.taunt}”</div>
            ) : lastAi?.source === "fallback" ? (
              <div className="bubble bubble-warn">{lastAi.reason}. The backup bot made this move.</div>
            ) : (
              <div className="bubble bubble-muted">Ready when you are.</div>
            )}
          </div>

          <div className="panel-card">
            <h3>Difficulty</h3>
            <div className="seg">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  className={difficulty === d.id ? "on" : ""}
                  onClick={() => setDifficulty(d.id)}
                  title={d.hint}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="muted small">{DIFFICULTIES.find((d) => d.id === difficulty)?.hint}. Applies to the next game.</p>

            <h3>Who goes first</h3>
            <div className="seg">
              <button className={humanFirst ? "on" : ""} onClick={() => setHumanFirst(true)}>
                You
              </button>
              <button className={!humanFirst ? "on" : ""} onClick={() => setHumanFirst(false)}>
                Claude
              </button>
            </div>

            <button className="btn-primary" disabled={pending && !result} onClick={() => startGame()}>
              {result ? "Play again" : "New game"}
            </button>
            <button className="btn-ghost" onClick={onExit}>
              ← Back to lobby
            </button>
          </div>

          <div className="panel-card">
            <h3>Moves</h3>
            {game && game.history.length > 0 ? (
              <ol className="moves">
                {game.history.map((c, i) => {
                  const isHuman = (i % 2 === 0) === game.humanFirst;
                  return (
                    <li key={i}>
                      <span className={`mini-disc ${isHuman ? "d1" : "d2"}`} />
                      {isHuman ? "You" : "Claude"} <span className="muted">→ column {c + 1}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted small">No moves yet.</p>
            )}
          </div>

          {error && <div className="error">{error}</div>}
        </aside>
      </div>
    </main>
  );
}

const emptyBoard: Board = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));

function PlayerTag({ name, disc, active, right }: { name: string; disc: 1 | 2; active: boolean; right?: boolean }) {
  return (
    <div className={`player ${active ? "is-active" : ""} ${right ? "is-right" : ""}`}>
      <span className={`mini-disc big d${disc}`} />
      <span className="player-name">{name}</span>
    </div>
  );
}

function BoardView(props: {
  board: Board;
  winSet: Set<string>;
  canMove: boolean;
  hoverCol: number | null;
  setHoverCol: (c: number | null) => void;
  onPlay: (c: number) => void;
  dim: boolean;
}) {
  const { board, winSet, canMove, hoverCol, setHoverCol, onPlay, dim } = props;
  const previewRow = hoverCol !== null && canMove ? landingRow(board, hoverCol) : -1;

  return (
    <div className="board-wrap" onMouseLeave={() => setHoverCol(null)}>
      <div className="preview-row" aria-hidden>
        {hoverCol !== null && canMove && previewRow !== -1 && (
          <span className="disc d1 ghost" style={{ ["--c" as string]: hoverCol }} />
        )}
      </div>
      <div className={`board ${canMove ? "can-move" : ""} ${dim ? "has-winner" : ""}`}>
        <div className="grid">
          {/* Discs sit behind the board face and slide down through the holes. */}
          {board.map((row, r) =>
            row.map((cell, c) =>
              cell === 0 ? null : (
                <span
                  key={`${r}-${c}`}
                  className={`disc d${cell} ${winSet.has(`${r}-${c}`) ? "is-win" : ""}`}
                  style={{ ["--r" as string]: r, ["--c" as string]: c }}
                />
              ),
            ),
          )}
          {hoverCol !== null && previewRow !== -1 && (
            <span className="landing" style={{ ["--r" as string]: previewRow, ["--c" as string]: hoverCol }} />
          )}
          <div className="face" />
          <div className="rims" />
          {[...winSet].map((k) => {
            const [r, c] = k.split("-").map(Number);
            return <span key={k} className="win-ring" style={{ ["--r" as string]: r, ["--c" as string]: c }} />;
          })}
          <div className="hit-cols">
            {Array.from({ length: COLS }, (_, c) => (
              <button
                key={c}
                aria-label={`Drop in column ${c + 1}`}
                disabled={!canMove || board[0][c] !== 0}
                onMouseEnter={() => setHoverCol(c)}
                onFocus={() => setHoverCol(c)}
                onClick={() => onPlay(c)}
              />
            ))}
          </div>
        </div>
        <div className="shine" aria-hidden />
      </div>
      <div className="board-feet" aria-hidden>
        <span />
        <span />
      </div>
    </div>
  );
}

function ThinkBar({ active, start, limitMs }: { active: boolean; start: number; limitMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [active]);
  const elapsed = active ? Math.max(0, now - start) : 0;
  const left = Math.max(0, limitMs - elapsed);
  const pct = active ? (left / limitMs) * 100 : 0;
  return (
    <div className={`thinkbar ${active ? "on" : ""}`} aria-hidden={!active}>
      <div className="thinkbar-track">
        <div className="thinkbar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="thinkbar-label">{active ? `${(left / 1000).toFixed(1)}s left on the clock` : " "}</span>
    </div>
  );
}
