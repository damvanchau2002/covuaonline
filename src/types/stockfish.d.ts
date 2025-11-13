declare module 'stockfish' {
  type Message = string | { data?: any };

  export interface StockfishEngine {
    postMessage(command: string): void;
    onmessage: (message: Message) => void;
    terminate?: () => void;
  }

  // Some builds export a function directly, others as default
  const create: () => StockfishEngine | Promise<StockfishEngine>;
  export default create;
}