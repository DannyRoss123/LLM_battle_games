import { useEffect, useState } from "react";
import { api, prettyModel, type Health } from "./api.ts";
import Connect4Game from "./games/connect4/Connect4Game.tsx";

type Route = "lobby" | "connect4";

interface GameCard {
  id: Route | string;
  name: string;
  blurb: string;
  ready: boolean;
  art: string;
}

const GAMES: GameCard[] = [
  { id: "connect4", name: "Connect Four", blurb: "Drop discs, line up four. Fast, tactical, brutal.", ready: true, art: "art-connect4" },
  { id: "chess", name: "Chess", blurb: "The classic. Can you out-think a language model?", ready: false, art: "art-chess" },
  { id: "poker", name: "Texas Hold'em", blurb: "Bluff a machine that can't see your face.", ready: false, art: "art-poker" },
  { id: "checkers", name: "Checkers", blurb: "Jump, crown, and corner your opponent.", ready: false, art: "art-checkers" },
];

function readRoute(): Route {
  return window.location.hash === "#/connect4" ? "connect4" : "lobby";
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    api.health().then(setHealth).catch(() => setHealth(null));
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (r: Route) => {
    window.location.hash = r === "lobby" ? "" : `/${r}`;
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go("lobby")}>
          <span className="brand-mark" aria-hidden />
          LLM Battleground
        </button>
        <div className="topbar-right">
          {health && (
            <span className={`pill ${health.hasApiKey ? "pill-ok" : "pill-warn"}`}>
              <span className="dot" />
              {health.hasApiKey ? prettyModel(health.model) : "No API key: local bot"}
            </span>
          )}
          {health === null && <span className="pill pill-warn"><span className="dot" />Server offline</span>}
        </div>
      </header>

      {route === "lobby" ? (
        <main className="lobby">
          <section className="hero">
            <h1>
              Humans vs. <span className="grad">language models</span>
            </h1>
            <p>Pick a game. Claude sits across the table. Every move is checked by a real rules engine, so no cheating either way.</p>
          </section>
          <section className="game-grid">
            {GAMES.map((g) => (
              <button
                key={g.id}
                className={`game-card ${g.ready ? "" : "is-locked"}`}
                disabled={!g.ready}
                onClick={() => g.ready && go(g.id as Route)}
              >
                <div className={`game-art ${g.art}`} aria-hidden />
                <div className="game-card-body">
                  <div className="game-card-title">
                    <h2>{g.name}</h2>
                    {!g.ready && <span className="soon">Coming soon</span>}
                  </div>
                  <p>{g.blurb}</p>
                  {g.ready && <span className="play-cta">Play now →</span>}
                </div>
              </button>
            ))}
          </section>
        </main>
      ) : (
        <Connect4Game health={health} onExit={() => go("lobby")} />
      )}
    </div>
  );
}
