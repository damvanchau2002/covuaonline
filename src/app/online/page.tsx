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
    return () => { s.off('move', onMove); s.off('sync', onSync); s.off('yourColor', onYourColor); s.off('connect', onConnect); s.off('disconnect', onDisconnect); };
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
        setJoined(true);
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
      const color = (res && typeof res === 'object') ? res.color : 'b';
      setMeColor(color === 'w' ? 'w' : 'b');
      // Confirm color from server to avoid mismatch
      emitWithAck<any>('myColor', { roomId }, (e, r) => {
        if (!e && r && (r as any).color) setMeColor((r as any).color);
      });
      if (!ok) setToast('Mã phòng không tồn tại');
    });
  };

  const handleMove = (from: string, to: string) => {
    if (turn !== meColor) { setToast('Chưa đến lượt bạn'); return; }
    emitWithAck<any>('move', { roomId, from, to }, (err) => {
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
        <div className="flex items-center gap-2 mb-3">
          <button className="px-3 py-2 rounded bg-accent text-black" onClick={createRoom}>Tạo phòng</button>
          <input className="px-3 py-2 rounded bg-[#1f2633] flex-1" placeholder="Nhập mã phòng" value={roomId} onChange={(e)=>setRoomId(e.target.value)} />
          <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={joinRoom}>Tham gia</button>
          <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={reset}>Reset</button>
          <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={handleResync}>Đồng bộ lại</button>
        </div>
        <div className="text-sm text-gray-300 mb-2">Trạng thái: <span className={connected ? 'text-green-400' : 'text-red-400'}>{connected ? 'Kết nối' : 'Mất kết nối'}</span> | Phòng: {roomId || 'chưa tạo/tham gia'} | Người dùng: {(session as any)?.username || session?.user?.name} | Bạn: {meColor === 'w' ? 'Trắng' : 'Đen'} | Lượt: {turn === 'w' ? 'Trắng' : 'Đen'}</div>
        <ChessBoard size={520} perspective={meColor} onMove={handleMove} allowMoves={joined && turn === meColor} deferLocal={true} />
      </div>
      <Chat roomId={roomId} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}