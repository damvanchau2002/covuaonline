type Color = 'w' | 'b';
type Player = { id: string; user: string; color: Color };
type Move = { from: string; to: string; san?: string; color?: Color; ts?: number };
type RoomSummary = {
  id: string;
  players: Player[];
  createdAt: number;
  historyCount: number;
  turn: Color;
  fen: string;
  pgn?: string;
  recentMoves?: string[];
};
type RoomsResponse = { ok: boolean; rooms: RoomSummary[] };
type RoomDetail = {
  ok: boolean;
  id: string;
  players: Player[];
  createdAt: number;
  history: Move[];
  turn: Color;
  fen: string;
  pgn?: string;
};

async function fetchJSON<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...opts, headers: { 'content-type': 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json() as Promise<T>;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function renderRooms(data: RoomsResponse) {
  const root = document.getElementById('rooms') as HTMLDivElement;
  root.innerHTML = '';
  const rooms = (data && data.rooms) || [];
  if (rooms.length === 0) {
    root.innerHTML = '<div class="room"><div>Không có phòng nào đang mở.</div></div>';
    return;
  }
  for (const r of rooms) {
    const div = document.createElement('div');
    div.className = 'room border border-[#1f2636] bg-[#151a28] rounded-lg p-3';
    div.innerHTML = `
      <header class="flex items-center justify-between mb-2">
        <strong>Phòng: ${r.id}</strong>
        <span class="meta text-sm text-[#98a3c7]">Tạo lúc: ${fmtTime(r.createdAt)}</span>
      </header>
      <div class="meta text-sm text-[#98a3c7]">Lượt: <span class="badge px-2 py-0.5 rounded border border-[#1f2636] bg-[#0a0e18]">${r.turn === 'w' ? 'Trắng' : 'Đen'}</span> · Nước: ${r.historyCount}</div>
      <div class="players my-2">
        ${r.players.map(p => `<div class="player flex gap-2 items-center text-sm"><span class="badge px-2 py-0.5 rounded border border-[#1f2636] bg-[#0a0e18]">${p.color === 'w' ? 'Trắng' : 'Đen'}</span> <span>${p.user}</span></div>`).join('')}
      </div>
      <div class="meta text-sm text-[#98a3c7]">FEN: <kbd class="border border-[#1f2636] bg-[#0a0e18] px-1 rounded">${r.fen}</kbd></div>
      <div class="meta text-sm mt-2">Lịch sử nước đi gần đây:</div>
      <ul class="moves ml-4">${(r.recentMoves || []).map(x => `<li class="text-[#98a3c7]">${x}</li>`).join('') || '<li class="text-[#98a3c7]">Chưa có nước đi nào</li>'}</ul>
      <div class="actions flex flex-wrap gap-2 mt-2">
        <button data-act="view" data-id="${r.id}" class="px-3 py-1 rounded border border-[#1f2636] hover:text-[#31f39d] hover:border-[#31f39d]">Xem</button>
        <button data-act="reset" data-id="${r.id}" class="px-3 py-1 rounded border border-[#1f2636] hover:text-[#31f39d] hover:border-[#31f39d]">Reset</button>
        <button data-act="sync" data-id="${r.id}" class="px-3 py-1 rounded border border-[#1f2636] hover:text-[#31f39d] hover:border-[#31f39d]">Đồng bộ</button>
        <button data-act="message" data-id="${r.id}" class="px-3 py-1 rounded border border-[#1f2636] hover:text-[#31f39d] hover:border-[#31f39d]">Gửi thông báo</button>
        <button data-act="close" data-id="${r.id}" class="px-3 py-1 rounded border border-[#1f2636] hover:text-[#31f39d] hover:border-[#31f39d]">Đóng phòng</button>
      </div>
    `;
    root.appendChild(div);
  }
}

async function loadOnce() {
  try {
    const data = await fetchJSON<RoomsResponse>('/api/rooms');
    renderRooms(data);
    const el = document.getElementById('updated');
    if (el) el.textContent = 'Cập nhật: ' + new Date().toLocaleTimeString();
  } catch (e) {
    console.error(e);
    const el = document.getElementById('updated');
    if (el) el.textContent = 'Lỗi tải dữ liệu';
  }
}

function wire() {
  const refresh = document.getElementById('refresh');
  refresh?.addEventListener('click', loadOnce);
  const roomsRoot = document.getElementById('rooms');
  roomsRoot?.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const btn = target.closest('button[data-act]') as HTMLButtonElement | null;
    if (!btn) return;
    handleAction(btn.dataset.act as string, btn.dataset.id as string);
  });
  setInterval(loadOnce, 2000);
  loadOnce();

  const vc = document.getElementById('viewerClose');
  vc?.addEventListener('click', closeViewer);
  const modal = document.getElementById('viewerModal');
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeViewer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer(); });
}

