import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Chess } from 'chess.js';
import { updateElo } from './elo.js';
import path from 'path';
import { fileURLToPath } from 'url';
// Auto build Admin TypeScript on server start (watch mode)
async function setupAdminBuild() {
  try {
    const esbuild = await import('esbuild');
    const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
    const entry = path.join(__dirnameLocal, 'public', 'admin.ts');
    const outfile = path.join(__dirnameLocal, 'public', 'admin.js');
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'iife',
      target: 'es2019',
      sourcemap: false,
      watch: {
        onRebuild(error) {
          if (error) console.error('Admin TS rebuild failed:', error);
          else console.log('Admin TS rebuilt');
        }
      }
    });
    console.log('Admin TS initial build done (watching changes)');
  } catch (err) {
    console.warn('esbuild unavailable; skip admin TS auto-build.');
  }
}

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const PORT = process.env.PORT || 4000;

// MongoDB setup (optional). If not provided, fallback to in-memory store.
const MONGODB_URI = process.env.MONGODB_URI;
let dbReady = false;
let UserModel = null;
let MatchModel = null;
let RoomModel = null;

const memory = {
  users: new Map(), // username -> { passwordHash, elo, wins, losses }
  matches: [],
};

async function connectDb() {
  if (!MONGODB_URI) { console.log('MongoDB disabled: missing MONGODB_URI'); return; }
  try {
    await mongoose.connect(MONGODB_URI);
    const userSchema = new mongoose.Schema({
      username: { type: String, unique: true },
      passwordHash: String,
      elo: { type: Number, default: 1200 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      provider: { type: String, default: 'email' },
    }, { timestamps: true });
    const matchSchema = new mongoose.Schema({
      roomId: String,
      white: String,
      black: String,
      pgn: String,
      result: String,
    }, { timestamps: true });
    const roomSchema = new mongoose.Schema({
      roomId: { type: String, unique: true },
      players: [{ username: String, color: { type: String, enum: ['w','b'] } }],
      createdAt: { type: Number },
      history: [{ from: String, to: String, san: String, color: String, ts: Number }],
      fen: String,
      pgn: String,
      turn: { type: String, enum: ['w','b'], default: 'w' }
    }, { timestamps: true });
    UserModel = mongoose.model('User', userSchema);
    MatchModel = mongoose.model('Match', matchSchema);
    RoomModel = mongoose.model('Room', roomSchema);
    dbReady = true;
    console.log('MongoDB connected');
    await loadRoomsFromDb();
  } catch (e) {
    console.warn('MongoDB connection failed, using memory store');
  }
}

connectDb();
// Initialize admin TypeScript builder
setupAdminBuild();

// Root route to avoid "Cannot GET /" confusion
app.get('/', (req, res) => {
  res.send('OK: covua socket/api server');
});

// Health check: DB status and rooms count
app.get('/api/health', (req, res) => {
  const dbStatus = dbReady ? 'connected' : (MONGODB_URI ? 'connecting_failed_or_not_ready' : 'disabled');
  const roomsCount = rooms.size;
  const mongooseState = mongoose.connection?.readyState ?? -1; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  res.json({ ok: true, dbReady, dbStatus, mongooseState, roomsCount, port: PORT });
});

// Admin UI & static assets
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Thiếu dữ liệu' });
  const passwordHash = await bcrypt.hash(password, 10);
  if (dbReady) {
    try {
      const existing = await UserModel.findOne({ username });
      if (existing) return res.status(409).json({ error: 'Tài khoản đã tồn tại' });
      await UserModel.create({ username, passwordHash });
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'DB error' }); }
  } else {
    if (memory.users.has(username)) return res.status(409).json({ error: 'Tài khoản đã tồn tại' });
    memory.users.set(username, { passwordHash, elo: 1200, wins: 0, losses: 0 });
    return res.json({ ok: true });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Thiếu dữ liệu' });
  let user;
  if (dbReady) user = await UserModel.findOne({ username });
  else user = memory.users.get(username);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Sai mật khẩu' });
  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ token });
});

