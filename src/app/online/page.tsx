"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChessBoard from "@/components/ChessBoard";
import Chat from "@/components/Chat";
import { useGameStore } from "@/store/gameStore";
import { getSocket } from "@/lib/socket";
import { playMoveSound } from "@/lib/sound";
import { useSession, signIn } from "next-auth/react";

export default function OnlinePage() {
  const { chess, move, reset, turn } = useGameStore();
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [meColor, setMeColor] = useState<'w'|'b'>('w');
  const [connected, setConnected] = useState<boolean>(false);
  const [ended, setEnded] = useState<{ result: 'checkmate'|'draw'; winner?: 'w'|'b'; reason?: string } | null>(null);
  const canJoin = !!roomId && !joined;
  const canLeave = !!joined;

  // Helper: emit with ack, compatible with clients that may not support timeout()
  function emitWithAck<T = any>(event: string, data: any, cb: (err: any, res?: T) => void) {
    const s = getSocket();
    const hasTimeout = typeof (s as any).timeout === 'function';
    if (hasTimeout) {
      (s as any).timeout(1500).emit(event, data, (err: any, res: T) => cb(err, res));
    } else {
      s.emit(event, data, (res: T) => cb(null, res));
    }
  }

  useEffect(() => {
    const s = getSocket();
    // Identify with username from session
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    s.emit('identify', { username });
    setConnected(s.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onMove = (payload: { from:string; to:string }) => {
      const ok = move(payload.from, payload.to);
      if (ok) playMoveSound();
    };
    const onGameOver = (payload: { result: 'checkmate'|'draw'; winner?: 'w'|'b'; reason?: string }) => {
      setEnded(payload);
      const reasonLabel = (r?: string) => {
        switch (r) {
          case 'stalemate': return 'thế bí';
          case 'threefold': return 'ba lần lặp';
          case 'insufficient-material': return 'thiếu quân';
          case 'fifty-move': return '50 nước';
          default: return undefined;
        }
      };
      const text = payload.result === 'checkmate'
        ? `Chiếu hết! ${(payload.winner === 'w') ? 'Trắng' : 'Đen'} thắng`
        : `Ván hoà${reasonLabel(payload.reason) ? ` (${reasonLabel(payload.reason)})` : ''}`;
      setToast(text);
      setTimeout(() => setToast(null), 2500);
    };
    const onYourColor = (payload: { color:'w'|'b'; roomId?:string }) => {
      if (payload?.color) setMeColor(payload.color);
      if (payload?.roomId) setRoomId(payload.roomId);
    };
    const onSync = (payload: { history?: Array<{from:string;to:string}> }) => {
      try {
        const hist = Array.isArray(payload?.history) ? payload.history : [];
        if (hist.length > 0) {
          reset();
          for (const m of hist) {
            move(m.from, m.to);
          }
        }
      } catch {}
    };
    s.on('move', onMove);
    s.on('sync', onSync);
    s.on('yourColor', onYourColor);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('gameOver', onGameOver);
    return () => { s.off('move', onMove); s.off('sync', onSync); s.off('yourColor', onYourColor); s.off('connect', onConnect); s.off('disconnect', onDisconnect); s.off('gameOver', onGameOver); };
  }, [move, session]);

  // Show toast when redirected back with login=success
  useEffect(() => {
    if (status !== 'authenticated') return;
    const login = params.get('login');
    if (login === 'success') {
      setToast('Đăng nhập thành công!');
      setTimeout(() => { setToast(null); router.replace('/online'); }, 2000);
    }
  }, [status, params, router]);

  const createRoom = () => {
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    const s = getSocket();
    if (!s.connected) {
      setToast('Không kết nối được server phòng. Kiểm tra backend: http://localhost:4000');
      return;
    }
    emitWithAck<any>('createRoom', { username }, (err, res) => {
      if (err) { setToast('Tạo phòng thất bại (hết thời gian hoặc server không phản hồi)'); return; }
      const rid = typeof res === 'string' ? res : res?.roomId;
      if (typeof rid === 'string' && rid.length > 0) {
        setRoomId(rid);
        try { localStorage.setItem('roomId', rid); } catch {}
        setJoined(true);
        setEnded(null);
        const color = (res && typeof res === 'object') ? res.color : 'w';
        setMeColor(color === 'b' ? 'b' : 'w');
        // Confirm color from server to avoid mismatch
        emitWithAck<any>('myColor', { roomId: rid }, (e, r) => {
          if (!e && r && (r as any).color) setMeColor((r as any).color);
        });
      } else { setToast('Server không trả mã phòng'); }
    });
  };

  const joinRoom = () => {
    if (!roomId) return;
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    const s = getSocket();
    if (!s.connected) { setToast('Không kết nối được server phòng'); return; }
    emitWithAck<any>('joinRoom', { roomId, username }, (err, res) => {
      if (err) { setToast('Tham gia phòng thất bại'); return; }
      const ok = typeof res === 'object' ? !!res.ok : !!res;
      setJoined(ok);
      if (ok) setEnded(null);
      const color = (res && typeof res === 'object') ? res.color : 'b';
      setMeColor(color === 'w' ? 'w' : 'b');
      if (ok) { try { localStorage.setItem('roomId', roomId); } catch {} }
      // Confirm color from server to avoid mismatch
      emitWithAck<any>('myColor', { roomId }, (e, r) => {
        if (!e && r && (r as any).color) setMeColor((r as any).color);
      });
      if (!ok) setToast('Mã phòng không tồn tại');
    });
  };

  const handleMove = (from: string, to: string) => {
    if (turn !== meColor) { setToast('Chưa đến lượt bạn'); return; }
    // Detect promotion client-side to avoid null move at last rank
    let promotion: 'q'|'r'|'b'|'n' | undefined;
    try {
      const piece = chess.get(from as any) as any;
      const toRank = to[1];
      const shouldPromote = piece?.type === 'p' && (
        (piece.color === 'w' && toRank === '8') ||
        (piece.color === 'b' && toRank === '1')
      );
      promotion = shouldPromote ? 'q' : undefined;
    } catch {}
    emitWithAck<any>('move', { roomId, from, to, promotion }, (err) => {
      if (err) { setToast('Gửi nước đi thất bại'); }
    });
  };

  const handleResync = () => {
    if (!roomId) { setToast('Chưa có mã phòng để đồng bộ'); return; }
    const s = getSocket();
    const hasTimeout = typeof (s as any).timeout === 'function';
    const apply = (payload: any) => {
      try {
        const hist = Array.isArray(payload?.history) ? payload.history : [];
        reset();
        for (const m of hist) move(m.from, m.to);
        setToast('Đã đồng bộ lại!');
        setEnded(null);
      } catch { setToast('Đồng bộ thất bại'); }
    };
    if (hasTimeout) {
      (s as any).timeout(3000).emit('requestSync', { roomId }, (err: any, res: any) => {
        if (err) { setToast('Đồng bộ thất bại'); return; }
        apply(res);
      });
    } else {
      s.emit('requestSync', { roomId }, (res: any) => apply(res));
    }
  };

  const leaveRoom = () => {
    if (!roomId) { setToast('Bạn chưa ở trong phòng'); return; }
    const s = getSocket();
    const hasTimeout = typeof (s as any).timeout === 'function';
    const done = (ok: boolean) => {
      try { localStorage.removeItem('roomId'); } catch {}
      setJoined(false);
      setRoomId('');
      setMeColor('w');
      reset();
      setEnded(null);
      setToast(ok ? 'Đã rời phòng' : 'Rời phòng thất bại');
    };
    if (hasTimeout) {
      (s as any).timeout(1500).emit('leaveRoom', { roomId }, (err: any, res: any) => {
        if (err) return done(false);
        done(!!res?.ok);
      });
    } else {
      s.emit('leaveRoom', { roomId }, (res: any) => done(!!res?.ok));
    }
  };

  // UI helpers: confirm before destructive actions
  const confirmReset = () => {
    if (window.confirm('Bạn có chắc muốn Reset bàn cờ?')) { reset(); setEnded(null); }
  };

  const confirmLeave = () => {
    if (!canLeave) return;
    if (window.confirm('Rời phòng hiện tại?')) leaveRoom();
  };

  // Tự động khôi phục roomId từ localStorage và re-join sau khi reload
  useEffect(() => {
    try {
      const saved = localStorage.getItem('roomId');
      if (saved && !roomId) setRoomId(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connected) return;
    if (!joined && roomId) {
      joinRoom();
      // sau khi join, đồng bộ lịch sử để khớp bàn cờ
      setTimeout(() => handleResync(), 300);
    }
  }, [connected, roomId, joined]);

  if (status === 'loading') {
    return (
      <div className="p-6 rounded-lg bg-[#141820] border border-[#222838] text-center">
        <div className="text-lg">Đang kiểm tra trạng thái đăng nhập…</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-6 rounded-lg bg-[#141820] border border-[#222838] max-w-md mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">Phòng Online</h2>
        <p className="text-sm text-gray-300 mb-4">Bạn cần đăng nhập để vào phòng đấu online.</p>
        <button className="px-4 py-2 rounded bg-accent text-black font-semibold" onClick={()=>signIn('google', { callbackUrl: '/online?login=success' })}>
          Đăng nhập với Google
        </button>
        <div className="mt-2 text-xs text-gray-400">Hoặc vào trang <a className="underline" href="/auth">Đăng nhập</a></div>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="p-4 rounded-lg bg-[#141820] border border-[#222838]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Phòng Online</h2>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs ${connected ? 'bg-green-700/30 text-green-300' : 'bg-red-700/30 text-red-300'}`}>{connected ? 'Kết nối' : 'Mất kết nối'}</span>
            <span className="px-2 py-1 rounded text-xs bg-[#1f2633] text-gray-300">Phòng: {roomId || 'Chưa ở phòng'}</span>
            <span className="px-2 py-1 rounded text-xs bg-[#1f2633] text-gray-300">Bạn: {(session as any)?.username || session?.user?.name || 'Khách'}</span>
            <span className="px-2 py-1 rounded text-xs bg-[#1f2633] text-gray-300">Màu: {meColor === 'w' ? 'Trắng' : 'Đen'}</span>
            <span className={`px-2 py-1 rounded text-xs ${turn === 'w' ? 'bg-blue-700/30 text-blue-300' : 'bg-amber-700/30 text-amber-300'}`}>Lượt: {turn === 'w' ? 'Trắng' : 'Đen'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded bg-accent text-black" onClick={createRoom} title="Tạo phòng mới">Tạo phòng</button>
            <input className="px-3 py-2 rounded bg-[#1f2633] flex-1" placeholder="Nhập mã phòng" value={roomId} onChange={(e)=>setRoomId(e.target.value)} />
            <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a] disabled:opacity-60" onClick={joinRoom} disabled={!canJoin} title={canJoin ? 'Tham gia phòng' : 'Nhập mã phòng hoặc đã ở phòng'}>Tham gia</button>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={handleResync} title="Đồng bộ lại trạng thái ván">Đồng bộ</button>
            <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={confirmReset} title="Reset bàn cờ">Reset</button>
            <button className="px-3 py-2 rounded bg-[#3a1f1f] hover:bg-[#402525] disabled:opacity-60" onClick={confirmLeave} disabled={!canLeave} title={canLeave ? 'Rời phòng hiện tại' : 'Chưa ở phòng'}>Rời phòng</button>
          </div>
        </div>

        {ended && (
          <div className="mb-2 px-3 py-2 rounded bg-[#1f2633] text-sm">
            {ended.result === 'checkmate' ? (
              <span>Chiếu hết! {(ended.winner === 'w') ? 'Trắng' : 'Đen'} thắng.</span>
            ) : (
              <span>
                Ván hoà{(() => { switch (ended?.reason) {
                  case 'stalemate': return ' (thế bí)';
                  case 'threefold': return ' (ba lần lặp)';
                  case 'insufficient-material': return ' (thiếu quân)';
                  case 'fifty-move': return ' (50 nước)';
                  default: return '';
                }})()}
              </span>
            )}
          </div>
        )}
        <ChessBoard size={520} perspective={meColor} onMove={handleMove} allowMoves={joined && turn === meColor && !ended} deferLocal={true} />
      </div>
      <Chat roomId={roomId} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}