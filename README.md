# LLM Battleground

Play classic games against large language models. Connect Four is playable now against Claude Sonnet 5.5. Chess, poker and checkers are planned.

## Quick start

1. Install Node.js 20 or newer.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Paste your Anthropic API key into `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Without a key the game still works. A small local bot plays instead of Claude.
4. Start the app:
   ```bash
   npm run dev
   ```
5. Open http://localhost:5173.

The dev server restarts on its own when you edit `.env`.

## How it works

```
Browser (React)  ──>  Express API  ──>  Rules engine (shared/connect4.ts)
                                   └──>  Claude (server/llm/claudeConnect4.ts)
                                         └─ on timeout / illegal move / error ─> local bot
```

- **The server owns the game.** The browser only sends "I played column N". The server checks it against the rules engine.
- **Claude only picks from legal moves.** The prompt includes the board, the move history and the list of legal columns. The answer comes back as structured JSON and is validated again. An illegal answer gets one retry.
- **Every Claude move has a time limit.** If Claude is too slow, errors, or refuses, the local bot moves instead and the UI says so.
- **The UI waits at least 0.7s** before showing Claude's move, so instant replies still feel like an opponent thinking.

### Difficulty presets

| Preset | Thinking | Effort | Time limit |
|---|---|---|---|
| Blitz | off | low | 8s |
| Standard | adaptive | low | 20s |
| Deep think | adaptive | medium | 45s |

Change these in `server/llm/claudeConnect4.ts`. Set `CLAUDE_MODEL` in `.env` to try a different model.

## Project layout

| Path | What it is |
|---|---|
| `shared/connect4.ts` | Rules engine, used by both server and browser |
| `server/connect4Routes.ts` | Game API and in-memory game store |
| `server/llm/claudeConnect4.ts` | Prompt, Claude call, time limit, validation |
| `server/bots/connect4Bot.ts` | Local fallback bot |
| `src/games/connect4/` | Board UI |
| `src/App.tsx` | Lobby and game cards |

## Adding a new game

Each game follows the same pattern:

1. A rules engine in `shared/` that lists legal moves and applies them.
2. A prompt builder and Claude call in `server/llm/`.
3. A fallback bot in `server/bots/`.
4. Routes in `server/`, plus a UI folder in `src/games/`.
5. Flip `ready: true` on its card in `src/App.tsx`.

For chess, `chess.js` can provide the rules engine.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | API on port 8787 and UI on port 5173 with hot reload |
| `npm run typecheck` | TypeScript check |
| `npm run test:engine` | Rules engine and bot tests |
| `npm start` | Production build served from one server on port 8787 |

Games are kept in memory, so they are lost when the server restarts.
