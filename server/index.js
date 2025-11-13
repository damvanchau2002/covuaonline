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

const memory = {
  users: new Map(), // username -> { passwordHash, elo, wins, losses }
  matches: [],
};

async function connectDb() {
  if (!MONGODB_URI) return;
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
    UserModel = mongoose.model('User', userSchema);
    MatchModel = mongoose.model('Match', matchSchema);
    dbReady = true;
    console.log('MongoDB connected');
  } catch (e) {
    console.warn('MongoDB connection failed, using memory store');
  }
}

connectDb();

// Root route to avoid "Cannot GET /" confusion
app.get('/', (req, res) => {
  res.send('OK: covua socket/api server');
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

// Socket.IO rooms & game relay
const rooms = new Map(); // roomId -> { players: Set(socketId), colors: Map<socketId,'w'|'b'>, createdAt, history: Array<{from:string;to:string}> }

function makeRoomId() { return Math.random().toString(36).slice(2,8); }

io.on('connection', (socket) => {
  socket.on('identify', ({ username }) => {
    socket.data.username = username || 'Khách';
  });
  socket.on('createRoom', (_, cb) => {
    const id = makeRoomId();
    rooms.set(id, { players: new Set([socket.id]), colors: new Map([[socket.id, 'w']]), createdAt: Date.now(), history: [] });
    socket.join(id);
    cb(id);
    const user = socket.data.username || socket.id.slice(0,5);
    io.to(id).emit('system', { text: `${user} đã tạo phòng` });
  });

  socket.on('joinRoom', ({ roomId, username }, cb) => {
    if (!rooms.has(roomId)) { cb(false); return; }
    const r = rooms.get(roomId);
    r.players.add(socket.id);
    r.colors = r.colors || new Map();
    // assign black to the second player
    if (!r.colors.has(socket.id)) r.colors.set(socket.id, 'b');
    socket.join(roomId);
    cb(true);
    socket.data.username = username || socket.data.username || 'Khách';
    io.to(roomId).emit('system', { text: `${socket.data.username} đã tham gia phòng` });
    // send current history to the joining socket for synchronization
    try { socket.emit('sync', { history: r.history || [] }); } catch {}
  });

  socket.on('move', ({ roomId, from, to }) => {
    const r = rooms.get(roomId);
    if (r) {
      r.history = r.history || [];
      // enforce turn order: white moves on even index, black on odd index
      const idx = r.history.length; // 0-based before pushing
      const expected = idx % 2 === 0 ? 'w' : 'b';
      const color = r.colors?.get(socket.id) || 'w';
      if (color !== expected) {
        socket.emit('system', { text: 'Chưa đến lượt bạn' });
        return;
      }
      r.history.push({ from, to });
    }
    socket.to(roomId).emit('move', { from, to });
  });

  socket.on('chat', ({ roomId, text, gif }) => {
    const user = socket.data.username || socket.id.slice(0,5);
    const payload = { user, text, ts: Date.now() };
    if (gif) payload.gif = String(gif);
    io.to(roomId).emit('chat', payload);
  });

  socket.on('disconnect', () => {
    for (const [rid, r] of rooms) {
      r.players.delete(socket.id);
      if (r.players.size === 0) rooms.delete(rid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});