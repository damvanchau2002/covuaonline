import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers';
import AuthButton from '@/components/AuthButton';

export const metadata: Metadata = {
  title: 'Cờ Vua - Nền tảng chơi cờ vua đỉnh cao',
  description: 'Nền tảng chơi cờ vua đỉnh cao: offline, online, AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-[#0f1216] text-[#eaeef3]">
        <Providers>
          <div className="max-w-6xl mx-auto px-4 py-6">
            <header className="flex items-center justify-between mb-6">
              <div className="font-bold tracking-wide text-xl">♟️ Cờ Vua</div>
              <nav className="flex gap-4 text-sm items-center">
                <a className="hover:text-accent" href="/">Trang chủ</a>
                <a className="hover:text-accent" href="/play">Chơi ngay</a>
                <a className="hover:text-accent" href="/online">Phòng Online</a>
                <a className="hover:text-accent" href="/ai">Đấu với Máy</a>
                <a className="hover:text-accent" href="/guide">Hướng dẫn</a>
                <a className="hover:text-accent" href="/leaderboard">Bảng Xếp Hạng</a>
                <span className="ml-4"><AuthButton /></span>
              </nav>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}