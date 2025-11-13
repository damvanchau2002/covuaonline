"use client";
import ChessBoard from "@/components/ChessBoard";
import { useGameStore } from "@/store/gameStore";
import { useEffect, useState } from "react";
import { getBestMove, analyzePosition, type AnalysisLine } from "@/lib/stockfish";
import { Chess } from "chess.js";
import { playMoveSound, playMateSound, speak, startAmbientMusic, stopAmbientMusic, setAmbientVolume, isAmbientPlaying, startTrackMusic, stopTrackMusic, setTrackVolume, isTrackPlaying } from "@/lib/sound";
import Fireworks from "@/components/Fireworks";

export default function AIPage() {
  const { chess, move, reset, turn, loadPGN } = useGameStore();
  const [skill, setSkill] = useState(20);
  const [counting, setCounting] = useState(true);
  const [countText, setCountText] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [checkText, setCheckText] = useState<string | null>(null);
  const [winText, setWinText] = useState<string | null>(null);
  const [drawText, setDrawText] = useState<string | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);
  const [ambientOn, setAmbientOn] = useState(true);
  const [ambientVol, setAmbientVol] = useState(0.03);
  const [musicMode, setMusicMode] = useState<'synth' | 'track'>('track');
  const [searchDepth, setSearchDepth] = useState<number>(22);
  const [analysis, setAnalysis] = useState<AnalysisLine[]>([]);
  const [preReplies, setPreReplies] = useState<Record<string, string>>({});
  const [predicting, setPredicting] = useState(false);

  const announceCheck = () => {
    setCheckText('Chiếu tướng!');
    speak('Chiếu tướng', 1.0);
    // Optional beep for check
    // playCheckSound();
    setTimeout(() => setCheckText(null), 1200);
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

  // Quick mate demo to verify logic: loads a known checkmate PGN where it's Black to move and checkmated
  const loadMateDemo = () => {
    const pgn = "1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7#";
    try {
      loadPGN(pgn);
      // After loading, if it's black's turn and checkmated, trigger win
      if (chess.isCheckmate() && chess.turn() === 'b') {
        handleWin();
      } else {
        speak('Thế này chưa phải chiếu hết', 1.0);
      }
    } catch {}
  };

  const handleDraw = () => {
    setDrawText('HOÀ!');
    speak('Ván hoà', 1.0, 'vi-VN');
    setTimeout(() => {
      setDrawText(null);
      reset();
      startCountdown();
    }, 2000);
  };

  const onMove = async (from: string, to: string) => {
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
    // Chỉ cần phát âm thanh và để AI phản hồi.
    playMoveSound();
    // Nếu đã tính sẵn phản đòn cho nước vừa đi của người chơi, dùng ngay để phản hồi nhanh
    const humanUciKey = `${from}${to}`;
    const predictedReply = preReplies[humanUciKey];
    if (predictedReply) {
      const aiFrom = predictedReply.slice(0,2);
      const aiTo = predictedReply.slice(2,4);
      const promo = predictedReply.length >= 5 ? predictedReply[4] as 'q'|'r'|'b'|'n' : undefined;
      move(aiFrom, aiTo, promo);
      playMoveSound();
      try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
      setPreReplies({}); // Xoá cache phản đòn sau khi dùng
      return;
    }
    // Nếu sau nước đi của người chơi ván đã kết thúc (chiếu hết hoặc hết nước đi), xử lý thắng ngay
    if (chess.isGameOver()) {
      handleWin();
      return;
    }
    if (!chess.isGameOver()) {
      // Nếu người chơi vừa chiếu hết cờ đối phương
      if (chess.isCheckmate() && chess.turn() === 'b') {
        handleWin();
        return;
      }
      // If player just created check, announce it
      try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}

      const depth = 22; // cố định độ sâu để tăng độ khó
      setAiThinking(true);
      const best = await getBestMove(chess.pgn(), { skillLevel: 20, depth });
      analyzePosition(chess.pgn(), { skillLevel: 20, depth, multiPV: 3 }).then(r => setAnalysis(r.lines)).catch(()=>setAnalysis([]));
      // giữ overlay "đang suy nghĩ" tối thiểu 600ms cho trải nghiệm
      await new Promise((res) => setTimeout(res, 600));
      setAiThinking(false);
      if (best) {
        const aiFrom = best.slice(0,2);
        const aiTo = best.slice(2,4);
        const promo = best.length >= 5 ? best[4] as 'q' | 'r' | 'b' | 'n' : undefined;
        move(aiFrom, aiTo, promo);
        playMoveSound();
        try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
      } else {
        // Engine không trả về nước: theo yêu cầu, nếu không còn nước thì AI thua
        if (chess.isGameOver()) { handleWin(); return; }
        const legal = chess.moves({ verbose: true }) as any[];
        if (legal.length > 0) {
          const pick = legal[Math.floor(Math.random() * legal.length)];
          move(pick.from, pick.to, pick.promotion);
          playMoveSound();
          try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
        } else { handleWin(); return; }
      }
    }
    if (chess.isCheckmate()) playMateSound();
  };

  // Respond automatically when it's AI's turn (in case callback was missed)
  useEffect(() => {
    const run = async () => {
      if (counting) return;
      if (aiThinking) return;
      // Nếu tới lượt AI và ván đã kết thúc, tuyên bố thắng ngay
      if (chess.isGameOver()) { handleWin(); return; }
      if (turn !== 'b') return; // only auto-respond on black (AI) turn
      if (ambientOn) {
        if (musicMode === 'track') {
          if (!isTrackPlaying()) startTrackMusic('/music/thien-ly-oi.mp3', Math.max(0, Math.min(ambientVol/0.12, 1)));
        } else {
          if (!isAmbientPlaying()) startAmbientMusic(ambientVol);
        }
      }
      const depth = searchDepth;
      setAiThinking(true);
      const best = await getBestMove(chess.pgn(), { skillLevel: 20, depth });
      analyzePosition(chess.pgn(), { skillLevel: 20, depth, multiPV: 3 }).then(r => setAnalysis(r.lines)).catch(()=>setAnalysis([]));
      await new Promise((res) => setTimeout(res, 600));
      setAiThinking(false);
      if (!best) {
        if (chess.isGameOver()) { handleWin(); return; }
        const legal = chess.moves({ verbose: true }) as any[];
        if (legal.length > 0) {
          const pick = legal[Math.floor(Math.random() * legal.length)];
          move(pick.from, pick.to, pick.promotion);
          playMoveSound();
          try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
          return; // tránh sử dụng 'best' sau khi đã fallback
        } else { handleWin(); return; }
      }
      const aiFrom = best.slice(0,2);
      const aiTo = best.slice(2,4);
      const promo = best.length >= 5 ? best[4] as 'q' | 'r' | 'b' | 'n' : undefined;
      move(aiFrom, aiTo, promo);
      playMoveSound();
      try { if ((chess as any).inCheck?.()) announceCheck(); } catch {}
      if (chess.isCheckmate()) playMateSound();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, counting]);

  // Ponder: khi tới lượt người chơi (Trắng), dự đoán vài nước hay nhất và tính sẵn phản đòn của AI
  useEffect(() => {
    const ponder = async () => {
      if (counting) return;
      if (turn !== 'w') { setPreReplies({}); return; }
      try {
        setPredicting(true);
        const currentPgn = (chess as any).pgn?.() ?? '';
        const legal = (chess.moves({ verbose: true }) as any[]);
        if (!legal?.length) { setPredicting(false); return; }
        // Heuristic chấm điểm nước của người chơi để chọn topK
        const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
        const scoreMove = (m: any) => {
          let s = 0;
          if (m.san?.includes('#')) s += 1000;
          if (m.san?.includes('+')) s += 100;
          if (m.captured) s += values[m.captured] ?? 1;
          if (m.promotion) s += values[m.promotion] ?? 9;
          if (/^[de][34]$/.test(m.to)) s += 0.5;
          return s;
        };
        const topK = legal.sort((a,b)=>scoreMove(b)-scoreMove(a)).slice(0, Math.min(5, legal.length));
        const depthReply = Math.max(16, (searchDepth ?? 22) - 2);
        const map: Record<string, string> = {};
        await Promise.all(topK.map(async (m: any) => {
          const t = new Chess();
          if (currentPgn) t.loadPgn(currentPgn);
          t.move({ from: m.from, to: m.to, promotion: m.promotion });
          const reply = await getBestMove(t.pgn(), { skillLevel: 20, depth: depthReply });
          if (reply) map[`${m.from}${m.to}`] = reply;
        }));
        setPreReplies(map);
      } catch {
        setPreReplies({});
      } finally {
        setPredicting(false);
      }
    };
    ponder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, counting, searchDepth]);

  // Start countdown on mount
  useEffect(() => {
    startCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 rounded-lg bg-[#141820] border border-[#222838]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Đấu với Máy (Stockfish)</h2>
        <div className="flex items-center gap-2">
          <button className="text-sm px-3 py-1 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={() => { reset(); startCountdown(); }}>Reset</button>
          <button className="text-sm px-3 py-1 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={loadMateDemo}>Mate Test</button>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm">Độ khó: Khó nhất</span>
        <input type="range" min={0} max={20} value={20} disabled />
        <div className="flex items-center gap-2 ml-6">
          <span className="text-sm">Độ sâu</span>
          <input type="range" min={16} max={26} step={1} value={searchDepth} onChange={(e)=>setSearchDepth(Number(e.target.value))} />
          <span className="text-sm">{searchDepth}</span>
        </div>
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
        <ChessBoard size={560} perspective={'w'} onMove={onMove} allowMoves={!counting} />
        {predicting && (
          <div className="absolute top-3 left-3 px-3 py-1 rounded bg-[#1f2633] text-xs text-gray-200 shadow">
            Đang dự đoán phản đòn…
          </div>
        )}
        {!!analysis.length && (
          <div className="absolute top-3 left-3 px-3 py-2 rounded bg-[#1f2633]/90 text-sm text-gray-200 shadow">
            <div className="font-semibold mb-1">Phân tích AI</div>
            {analysis.slice(0,3).map((ln, i)=> (
              <div key={i} className="flex items-center gap-2">
                <span>#{i+1}</span>
                <span>{ln.moveUci}</span>
                <span>• depth {ln.depth}</span>
                {ln.scoreMate !== undefined ? (
                  <span>• mate {ln.scoreMate}</span>
                ) : (
                  <span>• eval {((ln.scoreCp??0)/100).toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        )}
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
        {!counting && drawText && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="win-banner px-5 py-3 rounded bg-white/90 text-black text-3xl font-extrabold shadow-lg">
              {drawText}
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
    </div>
  );
}