wire();

// ====== Viewer ======
let viewerState: { id: string | null; timer: ReturnType<typeof setInterval> | null } = { id: null, timer: null };

function parseFENBoard(fen: string): (string | null)[][] {
  if (!fen) return Array.from({ length: 8 }, () => Array(8).fill(null));
  const part = String(fen).split(' ')[0];
  const ranks = part.split('/');
  const board: (string | null)[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: (string | null)[] = [];
    for (const ch of ranks[r]) {
      if (/^[1-8]$/.test(ch)) {
        for (let k = 0; k < Number(ch); k++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    board.push(row);
  }
  return board;
}

const PIECES: Record<string, string> = {
  'P': '♙','N': '♘','B': '♗','R': '♖','Q': '♕','K': '♔',
  'p': '♟','n': '♞','b': '♝','r': '♜','q': '♛','k': '♚'
};

function renderBoard(fen: string) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  const grid = parseFENBoard(fen);
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = 'square ' + (isLight ? 'light' : 'dark');
      const code = grid[r][c];
      if (code) {
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = PIECES[code] || '?';
        sq.appendChild(span);
      }
      boardEl.appendChild(sq);
    }
  }
}

async function loadViewerOnce() {
  if (!viewerState.id) return;
  const data = await fetchJSON<RoomDetail>(`/api/rooms/${viewerState.id}`);
  const { fen, history, turn, id } = data;
  (document.getElementById('viewerRoom') as HTMLSpanElement).textContent = `Phòng: ${id}`;
  (document.getElementById('viewerTurn') as HTMLSpanElement).textContent = `Lượt: ${turn === 'w' ? 'Trắng' : 'Đen'}`;
  renderBoard(fen);
  const movesUl = document.getElementById('viewerMoves') as HTMLUListElement;
  movesUl.innerHTML = (history || []).map(m => `<li>${(m.color === 'w' ? 'Trắng' : 'Đen')}: ${m.san || `${m.from}-${m.to}`}</li>`).join('') || '<li>Chưa có nước đi nào</li>';
}

async function openViewer(id: string) {
  viewerState.id = id;
  const modal = document.getElementById('viewerModal') as HTMLDivElement;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  await loadViewerOnce();
  viewerState.timer = setInterval(loadViewerOnce, 1500);
}

function closeViewer() {
  const modal = document.getElementById('viewerModal') as HTMLDivElement;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (viewerState.timer) clearInterval(viewerState.timer);
  viewerState = { id: null, timer: null };
}

async function handleAction(act: string, id: string) {
  try {
    if (act === 'reset') {
      await fetchJSON(`/api/rooms/${id}/reset`, { method: 'POST', body: '{}' });
    } else if (act === 'sync') {
      await fetchJSON(`/api/rooms/${id}/sync`, { method: 'POST', body: '{}' });
    } else if (act === 'message') {
      const text = prompt('Nội dung thông báo tới phòng:');
      if (text && text.trim().length > 0) {
        await fetchJSON(`/api/rooms/${id}/message`, { method: 'POST', body: JSON.stringify({ text }) });
      }
    } else if (act === 'close') {
      if (confirm('Đóng phòng này?')) {
        await fetchJSON(`/api/rooms/${id}/close`, { method: 'POST', body: '{}' });
      }
    } else if (act === 'view') {
      await openViewer(id);
      return;
    }
    await loadOnce();
  } catch (e: any) {
    alert('Thao tác thất bại: ' + e.message);
  }
}