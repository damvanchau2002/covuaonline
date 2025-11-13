"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function HomePage() {
  const params = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const login = params.get('login');
    if (login === 'success') {
      setToast('Đăng nhập thành công!');
      setTimeout(() => {
        setToast(null);
        // clean the query param
        router.replace('/');
      }, 2000);
    }
  }, [params, router]);

  return (
    <main className="grid md:grid-cols-2 gap-6">
      <section className="p-6 rounded-lg bg-[#141820] border border-[#222838]">
        <h2 className="text-2xl font-semibold mb-2">Bắt đầu chơi</h2>
        <p className="text-sm text-gray-300 mb-4">Chế độ chơi đa dạng, mượt và hiện đại.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a href="/play" className="px-4 py-3 rounded bg-accent text-black font-semibold text-center">Chơi ngay</a>
          <a href="/online" className="px-4 py-3 rounded bg-[#1f2633] hover:bg-[#232b3a] text-center">Phòng Online</a>
          <a href="/ai" className="px-4 py-3 rounded bg-[#1f2633] hover:bg-[#232b3a] text-center">Đấu với Máy</a>
          <a href="/guide" className="px-4 py-3 rounded bg-[#1f2633] hover:bg-[#232b3a] text-center">Hướng dẫn</a>
        </div>
      </section>

      <section className="p-6 rounded-lg bg-[#141820] border border-[#222838]">
        <h2 className="text-2xl font-semibold mb-2">Xếp hạng & cộng đồng</h2>
        <p className="text-sm text-gray-300 mb-4">Theo dõi Elo, lịch sử, thống kê và chat realtime.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a href="/leaderboard" className="px-4 py-3 rounded bg-[#1f2633] hover:bg-[#232b3a] text-center">Bảng Xếp Hạng</a>
          <a href="/online" className="px-4 py-3 rounded bg-[#1f2633] hover:bg-[#232b3a] text-center">Phòng công khai</a>
        </div>
      </section>
      {toast && (
        <div className="toast">{toast}</div>
      )}
    </main>
  );
}