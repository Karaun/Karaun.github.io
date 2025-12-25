const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
// 轻量ID生成，避免对 ESM-only 依赖的要求
function uid(len = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [{ id: 'u1', username: 'admin', password: '123456', displayName: '管理员' }], samples: [], customTiles: [] }, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = readDB();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: '用户名或密码错误' });
  res.json({ id: user.id, username: user.username, displayName: user.displayName || user.username });
});

// 用户注册
app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: '请输入用户名与密码' });
  const db = readDB();
  if (db.users.find(u => u.username === username)) {
    return res.status(409).json({ message: '用户名已存在' });
  }
  const user = { id: uid(10), username, password, displayName: displayName || username };
  db.users.push(user);
  writeDB(db);
  res.json({ id: user.id, username: user.username, displayName: user.displayName });
});

app.get('/api/tiles', (req, res) => {
  const db = readDB();
  res.json(db.customTiles || []);
});

app.post('/api/tiles', (req, res) => {
  const { name, urlTemplate, minZoom = 0, maxZoom = 20 } = req.body || {};
  if (!name || !urlTemplate) return res.status(400).json({ message: '参数不完整' });
  const db = readDB();
  const item = { id: uid(8), name, urlTemplate, minZoom, maxZoom };
  db.customTiles.push(item);
  writeDB(db);
  res.json(item);
});

app.delete('/api/tiles/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const i = db.customTiles.findIndex(t => t.id === id);
  if (i === -1) return res.status(404).json({ message: '未找到' });
  const removed = db.customTiles.splice(i, 1)[0];
  writeDB(db);
  res.json(removed);
});

app.get('/api/samples', (req, res) => {
  const db = readDB();
  res.json(db.samples || []);
});

app.post('/api/samples', (req, res) => {
  const { name, category, description, lon, lat } = req.body || {};
  if (!name || lon === undefined || lat === undefined) return res.status(400).json({ message: '参数不完整' });
  const db = readDB();
  const item = { id: uid(10), name, category: category || '', description: description || '', lon: Number(lon), lat: Number(lat), createdAt: Date.now() };
  db.samples.push(item);
  writeDB(db);
  res.json(item);
});

app.put('/api/samples/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const i = db.samples.findIndex(s => s.id === id);
  if (i === -1) return res.status(404).json({ message: '未找到' });
  const patch = req.body || {};
  db.samples[i] = { ...db.samples[i], ...patch };
  writeDB(db);
  res.json(db.samples[i]);
});

app.delete('/api/samples/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const i = db.samples.findIndex(s => s.id === id);
  if (i === -1) return res.status(404).json({ message: '未找到' });
  const removed = db.samples.splice(i, 1)[0];
  writeDB(db);
  res.json(removed);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
