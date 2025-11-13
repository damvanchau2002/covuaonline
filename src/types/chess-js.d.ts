declare module 'chess.js' {
  export type Color = 'w' | 'b';
  export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
  export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

  export interface Piece {
    type: PieceType;
    color: Color;
  }

  export interface MoveVerbose {
    color: Color;
    from: string;
    to: string;
    flags: string;
    piece: PieceType;
    san: string;
    captured?: PieceType;
    promotion?: PromotionPiece;
  }

  export interface HistoryOptions {
    verbose?: boolean;
  }

  export interface MoveOptions {
    verbose?: boolean;
  }

  export class Chess {
    constructor(fen?: string);
    move(move: { from: string; to: string; promotion?: PromotionPiece } | string): MoveVerbose | null;
    board(): (Piece | null)[][];
    get(square: string): Piece | null;
    moves(options?: MoveOptions): (string | MoveVerbose)[];
    turn(): Color;
    isGameOver(): boolean;
    isCheckmate(): boolean;
    fen(): string;
    pgn(): string;
    loadPgn(pgn: string): void;
    history(options?: HistoryOptions): (string | MoveVerbose)[];
  }
}