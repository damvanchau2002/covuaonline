"use client";
import ChessBoard from "@/components/ChessBoard";
import { useGameStore } from "@/store/gameStore";
import { useEffect, useState } from "react";
import { getBestMove } from "@/lib/stockfish";
import { playMoveSound, playMateSound, speak, startAmbientMusic, stopAmbientMusic, setAmbientVolume, isAmbientPlaying, startTrackMusic, stopTrackMusic, setTrackVolume, isTrackPlaying } from "@/lib/sound";
import Fireworks from "@/components/Fireworks";

export default function PlayPage() {
  const { chess, moves, reset, move, turn } = useGameStore();
  const [vsAI, setVsAI] = useState(true);
  const [skill, setSkill] = useState(20);
  const [counting, setCounting] = useState(true);
  const [countText, setCountText] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [checkText, setCheckText] = useState<string | null>(null);
  const [winText, setWinText] = useState<string | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);
  const [ambientOn, setAmbientOn] = useState(true);
  const [ambientVol, setAmbientVol] = useState(0.03);
  const [musicMode, setMusicMode] = useState<'synth' | 'track'>('track');

  const announceCheck = () => {
    setCheckText('Chiếu tướng!');
    speak('Chiếu tướng', 1.0);
    // playCheckSound(); // nếu muốn thêm hiệu ứng âm thanh
    setTimeout(() => setCheckText(null), 1200);
  };

  const handleWin = () => {
    setWinText('YOU WIN');
    setShowFireworks(true);
    speak('You win', 1.0, 'en-US');
    setTimeout(() => {
      setShowFireworks(false);
      setWinText(null);
      reset();
      startCountdown();
    }, 2600);
  };

  const startCountdown = async () => {
    setCounting(true);
    const seq = ['3','2','1','Go'];
    for (let i=0;i<seq.length;i++) {
      const t = seq[i];
      setCountText(t);
      speak(t, 1.0);
      await new Promise(res => setTimeout(res, i < seq.length-1 ? 800 : 600));
    }
    setCountText(null);
    setCounting(false);
  };

  useEffect(() => { startCountdown(); }, []);

  const handlePlayerMove = async (from: string, to: string) => {
    if (counting) return; // block moves during countdown
    // ensure ambient starts after a user gesture
    if (ambientOn) {
      if (musicMode === 'track') {
        if (!isTrackPlaying()) startTrackMusic('/music/thien-ly-oi.mp3', Math.max(0, Math.min(ambientVol/0.12, 1)));
      } else {
        if (!isAmbientPlaying()) startAmbientMusic(ambientVol);
      }
    }
    // ChessBoard đã thực hiện nước đi thành công trước khi gọi callback này.
    playMoveSound();
    if (vsAI && !chess.isGameOver()) {
      // Người chơi thắng ngay sau nước đi
      if (chess.isCheckmate() && chess.turn() === 'b') {
        handleWin();
        return;
      }
      // Let AI respond
      const movetime = 2000;
      setAiThinking(true);
      const [best] = await Promise.all([
        getBestMove(chess.pgn(), { skillLevel: skill, movetime }),
        new Promise((res) => setTimeout(res, movetime))
      ]);
      setAiThinking(false);
      // Sau nước của người chơi, nếu tạo check thì báo
      try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
      if (best && best.length >= 4) {
        const aiFrom = best.slice(0,2);
        const aiTo = best.slice(2,4);
        const promo = best.length >= 5 ? best[4] as 'q' | 'r' | 'b' | 'n' : undefined;
        move(aiFrom, aiTo, promo);
        playMoveSound();
        try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
      }
    }
    if (chess.isCheckmate()) playMateSound();
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="p-4 rounded-lg bg-[#141820] border border-[#222838]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Offline mode</h2>
          <button className="text-sm px-3 py-1 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={() => { reset(); startCountdown(); }}>Reset</button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={vsAI} onChange={(e)=>setVsAI(e.target.checked)} />
            Đấu với Máy (AI)
          </label>
          {vsAI && (
            <div className="flex items-center gap-2">
              <span className="text-sm">Độ khó: Khó nhất</span>
              <input type="range" min={0} max={20} value={20} disabled />
              <span className="text-sm">20</span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ambientOn} onChange={(e)=>{
                const on = e.target.checked; setAmbientOn(on);
                if (on) {
                  if (musicMode === 'track') startTrackMusic('/music/thien-ly-oi.mp3', Math.max(0, Math.min(ambientVol/0.12, 1)));
                  else startAmbientMusic(ambientVol);
                } else { stopAmbientMusic(); stopTrackMusic(); }
              }} />
              Nhạc nền
            </label>
            {ambientOn && (
              <>
                <span className="text-sm">Âm lượng</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((ambientVol / 0.12) * 100)}
                  onChange={(e)=>{
                    const val = Number(e.target.value); // 0-100
                    const vol = (val / 100) * 0.12; // linear mapping to 0..0.12
                    setAmbientVol(vol);
                    if (musicMode === 'track') setTrackVolume(Math.max(0, Math.min(vol/0.12, 1))); else setAmbientVolume(vol);
                  }}
                  onInput={(e)=>{
                    const val = Number((e.target as HTMLInputElement).value);
                    const vol = (val / 100) * 0.12;
                    setAmbientVol(vol);
                    if (musicMode === 'track') setTrackVolume(Math.max(0, Math.min(vol/0.12, 1))); else setAmbientVolume(vol);
                  }}
                />
                <div className="flex items-center gap-2">
                  <span className="text-sm">Nguồn</span>
                  <select className="px-2 py-1 rounded bg-[#1f2633]" value={musicMode} onChange={(e)=>{
                    const m = e.target.value as 'synth'|'track';
                    setMusicMode(m);
                    if (!ambientOn) return;
                    if (m === 'track') { stopAmbientMusic(); startTrackMusic('/music/thien-ly-oi.mp3', Math.max(0, Math.min(ambientVol/0.12, 1))); }
                    else { stopTrackMusic(); startAmbientMusic(ambientVol); }
                  }}>
                    <option value="synth">Synth</option>
                    <option value="track">MP3: Thiên Lý Ơi</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={`relative ${showFireworks ? 'shake-heavy' : ''}`}>
          <ChessBoard size={520} perspective={'w'} onMove={handlePlayerMove} allowMoves={!counting} />
          {counting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-6xl font-extrabold text-white drop-shadow-md">
                {countText}
              </div>
            </div>
          )}
          {!counting && aiThinking && (
            <div className="absolute top-3 right-3 px-3 py-1 rounded bg-[#1f2633] text-sm text-gray-200 shadow">
              AI đang suy nghĩ…
            </div>
          )}
          {!counting && checkText && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="check-banner rumble px-4 py-2 rounded bg-accent text-black text-2xl font-bold shadow">
                {checkText}
              </div>
            </div>
          )}
          {showFireworks && (
            <div className="absolute inset-0">
              <Fireworks durationMs={2200} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="win-banner px-5 py-3 rounded bg-white/90 text-black text-4xl font-extrabold shadow-lg">
                  {winText}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 text-sm text-gray-300">Lượt: {turn === 'w' ? 'Trắng' : 'Đen'}</div>
        {chess.isGameOver() && (
          <div className="mt-2 p-2 rounded bg-[#1b202a] border border-[#222838]">
            Trận đấu kết thúc.
          </div>
        )}
      </div>

      <div className="p-4 rounded-lg bg-[#141820] border border-[#222838]">
        <h3 className="text-lg font-semibold mb-2">Lịch sử & Replay</h3>
        <ol className="list-decimal list-inside text-sm max-h-96 overflow-auto">
          {moves.map((m, i) => (
            <li key={`${m.from}${m.to}${i}`}>{i+1}. {m.san} ({m.from}→{m.to})</li>
          ))}
        </ol>
      </div>
    </div>
  );
}