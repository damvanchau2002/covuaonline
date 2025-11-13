"use client";
import { useEffect, useState, useRef } from "react";
import { getSocket } from "@/lib/socket";

export default function Chat({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<{user?:string;text:string;gif?:string;ts:number;system?:boolean}[]>([]);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<string[]>([]);
  const canSend = !!roomId;
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const s = getSocket();
    const onChat = (payload: any) => { setMessages((prev) => [...prev, payload]); };
    const onSystem = (payload: any) => {
      const msg = { text: String(payload?.text ?? ''), ts: Number(payload?.ts ?? Date.now()), system: true };
      setMessages((prev) => [...prev, msg]);
    };
    s.on('chat', onChat);
    s.on('system', onSystem);
    return () => { s.off('chat', onChat); s.off('system', onSystem); };
  }, []);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    else if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    if (!roomId) {
      // thông báo hệ thống nếu chưa ở phòng
      setMessages((prev) => [...prev, { text: 'Bạn chưa ở trong phòng. Hãy tạo hoặc nhập mã phòng để chat.', ts: Date.now(), system: true }]);
      return;
    }
    const s = getSocket();
    s.emit('chat', { roomId, text });
    setText("");
  };

  const emojis = ['😀','😆','😅','😂','😊','😍','😘','😎','😢','😡','😱','👍','👋','🙏','🔥','💯','🎉','❤️','✨','🤝'];
  const addEmoji = (e: string) => setText((t) => t + e);

  async function searchGifs() {
    const key = process.env.NEXT_PUBLIC_TENOR_KEY || 'LIVDSRZULELA';
    const url = `https://g.tenor.com/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(gifQuery || 'chess')}&limit=12`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const items: string[] = (data?.results || []).map((r: any) => {
        const m = r?.media?.[0];
        // Only accept direct image URLs from media formats
        return m?.tinygif?.url || m?.gif?.url || m?.nanogif?.url || m?.mediumgif?.url || m?.loopedmp4?.url;
      }).filter((u: string) => typeof u === 'string' && /^https?:\/\//.test(u));
      setGifResults(items);
    } catch (e) {
      setGifResults([]);
    }
  }

  const sendGif = (gifUrl: string) => {
    if (!roomId) {
      setMessages((prev) => [...prev, { text: 'Bạn chưa ở trong phòng. Hãy tạo hoặc nhập mã phòng để gửi GIF.', ts: Date.now(), system: true }]);
      return;
    }
    const s = getSocket();
    s.emit('chat', { roomId, text: '', gif: gifUrl });
    setShowGif(false);
  };

  return (
    <div className="flex flex-col border border-[#222838] rounded-lg overflow-hidden">
      <div className="p-3 bg-[#1b202a] text-sm border-b border-[#222838]">Chat phòng</div>
      <div ref={listRef} className="p-3 h-64 overflow-auto text-sm space-y-2">
        {messages.map((m, i) => (
          m.system ? (
            <div key={i} className="text-gray-400 italic">{m.text}</div>
          ) : (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-accent font-semibold">{m.user}</span>
              {m.gif ? (
                <img src={m.gif} alt="gif" className="max-h-36 rounded" />
              ) : (
                <span className="text-gray-300">{m.text}</span>
              )}
            </div>
          )
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-3 flex gap-2 bg-[#161a22]">
        <button
          className="px-2 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]"
          onClick={()=>setShowEmoji((v)=>!v)}
          title="Emoji"
        >😊</button>
        <button
          className="px-2 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]"
          onClick={()=>{ setShowGif(true); if (!gifResults.length) searchGifs(); }}
          title="GIF"
        >GIF</button>
        <input
          className="flex-1 px-3 py-2 rounded bg-[#1f2633] outline-none disabled:opacity-60"
          placeholder={canSend ? "Nhập tin nhắn..." : "Hãy tạo/tham gia phòng để chat"}
          value={text}
          onChange={(e)=>setText(e.target.value)}
          disabled={!canSend}
        />
        <button
          className="px-4 py-2 rounded bg-accent text-black font-semibold disabled:opacity-60"
          onClick={send}
          disabled={!canSend}
          title={canSend ? "Gửi" : "Chưa ở trong phòng"}
        >Gửi</button>
      </div>
      {showEmoji && (
        <div className="p-2 border-t border-[#222838] bg-[#141820] grid grid-cols-10 gap-1 text-xl">
          {emojis.map((e)=> (
            <button key={e} className="hover:opacity-80" onClick={()=>addEmoji(e)}>{e}</button>
          ))}
        </div>
      )}
      {showGif && (
        <div className="p-3 border-t border-[#222838] bg-[#141820] space-y-2">
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 rounded bg-[#1f2633]" placeholder="Tìm GIF (ví dụ: chess, funny)" value={gifQuery} onChange={(e)=>setGifQuery(e.target.value)} />
            <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={searchGifs}>Tìm</button>
            <button className="px-3 py-2 rounded bg-[#1f2633] hover:bg-[#232b3a]" onClick={()=>setShowGif(false)}>Đóng</button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {gifResults.map((u, idx)=> (
              <button key={`${u}-${idx}`} className="bg-[#0f131a] rounded overflow-hidden hover:opacity-80" onClick={()=>sendGif(u)}>
                <img src={u} alt="gif" className="w-full h-28 object-cover" />
              </button>
            ))}
            {!gifResults.length && <div className="text-gray-400 text-sm">Không tìm thấy GIF</div>}
          </div>
        </div>
      )}
    </div>
  );
}