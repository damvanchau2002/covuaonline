"use client";
import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

export default function Chat({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<{user:string;text:string;ts:number}[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    const s = getSocket();
    const handler = (payload: any) => {
      setMessages((prev) => [...prev, payload]);
    };
    s.on('chat', handler);
    return () => { s.off('chat', handler); };
  }, []);

  const send = () => {
    if (!text.trim()) return;
    const s = getSocket();
    s.emit('chat', { roomId, text });
    setText("");
  };

  return (
    <div className="flex flex-col border border-[#222838] rounded-lg overflow-hidden">
      <div className="p-3 bg-[#1b202a] text-sm border-b border-[#222838]">Chat phòng</div>
      <div className="p-3 h-64 overflow-auto text-sm space-y-2">
        {messages.map((m, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="text-accent font-semibold">{m.user}</span>
            <span className="text-gray-300">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="p-3 flex gap-2 bg-[#161a22]">
        <input className="flex-1 px-3 py-2 rounded bg-[#1f2633] outline-none" placeholder="Nhập tin nhắn..." value={text} onChange={(e)=>setText(e.target.value)} />
        <button className="px-4 py-2 rounded bg-accent text-black font-semibold" onClick={send}>Gửi</button>
      </div>
    </div>
  );
}