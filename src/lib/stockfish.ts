// Client-side wrapper for Stockfish via WebAssembly.
// Uses `stockfish` npm if available; fallback to random legal move.
import { Chess, type MoveVerbose } from 'chess.js';
import type { StockfishEngine } from 'stockfish';

export type EngineConfig = {
  skillLevel?: number; // 0 - 20
  depth?: number; // search depth
  movetime?: number; // in ms
};

export async function getBestMove(pgn: string, cfg: EngineConfig = {}): Promise<string | null> {
  const ch = new Chess();
  if (pgn) ch.loadPgn(pgn);

  // If checkmate or no legal moves
  const legal = ch.moves({ verbose: true }).filter(
    (m): m is MoveVerbose => typeof m !== 'string'
  );
  if (!legal.length) return null;

  // Build UCI move list from history to give engine full context
  const historyVerbose = ch.history({ verbose: true }).filter(
    (m): m is MoveVerbose => typeof m !== 'string'
  );
  const uciMoves = historyVerbose.map((m) => `${m.from}${m.to}${m.promotion ? m.promotion : ''}`);

  try {
    // Singleton engine with robust init
    const engine = await getEngine();
    const skill = Math.min(Math.max(cfg.skillLevel ?? 20, 0), 20);
    let movetimeBase = Math.min(Math.max(cfg.movetime ?? 1200, 100), 10000);

    // Adaptive think time: spend more time in tactical or endgame positions
    try {
      const inCheck = !!(ch as any).inCheck?.();
      const pieceCount = ch.board().flat().filter(Boolean).length;
      const captureMoves = legal.filter((m) => !!m.captured);
      if (inCheck) movetimeBase = Math.min(movetimeBase * 1.8, 12000);
      else if (captureMoves.length >= Math.max(2, legal.length * 0.25)) movetimeBase *= 1.5;
      else if (pieceCount <= 10) movetimeBase *= 1.4; // endgame tends to require precision
    } catch {}

    const movetime = Math.floor(movetimeBase);

    const fen = ch.fen();

    const uciRegex = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    return await new Promise((resolve) => {
      let best: string | null = null;
      let uciOk = false;
      let readyOk = false;

      engine.onmessage = (msg: any) => {
        const line: string | undefined = typeof msg === 'string' ? msg : msg?.data;
        if (typeof line !== 'string') return;
        // We assume engine has been UCI-initialized. Per search, ensure ready then start.
        if (!readyOk && /readyok/.test(line)) {
          readyOk = true;
          engine.postMessage('ucinewgame');
          if (uciMoves.length > 0) {
            engine.postMessage(`position startpos moves ${uciMoves.join(' ')}`);
          } else {
            engine.postMessage(`position fen ${fen}`);
          }
          if (cfg.depth && cfg.depth > 0) engine.postMessage(`go depth ${cfg.depth}`);
          else engine.postMessage(`go movetime ${movetime}`);
          return;
        }
        if (line.startsWith('bestmove')) {
          const parts = line.split(' ');
          const candidate = parts[1];
          if (candidate && candidate !== '(none)' && uciRegex.test(candidate)) {
            best = candidate;
            resolve(best);
          } else {
            resolve(scoreFallbackUci(ch, legal));
          }
        }
      };

      // Ensure engine is ready and set skill for this search
      engine.postMessage(`setoption name Skill Level value ${skill}`);
      engine.postMessage('setoption name UCI_LimitStrength value false');
      engine.postMessage('setoption name Contempt value 0');
      engine.postMessage('setoption name MultiPV value 1');
      engine.postMessage('isready');

      // Safety timeout in case engine fails: fall back to random legal move
      setTimeout(() => {
        if (!best) {
          resolve(scoreFallbackUci(ch, legal));
        } else {
          resolve(best);
        }
      }, movetime + 3000);
    });
  } catch (e) {
    // Fallback: pick a random move
    return scoreFallbackUci(ch, legal);
  }
}

// --- Engine singleton & initialization ---
let engineInstance: StockfishEngine | null = null;
let engineInitDone = false;
let engineInitPromise: Promise<void> | null = null;

async function getEngine(): Promise<StockfishEngine> {
  if (engineInstance && engineInitDone) return engineInstance;
  if (engineInitPromise) {
    await engineInitPromise; return engineInstance as StockfishEngine;
  }
  engineInitPromise = (async () => {
    const mod: any = await import('stockfish');
    const create = (mod?.default ?? mod) as () => StockfishEngine | Promise<StockfishEngine>;
    engineInstance = await create();

    await new Promise<void>((resolve) => {
      let gotUciOk = false;
      const handler = (msg: any) => {
        const line: string | undefined = typeof msg === 'string' ? msg : msg?.data;
        if (typeof line !== 'string') return;
        if (!gotUciOk && /uciok/.test(line)) {
          gotUciOk = true;
          // Set baseline options once
          engineInstance!.postMessage('setoption name Hash value 256');
          engineInstance!.postMessage('setoption name Threads value 2');
          resolve();
        }
      };
      engineInstance!.onmessage = handler;
      engineInstance!.postMessage('uci');
      // Safety: resolve after 2s even if no uciok
      setTimeout(() => { if (!gotUciOk) resolve(); }, 2000);
    });
    engineInitDone = true;
  })();
  await engineInitPromise;
  return engineInstance as StockfishEngine;
}

