"use client";
import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      // Nếu đã đăng nhập, đưa về Trang chủ
      router.replace("/");
    }
  }, [session, router]);

  return (
    <div className="p-6 rounded-lg bg-[#141820] border border-[#222838] max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Đăng nhập</h1>
      <p className="text-sm text-gray-300 mb-4">Chọn provider để tiếp tục:</p>
      <div className="grid gap-3">
        <button className="px-4 py-3 rounded bg-accent text-black font-semibold" onClick={()=>signIn('google', { callbackUrl: '/?login=success' })}>Đăng nhập với Google</button>
        <button className="px-4 py-3 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={()=>signIn('github', { callbackUrl: '/?login=success' })}>Đăng nhập với GitHub</button>
      </div>
    </div>
  );
}