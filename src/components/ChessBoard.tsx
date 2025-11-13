"use client";
import { useMemo, useState } from 'react';
import { useGameStore } from "@/store/gameStore";
// Lightweight classnames helper to avoid external dependency
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type Props = {
  size?: number;
  perspective?: 'w' | 'b';
  onMove?: (from: string, to: string) => void;
  allowMoves?: boolean;
};

const files = ['a','b','c','d','e','f','g','h'];
const ranks = ['8','7','6','5','4','3','2','1'];

const unicodePieces: Record<string, string> = {
  'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
  'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
};

// Piece image source helper (CBurnett/Wikipedia set via CDN)
function pieceImageUrl(color: 'w' | 'b', type: string) {
  const t = String(type).toUpperCase();
  return `https://cdnjs.cloudflare.com/ajax/libs/chessboard-js/1.0.0/img/chesspieces/wikipedia/${color}${t}.png`;
}

export default function ChessBoard({ size = 512, perspective = 'w', onMove, allowMoves = true }: Props) {
  const { chess, move, moves } = useGameStore();
  const [selected, setSelected] = useState<string | null>(null);

  const board = useMemo(() => chess.board(), [chess, chess.board]);
  const inCheckBoard = !!(chess as any).inCheck?.();
  const isMateBoard = chess.isCheckmate();

  const handleSquareClick = (sq: string) => {
    if (!allowMoves) return;
    if (!selected) {
      setSelected(sq);
      return;
    }
    const ok = move(selected, sq);
    if (ok && onMove) onMove(selected, sq);
    setSelected(null);
  };

  const squares = [] as { coord: string; color: 'dark'|'light'; piece?: any }[];
  const orientedRanks = perspective === 'w' ? ranks : [...ranks].reverse();
  const orientedFiles = perspective === 'w' ? files : [...files].reverse();

  for (const r of orientedRanks) {
    for (const f of orientedFiles) {
      const coord = `${f}${r}`;
      const fileIdx = files.indexOf(f);
      const rankIdx = ranks.indexOf(r);
      const isDark = (fileIdx + rankIdx) % 2 === 1;
      const sq = chess.get(coord as any);
      squares.push({ coord, color: isDark ? 'dark' : 'light', piece: sq });
    }
  }

  return (
    <div style={{ width: size, height: size }} className={cn("neo-board overflow-hidden relative", inCheckBoard && "shake")}
    >
      {/* Captured strips: show inside board edges (top: Black lost; bottom: White lost) */}
      <div className="absolute top-1 left-1 right-1 z-10 pointer-events-none">
        <div className="flex items-center gap-1 bg-[#0f131a]/70 rounded px-2 py-1 text-xs text-gray-200">
          <span className="opacity-80">Đen mất:</span>
          <div className="flex items-center gap-1">
            {moves.filter((m:any)=>m.color==='w' && m.captured).map((m:any, i:number)=>{
              const key = String(m.captured) as keyof typeof unicodePieces;
              return (
                <span key={`cap-b-${i}`} className="piece-black text-base leading-none">
                  {unicodePieces[key]}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="absolute bottom-1 left-1 right-1 z-10 pointer-events-none">
        <div className="flex items-center gap-1 bg-[#0f131a]/70 rounded px-2 py-1 text-xs text-gray-200">
          <span className="opacity-80">Trắng mất:</span>
          <div className="flex items-center gap-1">
            {moves.filter((m:any)=>m.color==='b' && m.captured).map((m:any, i:number)=>{
              const key = String(m.captured).toUpperCase() as keyof typeof unicodePieces;
              return (
                <span key={`cap-w-${i}`} className="piece-white text-base leading-none">
                  {unicodePieces[key]}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {squares.map((s) => {
          const isSelected = selected === s.coord;
          const isCheckedKing = inCheckBoard && s.piece?.type === 'k' && s.piece?.color === chess.turn();
          const isMatedKing = isMateBoard && s.piece?.type === 'k' && s.piece?.color === chess.turn();
          const last = moves[moves.length - 1];
          const isLastFrom = last?.from === s.coord;
          const isLastTo = last?.to === s.coord;
          const lastPiece = last ? chess.get(last.to as any) : null;
          const underlineColor = lastPiece?.color === 'w' ? 'bg-emerald-400' : 'bg-rose-500';
          return (
            <button
              key={s.coord}
              className={cn('square-anim relative flex items-center justify-center text-3xl',
                s.color === 'dark' ? 'bg-boardDark' : 'bg-boardLight text-black',
                isSelected && 'ring-2 ring-accent')}
              onClick={() => handleSquareClick(s.coord)}
            >
              {s.piece && (
                <span className={cn("move-anim select-none",
                  isCheckedKing && 'king-fire-piece',
                  isMatedKing && 'king-die',
                  isMateBoard && isLastTo && 'attacker-slow'
                )}>
                  <span className={cn(
                    s.piece.color === 'w' ? 'piece-white' : 'piece-black'
                  )}>
                    {unicodePieces[s.piece.color === 'w' ? s.piece.type.toUpperCase() : s.piece.type]}
                  </span>
                </span>
              )}
              {isCheckedKing && (
                <>
                  <div className="absolute inset-0 king-check-ring opacity-90 pointer-events-none" />
                  <div className="absolute inset-0 king-fire pointer-events-none" />
                </>
              )}
              {(isLastFrom || isLastTo) && (
                <div className={cn('absolute bottom-0 left-0 right-0 h-1 opacity-80', underlineColor)} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}