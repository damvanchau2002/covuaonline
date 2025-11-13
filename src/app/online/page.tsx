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

  useEffect(() => {
    const s = getSocket();
    // Identify with username from session
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    s.emit('identify', { username });
    const onMove = (payload: { from:string; to:string }) => {
      move(payload.from, payload.to);
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
    return () => { s.off('move', onMove); s.off('sync', onSync); };
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
    const s = getSocket();
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    if (!s.connected) {
      setToast('Không kết nối được server phòng. Kiểm tra backend: http://localhost:4000');
      return;
    }
    // Use ack with timeout to avoid hanging when server not responding
    (s as any).timeout?.(3000).emit('createRoom', { username }, (err: any, rid: string) => {
      if (err) {
        setToast('Tạo phòng thất bại (hết thời gian hoặc server không phản hồi)');
        return;
      }
      if (typeof rid === 'string' && rid.length > 0) {
        setRoomId(rid);
        setJoined(true);
        setMeColor('w');
      } else {
        setToast('Server không trả mã phòng');
      }
    });
  };

  const joinRoom = () => {
    if (!roomId) return;
    const s = getSocket();
    const username = (session as any)?.username || session?.user?.name || 'Khách';
    if (!s.connected) { setToast('Không kết nối được server phòng'); return; }
    (s as any).timeout?.(3000).emit('joinRoom', { roomId, username }, (err: any, ok: boolean) => {
      if (err) { setToast('Tham gia phòng thất bại'); return; }
      setJoined(ok);
      setMeColor('b');
      if (!ok) setToast('Mã phòng không tồn tại');
    });
  };

  const handleMove = (from: string, to: string) => {
    if (turn !== meColor) { setToast('Chưa đến lượt bạn'); return; }
    const ok = move(from, to);
    if (!ok) return;
    playMoveSound();
    const s = getSocket();
    s.emit('move', { roomId, from, to });
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
        </div>
        <div className="text-sm text-gray-300 mb-2">Phòng: {roomId || 'chưa tạo/tham gia'} | Người dùng: {(session as any)?.username || session?.user?.name} | Bạn: {meColor === 'w' ? 'Trắng' : 'Đen'} | Lượt: {turn === 'w' ? 'Trắng' : 'Đen'}</div>
        <ChessBoard size={520} perspective={meColor} onMove={handleMove} allowMoves={joined && turn === meColor} />
      </div>
      <Chat roomId={roomId} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}