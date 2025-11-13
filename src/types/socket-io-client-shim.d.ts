// Ambient module shim to satisfy TypeScript when the IDE cache
// fails to resolve 'socket.io-client'. The real types come from
// the package, but this prevents ts(2307) in edge cases.
declare module 'socket.io-client' {
  export function io(...args: any[]): any;
}