// OAuth upsert: tạo hoặc cập nhật người dùng theo provider, không yêu cầu mật khẩu
app.post('/api/auth/oauth-upsert', async (req, res) => {
  const { username, provider } = req.body || {};
  if (!username || !provider) return res.status(400).json({ error: 'Thiếu dữ liệu' });
  try {
    if (dbReady) {
      let user = await UserModel.findOne({ username });
      if (!user) user = await UserModel.create({ username, provider, passwordHash: '' });
      else { user.provider = provider; await user.save(); }
      return res.json({ ok: true });
    } else {
      const existing = memory.users.get(username);
      if (!existing) memory.users.set(username, { passwordHash: '', elo: 1200, wins: 0, losses: 0, provider });
      else existing.provider = provider;
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Upsert thất bại' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  if (dbReady) {
    const top = await UserModel.find({}).sort({ elo: -1 }).limit(50);
    return res.json(top.map(u => ({ username: u.username, elo: u.elo, wins: u.wins, losses: u.losses })));
  }
  const list = [...memory.users.entries()].map(([username, u]) => ({ username, elo: u.elo, wins: u.wins, losses: u.losses }))
    .sort((a,b)=>b.elo - a.elo).slice(0,50);
  return res.json(list);
});

app.post('/api/matches/finish', async (req, res) => {
  const { roomId, white, black, pgn, result } = req.body || {};
  if (!roomId || !white || !black || !pgn || !result) return res.status(400).json({ error: 'Thiếu dữ liệu' });
  let wUser, bUser;
  if (dbReady) {
    wUser = await UserModel.findOne({ username: white });
    bUser = await UserModel.findOne({ username: black });
  } else {
    wUser = memory.users.get(white);
    bUser = memory.users.get(black);
  }
  if (!wUser || !bUser) return res.status(404).json({ error: 'User không tồn tại' });
  const scoreWhite = result === 'white' ? 1 : result === 'black' ? 0 : 0.5;
  const [newW, newB] = updateElo(wUser.elo, bUser.elo, scoreWhite);
  if (dbReady) {
    wUser.elo = newW; wUser.wins += scoreWhite === 1 ? 1 : 0; wUser.losses += scoreWhite === 0 ? 1 : 0; await wUser.save();
    bUser.elo = newB; bUser.wins += scoreWhite === 0 ? 1 : 0; bUser.losses += scoreWhite === 1 ? 1 : 0; await bUser.save();
    await MatchModel.create({ roomId, white, black, pgn, result });
  } else {
    wUser.elo = newW; wUser.wins += scoreWhite === 1 ? 1 : 0; wUser.losses += scoreWhite === 0 ? 1 : 0;
    bUser.elo = newB; bUser.wins += scoreWhite === 0 ? 1 : 0; bUser.losses += scoreWhite === 1 ? 1 : 0;
    memory.matches.push({ roomId, white, black, pgn, result });
  }
  return res.json({ ok: true, elo: { white: newW, black: newB } });
});

// Admin room APIs
app.get('/api/rooms', async (req, res) => {
  if (dbReady) {
    const docs = await RoomModel.find({}).lean();
    const list = docs.map(d => ({
      id: d.roomId,
      players: (d.players || []).map(p => ({ id: p.username, user: p.username, color: p.color })),
      createdAt: d.createdAt,
      historyCount: (d.history || []).length,
      turn: d.turn || 'w',
      fen: d.fen || '',
      pgn: d.pgn || '',
      recentMoves: (d.history || []).slice(-10).map(m => `${m.color === 'w' ? 'Trắng' : 'Đen'}: ${m.san || `${m.from}-${m.to}`}`)
    }));
    return res.json({ ok: true, rooms: list });
  }
  const list = [...rooms.entries()].map(([id, r]) => ({
    id,
    players: [...(r.players || [])].map(pid => {
      const s = io.sockets.sockets.get(pid);
      return { id: pid, user: (s && s.data && s.data.username) ? s.data.username : pid.slice(0,5), color: r.colors?.get(pid) || 'w' };
    }),
    createdAt: r.createdAt,
    historyCount: (r.history || []).length,
    turn: r.chess?.turn?.() || 'w',
    fen: r.chess?.fen?.() || '',
    pgn: r.chess?.pgn?.() || '',
    recentMoves: (r.history || []).slice(-10).map(m => `${m.color === 'w' ? 'Trắng' : 'Đen'}: ${m.san || `${m.from}-${m.to}`}`)
  }));
  res.json({ ok: true, rooms: list });
});

app.get('/api/rooms/:roomId', async (req, res) => {
  if (dbReady) {
    const d = await RoomModel.findOne({ roomId: req.params.roomId }).lean();
    if (!d) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({
      ok: true,
      id: d.roomId,
      players: (d.players || []).map(p => ({ id: p.username, user: p.username, color: p.color })),
      createdAt: d.createdAt,
      history: d.history || [],
      turn: d.turn || 'w',
      fen: d.fen || '',
      pgn: d.pgn || ''
    });
  }
  const r = rooms.get(req.params.roomId);
  if (!r) return res.status(404).json({ ok: false, error: 'not_found' });
  const players = [...(r.players || [])].map(pid => {
    const s = io.sockets.sockets.get(pid);
    return { id: pid, user: (s && s.data && s.data.username) ? s.data.username : pid.slice(0,5), color: r.colors?.get(pid) || 'w' };
  });
  res.json({ ok: true, id: req.params.roomId, players, createdAt: r.createdAt, history: r.history || [], turn: r.chess?.turn?.() || 'w', fen: r.chess?.fen?.() || '', pgn: r.chess?.pgn?.() || '' });
});

app.post('/api/rooms/:roomId/reset', (req, res) => {
  const roomId = req.params.roomId;
  const r = rooms.get(roomId);
  if (!r) return res.status(404).json({ ok: false, error: 'not_found' });
  r.chess = new Chess();
  r.history = [];
  io.to(roomId).emit('sync', { history: [] });
  io.to(roomId).emit('turn', { turn: 'w' });
  io.to(roomId).emit('system', { text: 'Phòng đã được admin reset' });
  if (dbReady) {
    RoomModel.updateOne({ roomId }, { $set: { history: [], fen: r.chess.fen(), pgn: r.chess.pgn?.() || '', turn: 'w' } }).catch(()=>{});
  }
  res.json({ ok: true });
});

app.post('/api/rooms/:roomId/sync', (req, res) => {
  const roomId = req.params.roomId;
  const r = rooms.get(roomId);
  if (!r) return res.status(404).json({ ok: false, error: 'not_found' });
  io.to(roomId).emit('sync', { history: r.history || [] });
  io.to(roomId).emit('turn', { turn: r.chess?.turn?.() || 'w' });
  res.json({ ok: true });
});

app.post('/api/rooms/:roomId/message', (req, res) => {
  const roomId = req.params.roomId;
  const { text } = req.body || {};
  if (!text || String(text).trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }
  io.to(roomId).emit('system', { text: String(text) });
  res.json({ ok: true });
});

app.post('/api/rooms/:roomId/close', async (req, res) => {
  const roomId = req.params.roomId;
  const r = rooms.get(roomId);
  if (!r) return res.status(404).json({ ok: false, error: 'not_found' });
  io.to(roomId).emit('system', { text: 'Phòng đã đóng bởi admin' });
  await io.in(roomId).socketsLeave(roomId);
  rooms.delete(roomId);
  if (dbReady) { try { await RoomModel.deleteOne({ roomId }); } catch {} }
  res.json({ ok: true });
});

// Socket.IO rooms & game relay
const rooms = new Map(); // roomId -> { players: Set(socketId), colors: Map<socketId,'w'|'b'>, createdAt, history: Array<{from:string;to:string}>, chess: Chess }

function makeRoomId() { return Math.random().toString(36).slice(2,8); }

io.on('connection', (socket) => {
  socket.on('identify', ({ username }) => {
    socket.data.username = username || 'Khách';
  });
  socket.on('createRoom', (_, cb) => {
    const id = makeRoomId();
    rooms.set(id, { players: new Set([socket.id]), colors: new Map([[socket.id, 'w']]), createdAt: Date.now(), history: [], chess: new Chess(), ended: false });
    socket.join(id);
    try { cb({ roomId: id, color: 'w' }); } catch { /* fallback if client not expecting object */ socket.emit('yourColor', { color: 'w', roomId: id }); }
    const user = socket.data.username || socket.id.slice(0,5);
    io.to(id).emit('system', { text: `${user} đã tạo phòng` });
    // initial turn is white
    io.to(id).emit('turn', { turn: 'w' });
    if (dbReady) {
      const fen = rooms.get(id).chess.fen();
      RoomModel.create({ roomId: id, players: [{ username: user, color: 'w' }], createdAt: rooms.get(id).createdAt, history: [], fen, pgn: '', turn: 'w' }).catch(()=>{});
    }
  });

  socket.on('joinRoom', async ({ roomId, username }, cb) => {
    let r = rooms.get(roomId);
    let doc = null;
    // Luôn thử lấy doc từ DB để biết mapping username->color nếu có
    if (dbReady) {
      try { doc = await RoomModel.findOne({ roomId }).lean(); } catch {}
    }
    // Nếu phòng chưa có trong memory, khôi phục từ DB
    if (!r) {
      if (doc) {
        const chess = new Chess();
        try { if (doc.fen) chess.load(doc.fen); } catch {}
        r = { players: new Set(), colors: new Map(), createdAt: doc.createdAt || Date.now(), history: doc.history || [], chess, ended: false };
        rooms.set(roomId, r);
      } else {
        try { cb(false); } catch {} ; return;
      }
    }

    r.players.add(socket.id);
    r.colors = r.colors || new Map();

    const uname = username || socket.data.username || 'Khách';
    // Kiểm tra nếu username đã từng có trong phòng (trong memory)
    let existingColorByUser = null;
    for (const pid of r.players) {
      const s = io.sockets.sockets.get(pid);
      const u = s?.data?.username;
      const c = r.colors?.get(pid);
      if (u && c && u === uname) { existingColorByUser = c; break; }
    }

    // Trạng thái màu hiện có trong phòng
    const hasWhite = [...(r.colors?.values() || [])].includes('w');
    const hasBlack = [...(r.colors?.values() || [])].includes('b');

    // Ưu tiên: màu theo username từ memory -> từ DB -> theo chỗ trống hiện tại
    let colorToAssign = existingColorByUser || null;
    if (!colorToAssign && doc) {
      const players = (doc.players || []);
      const found = players.find(p => p.username === uname);
      if (found) colorToAssign = found.color;
    }
    if (!colorToAssign) {
      if (!hasWhite) colorToAssign = 'w';
      else if (!hasBlack) colorToAssign = 'b';
      else {
        // Cả hai màu đã có người giữ: gán theo lượt còn trống (ưu tiên khác với currentTurn)
        const t = r.chess?.turn?.() || 'w';
        colorToAssign = t === 'w' ? 'b' : 'w';
      }
    }
    r.colors.set(socket.id, colorToAssign);
    socket.join(roomId);
    try { cb({ ok: true, color: colorToAssign }); } catch { socket.emit('yourColor', { color: colorToAssign, roomId }); }
    socket.data.username = uname;
    io.to(roomId).emit('system', { text: `${socket.data.username} đã tham gia phòng` });
    // send current history to the joining socket for synchronization
    try {
      socket.emit('sync', { history: r.history || [] });
      // also inform current turn from server chess state
      const t = r.chess?.turn?.() || 'w';
      socket.emit('turn', { turn: t });
    } catch {}
    if (dbReady) {
      // upsert player vào doc phòng, đảm bảo một username chỉ có một màu
      RoomModel.updateOne(
        { roomId, 'players.username': { $ne: uname } },
        { $setOnInsert: { roomId, createdAt: r.createdAt }, $set: { fen: r.chess.fen(), pgn: r.chess.pgn?.() || '', turn: r.chess.turn() }, $addToSet: { players: { username: uname, color: colorToAssign } } },
        { upsert: true }
      ).catch(()=>{});
      // Nếu đã tồn tại username, cập nhật màu cho đúng
      RoomModel.updateOne(
        { roomId, 'players.username': uname },
        { $set: { 'players.$.color': colorToAssign, fen: r.chess.fen(), pgn: r.chess.pgn?.() || '', turn: r.chess.turn() } }
      ).catch(()=>{});
    }
  });

  // Allow a client to query what color the server assigned to it in a room
  socket.on('myColor', ({ roomId }, cb) => {
    const r = rooms.get(roomId);
    const color = r?.colors?.get(socket.id) || 'w';
    if (typeof cb === 'function') {
      try { cb({ color }); } catch {}
    } else {
      socket.emit('yourColor', { color, roomId });
    }
  });

  socket.on('move', ({ roomId, from, to, promotion }, cb) => {
    const r = rooms.get(roomId);
    if (!r) { if (typeof cb === 'function') try { cb({ ok: false, reason: 'room' }); } catch {} ; return; }
    if (r.ended) {
      socket.emit('system', { text: 'Ván đã kết thúc. Vui lòng reset hoặc tạo phòng mới.' });
      if (typeof cb === 'function') { try { cb({ ok: false, reason: 'ended' }); } catch {} }
      return;
    }

    r.history = r.history || [];
    const color = r.colors?.get(socket.id) || 'w';
    const currentTurn = r.chess?.turn?.() || 'w';
    if (color !== currentTurn) {
      socket.emit('system', { text: 'Chưa đến lượt bạn' });
      if (typeof cb === 'function') { try { cb({ ok: false, reason: 'turn' }); } catch {} }
      return;
    }

    // Validate and apply using chess.js (gracefully handle invalid)
    let mv = null;
    try {
      // Diagnostics: identify source/destination pieces for clearer error messages
      const src = r.chess.get(from);
      const dst = r.chess.get(to);
      // Attempt move (support optional promotion)
      const usePromotion = typeof promotion === 'string' && /^(q|r|b|n)$/.test(promotion);
      mv = r.chess?.move ? (usePromotion ? r.chess.move({ from, to, promotion }) : r.chess.move({ from, to })) : null;
      if (!mv) {
        // Provide specific feedback for common invalid cases
        const files = ['a','b','c','d','e','f','g','h'];
        const fFrom = files.indexOf(from[0]);
        const rFrom = Number(from[1]);
        const fTo = files.indexOf(to[0]);
        const rTo = Number(to[1]);
        const df = Math.abs(fFrom - fTo);
        const dr = rTo - rFrom;
        let reason = 'invalid';
        if (src && src.type === 'p') {
          const forward = src.color === 'w' ? 1 : -1;
          if (df === 1 && dr === forward) {
            if (!dst) reason = 'pawn-diagonal-no-target';
            else if (dst && dst.color === src.color) reason = 'pawn-diagonal-own-piece';
          }
        }
        if (!dst && reason === 'invalid' && src && dst === null) {
          reason = 'empty-target';
        }
        socket.emit('system', { text: `Nước đi không hợp lệ${src ? ` (${src.color === 'w' ? 'Trắng' : 'Đen'} ${src.type} ${from}→${to})` : ''}${dst ? `, đích đang có ${dst.color === 'w' ? 'Trắng' : 'Đen'} ${dst.type}` : ''}` });
        if (typeof cb === 'function') { try { cb({ ok: false, reason }); } catch {} }
        return;
      }
    } catch (err) {
      socket.emit('system', { text: 'Nước đi không hợp lệ' });
      if (typeof cb === 'function') { try { cb({ ok: false, reason: 'invalid-exception' }); } catch {} }
      return;
    }

    r.history.push({ from, to, san: mv.san, color: mv.color, ts: Date.now() });

    // Broadcast move and updated turn
    io.to(roomId).emit('move', { from, to });
    const nextTurn = r.chess.turn();
    io.to(roomId).emit('turn', { turn: nextTurn });
    if (dbReady) {
      RoomModel.updateOne(
        { roomId },
        { $set: { fen: r.chess.fen(), pgn: r.chess.pgn?.() || '', turn: nextTurn }, $push: { history: { from, to, san: mv.san, color: mv.color, ts: Date.now() } } }
      ).catch(()=>{});
    }

    // Detect game over states and broadcast result
    try {
      const inCheck = (r.chess && r.chess.inCheck && typeof r.chess.inCheck === 'function') ? r.chess.inCheck() : false;
      const legalMoves = (r.chess && r.chess.moves && typeof r.chess.moves === 'function') ? r.chess.moves().length : 0;

      if (legalMoves === 0) {
        // No legal moves: either checkmate or stalemate
        r.ended = true;
        const loserTurn = r.chess.turn();
        const winner = loserTurn === 'w' ? 'b' : 'w';
        if (inCheck) {
          io.to(roomId).emit('system', { text: `Chiếu hết! ${winner === 'w' ? 'Trắng' : 'Đen'} thắng` });
          io.to(roomId).emit('gameOver', { result: 'checkmate', winner });
        } else {
          io.to(roomId).emit('system', { text: 'Ván hoà (thế bí)' });
          io.to(roomId).emit('gameOver', { result: 'draw', reason: 'stalemate' });
        }
      } else if (typeof r.chess.isDraw === 'function' && r.chess.isDraw()) {
        // Other draw conditions (threefold, 50-move, insufficient material)
        r.ended = true;
        let reason = 'draw';
        if (typeof r.chess.isThreefoldRepetition === 'function' && r.chess.isThreefoldRepetition()) reason = 'threefold';
        else if (typeof r.chess.isInsufficientMaterial === 'function' && r.chess.isInsufficientMaterial()) reason = 'insufficient-material';
        // chess.js treats stalemate as draw as well, but we already handled stalemate above
        io.to(roomId).emit('system', { text: 'Ván hoà' });
        io.to(roomId).emit('gameOver', { result: 'draw', reason });
      } else {
        // Optional: announce check when game continues
        if (inCheck) io.to(roomId).emit('system', { text: 'Chiếu!' });
      }
    } catch {}

    if (typeof cb === 'function') {
      try { cb({ ok: true }); } catch {}
    }
  });

  // Allow clients to request a fresh sync of current room history
  socket.on('requestSync', ({ roomId }, cb) => {
    const r = rooms.get(roomId);
    const history = r?.history || [];
    const t = r?.chess?.turn?.() || 'w';
    try {
      // Reply via ack if callback is provided
      if (typeof cb === 'function') cb({ history, turn: t });
      // Also emit directly to the requester for broader compatibility
      socket.emit('sync', { history });
      socket.emit('turn', { turn: t });
    } catch {}
  });

  socket.on('chat', ({ roomId, text, gif }) => {
    const user = socket.data.username || socket.id.slice(0,5);
    const payload = { user, text, ts: Date.now() };
    if (gif) payload.gif = String(gif);
    io.to(roomId).emit('chat', payload);
  });

  // Client yêu cầu rời phòng, giữ phòng lại để có thể tái nhập
  socket.on('leaveRoom', ({ roomId }, cb) => {
    try {
      const r = rooms.get(roomId);
      if (r) {
        r.players.delete(socket.id);
        if (r.colors) r.colors.delete(socket.id);
        const user = socket.data.username || socket.id.slice(0,5);
        io.to(roomId).emit('system', { text: `${user} đã rời phòng`, ts: Date.now() });
        socket.leave(roomId);
        if (dbReady) {
          const uname = socket.data.username;
          RoomModel.updateOne(
            { roomId },
            { $pull: { players: { username: uname } }, $set: { fen: r.chess?.fen?.() || '', pgn: r.chess?.pgn?.() || '', turn: r.chess?.turn?.() || 'w' } }
          ).catch(()=>{});
        }
      }
      if (typeof cb === 'function') { try { cb({ ok: true }); } catch {} }
    } catch {
      if (typeof cb === 'function') { try { cb({ ok: false }); } catch {} }
    }
  });

  socket.on('disconnect', () => {
    for (const [rid, r] of rooms) {
      r.players.delete(socket.id);
      // Đừng xoá phòng ngay khi không còn người chơi
      // để cho phép người dùng reload và tái nhập bằng mã phòng.
      // Việc dọn phòng cũ sẽ xử lý bằng TTL/cron sau.
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Load rooms from MongoDB on startup
async function loadRoomsFromDb() {
  if (!dbReady || !RoomModel) return;
  try {
    const docs = await RoomModel.find({}).lean();
    for (const d of docs) {
      const chess = new Chess();
      try { if (d.fen) chess.load(d.fen); } catch {}
      rooms.set(d.roomId, { players: new Set(), colors: new Map(), createdAt: d.createdAt || Date.now(), history: d.history || [], chess });
    }
    console.log(`Loaded ${docs.length} rooms from MongoDB`);
  } catch (e) {
    console.warn('Failed loading rooms from DB', e?.message || e);
  }
}