// ---------- Analysis (MultiPV) ----------
export type AnalysisLine = {
  moveUci: string;
  pv: string[];
  depth: number;
  scoreCp?: number;
  scoreMate?: number;
};

export async function analyzePosition(
  pgn: string,
  cfg: EngineConfig & { multiPV?: number } = {}
): Promise<{ lines: AnalysisLine[]; best?: string }> {
  const ch = new Chess();
  if (pgn) ch.loadPgn(pgn);
  const legal = ch.moves({ verbose: true }).filter((m): m is MoveVerbose => typeof m !== 'string');
  if (!legal.length) return { lines: [], best: undefined };

  const historyVerbose = ch.history({ verbose: true }).filter((m): m is MoveVerbose => typeof m !== 'string');
  const uciMoves = historyVerbose.map((m) => `${m.from}${m.to}${m.promotion ? m.promotion : ''}`);
  const fen = ch.fen();

  const engine = await getEngine();
  const skill = Math.min(Math.max(cfg.skillLevel ?? 20, 0), 20);
  const depth = Math.min(Math.max(cfg.depth ?? 18, 8), 30);
  const multiPV = Math.min(Math.max(cfg.multiPV ?? 3, 1), 5);

  const lines: AnalysisLine[] = [];
  let best: string | undefined;
  const uciRegex = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

  await new Promise<void>((resolve) => {
    engine.onmessage = (msg: any) => {
      const line: string | undefined = typeof msg === 'string' ? msg : msg?.data;
      if (typeof line !== 'string') return;
      if (/readyok/.test(line)) {
        engine.postMessage('ucinewgame');
        if (uciMoves.length > 0) engine.postMessage(`position startpos moves ${uciMoves.join(' ')}`);
        else engine.postMessage(`position fen ${fen}`);
        engine.postMessage(`go depth ${depth}`);
        return;
      }
      // info depth ... multipv N score cp S pv ...
      if (line.startsWith('info')) {
        try {
          const mDepth = /\bdepth (\d+)/.exec(line);
          const mMulti = /\bmultipv (\d+)/.exec(line);
          const mScoreMate = /\bscore mate (-?\d+)/.exec(line);
          const mScoreCp = /\bscore cp (-?\d+)/.exec(line);
          const mPv = /\bpv (.+)$/.exec(line);
          if (mDepth && mMulti && mPv) {
            const d = Number(mDepth[1]);
            const idx = Number(mMulti[1]);
            const pvTokens = mPv[1].trim().split(/\s+/);
            const moveUci = pvTokens[0];
            const entry: AnalysisLine = {
              moveUci,
              pv: pvTokens,
              depth: d,
              scoreCp: mScoreCp ? Number(mScoreCp[1]) : undefined,
              scoreMate: mScoreMate ? Number(mScoreMate[1]) : undefined,
            };
            lines[idx - 1] = entry;
          }
        } catch {}
      }
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const mv = parts[1];
        if (mv && mv !== '(none)' && uciRegex.test(mv)) best = mv;
        resolve();
      }
    };
    engine.postMessage(`setoption name Skill Level value ${skill}`);
    engine.postMessage(`setoption name MultiPV value ${multiPV}`);
    engine.postMessage('isready');
  });

  // filter undefined holes, sort by mate > scoreCp descending
  const filtered = lines.filter(Boolean);
  filtered.sort((a, b) => {
    if (a.scoreMate !== undefined || b.scoreMate !== undefined) {
      const am = a.scoreMate ?? -Infinity;
      const bm = b.scoreMate ?? -Infinity;
      return bm - am; // prefer higher mate (positive means mate for side to move)
    }
    return (b.scoreCp ?? -Infinity) - (a.scoreCp ?? -Infinity);
  });
  return { lines: filtered, best };
}
// Heuristic fallback when engine fails: prefer checks, mates, captures, promotions
function scoreFallbackUci(ch: Chess, legal: MoveVerbose[]): string {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  let bestScore = -Infinity;
  let bestMove: MoveVerbose = legal[0];
  for (const m of legal) {
    let score = 0;
    if (m.san?.includes('#')) score += 1000;
    if (m.san?.includes('+')) score += 100;
    if (m.captured) score += values[m.captured] ?? 1;
    if (m.promotion) score += values[m.promotion] ?? 9;
    // Prioritize central control lightly
    if (/^[de][34]$/.test(m.to)) score += 0.5;
    if (score > bestScore) { bestScore = score; bestMove = m; }
  }
  return `${bestMove.from}${bestMove.to}${bestMove.promotion ? 'q' : ''}`;
}