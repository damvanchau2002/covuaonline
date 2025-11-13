"use client";
import { useEffect, useState } from "react";

type Entry = { username: string; elo: number; wins: number; losses: number };

export default function LeaderboardPage() {
  const [board, setBoard] = useState<Entry[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    fetch(`${url}/api/leaderboard`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then(setBoard)
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('Leaderboard fetch failed', err);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="p-6 rounded-lg bg-[#141820] border border-[#222838]">
      <h1 className="text-2xl font-semibold mb-3">Bảng Xếp Hạng Elo</h1>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-[#222838]">
              <th className="py-2">#</th>
              <th className="py-2">Người chơi</th>
              <th className="py-2">Elo</th>
              <th className="py-2">Thắng</th>
              <th className="py-2">Thua</th>
            </tr>
          </thead>
          <tbody>
            {board.map((e, i) => (
              <tr key={e.username} className="border-b border-[#222838]">
                <td className="py-2">{i+1}</td>
                <td className="py-2">{e.username}</td>
                <td className="py-2">{e.elo}</td>
                <td className="py-2">{e.wins}</td>
                <td className="py-2">{e.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}