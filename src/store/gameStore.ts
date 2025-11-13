import { create } from 'zustand';
import { Chess } from 'chess.js';

export type MoveRecord = { from: string; to: string; san: string; color: 'w'|'b'; captured?: string };

type GameState = {
  chess: Chess;
  moves: MoveRecord[];
  turn: 'w' | 'b';
  result: string | null;
  reset: () => void;
  move: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => boolean;
  loadPGN: (pgn: string) => void;
};

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  moves: [],
  turn: 'w',
  result: null,
  reset: () => set({ chess: new Chess(), moves: [], turn: 'w', result: null }),
  move: (from, to, promotion) => {
    const ch = get().chess;
    // Only set promotion when a pawn reaches last rank; otherwise omit.
    const piece = ch.get(from as any);
    const toRank = to[1];
    const shouldPromote =
      piece?.type === 'p' && (
        (piece.color === 'w' && toRank === '8') ||
        (piece.color === 'b' && toRank === '1')
      );
    let res: any = null;
    try {
      const promo = promotion ?? (shouldPromote ? 'q' : undefined);
      res = ch.move(promo ? { from, to, promotion: promo } : { from, to });
    } catch {
      // Invalid move (e.g., diagonal without capture) — ignore gracefully
      return false;
    }
    if (res) {
      set((s) => ({
        moves: [...s.moves, { from, to, san: res.san, color: res.color, captured: res.captured }],
        turn: ch.turn(),
        result: ch.isGameOver()
          ? ch.isCheckmate()
            ? ch.turn() === 'w' ? 'Đen thắng' : 'Trắng thắng'
            : 'Hoà'
          : null,
      }));
      return true;
    }
    return false;
  },
  loadPGN: (pgn: string) => {
    const ch = new Chess();
    ch.loadPgn(pgn);
    set({ chess: ch, turn: ch.turn(), moves: ch.history({ verbose: true }).map((m: any) => ({ from: m.from, to: m.to, san: m.san, color: m.color, captured: m.captured })), result: ch.isGameOver() ? 'Kết thúc' : null });
  },
}));