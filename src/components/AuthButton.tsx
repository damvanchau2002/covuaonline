"use client";
import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButton() {
  const { data: session } = useSession();
  const username = (session as any)?.username || session?.user?.name;
  return (
    <div className="flex items-center gap-3 text-sm">
      {session ? (
        <>
          <span className="text-gray-300">Xin chào, {username}</span>
          <button className="px-3 py-1 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={()=>signOut()}>Đăng xuất</button>
        </>
      ) : (
        <button className="px-3 py-1 rounded bg-accent text-black" onClick={()=>signIn()}>Đăng nhập</button>
      )}
    </div>
  );
}