#!/usr/bin/env node
/**
 * RO Assist Monitor Relay Server
 * 
 * WebSocket relay สำหรับรับข้อมูลจากสคริปต์ (bot client) 
 * และส่งต่อให้หน้าเว็บ monitor (monitor client)
 * 
 * วิธีรัน:
 *   npm install ws
 *   node relay-server.js
 * 
 * หรือใช้ PM2:
 *   pm2 start relay-server.js --name ro-monitor
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3002;
// ★ admin token — สำหรับดูรายชื่อบอททั้งหมด (ผ่าน ?token= หรือ {type:'list', token:})
//   ตั้งค่าผ่าน env var ADMIN_TOKEN หรือ default 'ro-admin-2026'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'ro-admin-2026';

// ★ HTTP server — serve remote-monitor.html + relay.js (เปิดเว็บได้เลยไม่ต้องโหลดไฟล์)
const MONITOR_HTML = fs.readFileSync(path.join(__dirname, 'remote-monitor.html'), 'utf8');

// ★★ Chat files directory — เก็บรูป/ไฟล์ที่อัปโหลด
const CHAT_FILES_DIR = path.join(__dirname, 'chat-files');
try { fs.mkdirSync(CHAT_FILES_DIR, { recursive: true }); } catch (_) {}
const MAX_FILE_SIZE = 1048576;   // 1 MB

// ★★ Feedback store — เก็บปัญหา/ข้อเสนอแนะจากผู้ใช้
const FEEDBACK_FILE = path.join(__dirname, 'feedback-store.json');
let feedbackStore = [];
try { feedbackStore = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')); if (!Array.isArray(feedbackStore)) feedbackStore = []; } catch (_) { feedbackStore = []; }
function saveFeedback() { try { fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbackStore.slice(-200))); } catch (_) {} }
const MIME_MAP = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp', '.gif': 'image/gif', '.webp': 'image/webp',
  '.json': 'application/json', '.txt': 'text/plain', '.js': 'text/javascript',
};

const server = http.createServer((req, res) => {
  // ★★ CORS headers สำหรับทุก response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ★★ POST /upload — รับไฟล์เป็น base64 JSON
  if (req.url === '/upload' && req.method === 'POST') {
    let body = '';
    let tooBig = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { tooBig = true; req.destroy(); }   // 2MB safety limit
    });
    req.on('end', () => {
      try {
        const { data, mimeType, filename } = JSON.parse(body);
        if (!data || typeof data !== 'string') throw new Error('no data');
        const sizeBytes = Math.ceil(data.length * 0.75);   // base64 → actual size
        if (sizeBytes > MAX_FILE_SIZE) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'ไฟล์ใหญ่เกิน 1MB (' + (sizeBytes / 1024).toFixed(0) + 'KB)' }));
          return;
        }
        // หา extension จาก mimeType หรือ filename
        let ext = '.bin';
        if (filename) { const m = filename.match(/\.(png|jpe?g|bmp|gif|webp|json)$/i); if (m) ext = '.' + m[1].toLowerCase(); }
        else if (mimeType) { for (const [e, mt] of Object.entries(MIME_MAP)) { if (mt === mimeType) { ext = e; break; } } }
        const savedName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
        fs.writeFileSync(path.join(CHAT_FILES_DIR, savedName), Buffer.from(data, 'base64'));
        log('📎 File uploaded:', savedName, '(' + (sizeBytes / 1024).toFixed(0) + 'KB)');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, filename: savedName }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    if (tooBig) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'ไฟล์ใหญ่เกิน limit' }));
    }
    return;
  }

  // ★★ GET /chat-files/:filename — ส่งไฟล์กลับ
  if (req.url.startsWith('/chat-files/') && req.method === 'GET') {
    const filename = path.basename(req.url.slice('/chat-files/'.length));
    if (/[\/\\]/.test(filename)) { res.writeHead(403); res.end('Forbidden'); return; }
    const filePath = path.join(CHAT_FILES_DIR, filename);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=604800, immutable' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // ★★ GET /feedback — หน้าเว็บแสดงรายการ feedback (admin: ลบ + เปลี่ยนสถานะ)
  if (req.url.startsWith('/feedback')) {
    const urlObj = new URL(req.url, 'http://localhost');
    const token = urlObj.searchParams.get('token');
    const isAdmin = (token === ADMIN_TOKEN);
    const STATUSES = ['pending', 'in_progress', 'done', 'wontfix'];
    const STATUS_LABELS = { pending: '⏳ รอการตรวจสอบ/แก้ไข', in_progress: '🔧 กำลังดำเนินการ', done: '✅ ตรวจสอบ/แก้ไขเรียบร้อย', wontfix: '🚫 ไม่มีอะไรต้องดำเนินการ' };
    const STATUS_COLORS = { pending: '#f39c12', in_progress: '#3498db', done: '#2ecc71', wontfix: '#e74c3c' };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Feedback</title>
<style>
body{background:#0a0a14;color:#e8e8e8;font-family:'Segoe UI',sans-serif;margin:20px}
.fb{background:#12121e;border:1px solid #2a2a3a;border-radius:10px;padding:16px;margin-bottom:12px}
.fb .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px}
.fb .meta{font-size:11px;color:#888}
.fb .msg{font-size:13px;white-space:pre-wrap;line-height:1.6;margin-bottom:8px}
.fb .btn{background:#333;color:#aaa;border:1px solid #555;border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;margin-right:4px}
.fb .btn:hover{background:#444}
.fb .btn.del{background:#4a2020;color:#ef9a9a;border-color:#6a3030}
.fb .btn.del:hover{background:#5a2525}
.log{background:#0d0d15;border-radius:8px;padding:10px;font-size:10px;max-height:300px;overflow-y:auto;white-space:pre;font-family:Consolas,monospace;color:#bbb;margin-top:8px;display:none}
h1{font-size:18px;color:#ffd54f}
.status{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600}
.status select{background:#2a2a3a;color:#e8e8e8;border:1px solid #555;border-radius:6px;padding:2px 6px;font-size:11px;cursor:pointer}
.admin-bar{background:#12121e;border:1px solid #2a2a3a;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:12px;color:#888}
.admin-bar input{background:#1a1a2e;border:1px solid #3a3f4b;border-radius:6px;color:#e8e8e8;padding:6px 10px;font-size:12px;width:250px}
</style></head><body>
<h1>💬 Feedback — <span id="cnt">${feedbackStore.length}</span> รายการ</h1>
${!isAdmin ? `<div class="admin-bar">🔑 Admin? เพิ่ม <code>?token=YOUR_TOKEN</code> ที่ URL เพื่อลบ/เปลี่ยนสถานะ</div>` : '<div class="admin-bar" style="color:#2ecc71">✅ Admin mode — ลบ + เปลี่ยนสถานะได้</div>'}
<div id="list"></div>
<script>
const DATA = ${JSON.stringify(feedbackStore)};
const IS_ADMIN = ${isAdmin};
const TOKEN = ${JSON.stringify(token || '')};
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
const STATUS_LABELS = ${JSON.stringify(STATUS_LABELS)};
const STATUS_COLORS = ${JSON.stringify(STATUS_COLORS)};
const STATUSES = ${JSON.stringify(STATUSES)};
const list = document.getElementById('list');
function esc(s) { return String(s || '').replace(/</g, '&lt;'); }
function render() {
  document.getElementById('cnt').textContent = DATA.length;
  list.innerHTML = DATA.slice().reverse().map((f, i) => \`
<div class="fb" id="fb\${i}">
  <div class="hd">
    <span class="meta">\${f.playerName || '?'} · v\${f.version} · \${f.map || '?'} · \${new Date(f.t).toLocaleString()}</span>
    <span style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
      <span class="status" style="background:\${STATUS_COLORS[f.status || 'pending']}22;color:\${STATUS_COLORS[f.status || 'pending']}">\${STATUS_LABELS[f.status || 'pending']}</span>
      \${IS_ADMIN ? \`<select onchange="setStatus(\${i}, this.value)" style="background:\${STATUS_COLORS[f.status || 'pending']}22;color:\${STATUS_COLORS[f.status || 'pending']}">
        \${STATUSES.map(s => \`<option value="\${s}" \${(f.status || 'pending') === s ? 'selected' : ''}>\${STATUS_LABELS[s]}</option>\`).join('')}
      </select>\` : ''}
      <button class="btn" onclick="cpMsg(\${i})" title="Copy ข้อความ">📋 ข้อความ</button>
      \${f.log ? \`<button class="btn" onclick="toggleLog(\${i})">📄 Log (\${f.log.length})</button><button class="btn" onclick="cpLog(\${i})">📋 Log</button>\` : ''}
      \${IS_ADMIN ? \`<button class="btn del" onclick="del(\${i})">🗑 ลบ</button>\` : ''}
    </span>
  </div>
  <div class="msg">\${esc(f.message)}</div>
  \${f.log ? \`<div class="log" id="log\${i}">\${f.log.map(l => \`[\${new Date(l.t).toLocaleTimeString()}] \${esc(l.m)}\`).join('\\n')}</div>\` : ''}
</div>\`).join('');
}
function sendWs(obj) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { ws.send(JSON.stringify(obj)); setTimeout(() => { ws.close(); resolve(); }, 500); };
    ws.onerror = reject;
  });
}
async function setStatus(i, status) {
  const idx = DATA.length - 1 - i;
  DATA[idx].status = status;
  render();
  try { await sendWs({ type: 'feedbackAdmin', action: 'status', token: TOKEN, id: DATA[idx].t, status }); } catch (e) { alert('ส่งไม่สำเร็จ: ' + e.message); }
}
async function del(i) {
  if (!confirm('ลบรายการนี้?')) return;
  const idx = DATA.length - 1 - i;
  const id = DATA[idx].t;
  DATA.splice(idx, 1);
  render();
  try { await sendWs({ type: 'feedbackAdmin', action: 'delete', token: TOKEN, id }); } catch (e) { alert('ส่งไม่สำเร็จ: ' + e.message); }
}
function cpMsg(i) { navigator.clipboard.writeText(DATA[DATA.length - 1 - i].message); event.target.textContent = '✓'; setTimeout(() => event.target.textContent = '📋 ข้อความ', 1500); }
function cpLog(i) { const f = DATA[DATA.length - 1 - i]; const txt = f.log.map(l => \`[\${new Date(l.t).toLocaleTimeString()}] \${l.m || ''}\`).join('\\n'); navigator.clipboard.writeText(txt); event.target.textContent = '✓'; setTimeout(() => event.target.textContent = '📋 Log', 1500); }
function toggleLog(i) { const el = document.getElementById('log' + i); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
render();
</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(MONITOR_HTML);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// WebSocket server บน server เดียวกัน
const wss = new WebSocketServer({ server });

// store: playerId -> { botWs, lastData, monitors: Set<ws> }
const bots = new Map();

// ★ Telegram configs — เก็บ per playerName { botToken, chatId }
//   persist ลงไฟล์ telegram-configs.json (ข้าม restart)
const TELEGRAM_CONFIG_FILE = path.join(__dirname, 'telegram-configs.json');
let telegramConfigs = {};
try {
  telegramConfigs = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf8'));
  log('📨 Telegram configs loaded:', Object.keys(telegramConfigs).length, 'users');
  cleanupTelegramConfigs();
} catch (_) { telegramConfigs = {}; }

function saveTelegramConfigs() {
  try { fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(telegramConfigs, null, 2)); } catch (_) {}
}

// ★★★ Chat Room — เก็บประวัติแชททั้งหมด (global, ไม่แบ่ง per player)
//   persist ลง chat-history.json (ข้าม restart) — rotate ที่ 10000 ข้อความ
const CHAT_HISTORY_FILE = path.join(__dirname, 'chat-history.json');
const CHAT_HISTORY_MAX = 10000;
const CHAT_SEND_MAX = 100;   // ส่งให้ client สูงสุด 100 ข้อความล่าสุด
let chatHistory = [];
try {
  chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
  if (!Array.isArray(chatHistory)) chatHistory = [];
  log('🗨️ Chat history loaded:', chatHistory.length, 'messages');
} catch (_) { chatHistory = []; }

function saveChatHistory() {
  try { fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory.slice(-CHAT_HISTORY_MAX))); } catch (_) {}
}

// ★ broadcast ข้อความไปทุก client ที่เชื่อมต่ออยู่ (bot + monitor)
function broadcastToAll(msg) {
  const str = JSON.stringify(msg);
  let count = 0;
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) { try { ws.send(str); count++; } catch (_) {} }
  });
  return count;
}

// ★ ส่งข้อความไป Telegram (เรียก Telegram Bot API ผ่าน HTTPS)
function sendTelegram(botToken, chatId, text) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 10000,
    }, (res) => {
      let body = ''; res.on('data', d => body += d);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(postData);
    req.end();
  });
}

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
}

// ★ sanitize playerName — ตัด null bytes + control characters
//   ปัญหา: SPAWN packet parse ดึง bytes เกินมา → ชื่อมี garbage (\x00\x05\x00...)
//   ทำให้ key ใน telegramConfigs ซ้ำซ้อน (ชื่อเดียวกันแต่ garbage ต่างกัน)
function cleanPlayerName(name) {
  if (!name) return null;
  const cleaned = String(name).replace(/[\x00-\x1f\x7f]/g, '').trim();
  return cleaned || null;
}

// ★ cleanup telegramConfigs — merge entries ที่มี garbage ลงในชื่อสะอาด
//   รันครั้งเดียวตอน start (ป้องกันขยะสะสม)
function cleanupTelegramConfigs() {
  let merged = {};
  let removed = 0;
  for (const [name, cfg] of Object.entries(telegramConfigs)) {
    const clean = cleanPlayerName(name);
    if (clean && clean !== name) {
      // garbage name → merge เข้าชื่อสะอาด (ถ้ายังไม่มี)
      if (!merged[clean]) merged[clean] = cfg;
      removed++;
    } else if (clean) {
      merged[clean] = cfg;
    }
  }
  if (removed > 0) {
    telegramConfigs = merged;
    saveTelegramConfigs();
    log(`📨 Telegram configs cleanup: removed ${removed} garbage entries`);
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  const origin = req.headers.origin || req.headers['x-forwarded-origin'] || 'unknown';
  ws.isAlive = true;
  ws.role = null;       // 'bot' | 'monitor'
  ws.playerId = null;
  ws.origin = origin;   // ★ เก็บ Origin (โดเมนเว็บเกมที่รัน userscript)

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    // ---- Bot client register ----
    if (msg.type === 'register' && msg.playerId) {
      ws.role = 'bot';
      ws.playerId = String(msg.playerId);
      ws.playerName = cleanPlayerName(msg.playerName) || ws.playerName || null;   // ★ เก็บ playerName (sanitize)
      let entry = bots.get(ws.playerId);
      if (!entry) {
        entry = { botWs: null, lastData: null, monitors: new Set() };
        bots.set(ws.playerId, entry);
      }
      // ถ้ามี bot เก่าอยู่ → ปิดการเชื่อมต่อเก่า
      if (entry.botWs && entry.botWs !== ws && entry.botWs.readyState === 1) {
        try { entry.botWs.close(); } catch (_) {}
      }
      entry.botWs = ws;
      log(`🤖 Bot registered: ${msg.playerName || ''} (${ws.playerId}) from ${ip} | origin: ${origin}`);
      // ส่งข้อมูลล่าสุด (ถ้ามี) กลับไป
      if (entry.lastData) {
        try { ws.send(JSON.stringify({ type: 'data', ...entry.lastData })); } catch (_) {}
      }
      return;
    }

    // ---- Bot client data ----
    if (msg.type === 'data' && ws.role === 'bot') {
      const entry = bots.get(ws.playerId);
      if (!entry) return;
      entry.lastData = msg.payload || msg;
      // forward ให้ทุก monitor ที่ subscribe player_id นี้
      const dataStr = JSON.stringify({ type: 'data', ...entry.lastData });
      for (const monitor of entry.monitors) {
        if (monitor.readyState === 1) {
          try { monitor.send(dataStr); } catch (_) {}
        }
      }
      return;
    }

    // ---- Monitor client subscribe ----
    if (msg.type === 'subscribe' && msg.playerId) {
      ws.role = 'monitor';
      // ★★ unsubscribe อันเก่าก่อน (กันข้อมูลสลับเมื่อเปลี่ยน player_id)
      //   ปัญหา: monitor subscribe ใหม่แต่ไม่ลบออกจาก entry เก่า → รับข้อมูล 2 bot พร้อมกัน
      if (ws.playerId && ws.playerId !== String(msg.playerId)) {
        const oldEntry = bots.get(ws.playerId);
        if (oldEntry) oldEntry.monitors.delete(ws);
      }
      ws.playerId = String(msg.playerId);
      let entry = bots.get(ws.playerId);
      if (!entry) {
        entry = { botWs: null, lastData: null, monitors: new Set() };
        bots.set(ws.playerId, entry);
      }
      entry.monitors.add(ws);
      log(`🖥️ Monitor subscribed: ${ws.playerId} from ${ip}`);
      // ส่งข้อมูลล่าสุด (ถ้ามี)
      if (entry.lastData) {
        try { ws.send(JSON.stringify({ type: 'data', ...entry.lastData })); } catch (_) {}
      } else {
        try { ws.send(JSON.stringify({ type: 'waiting', message: 'ยังไม่มีบอทเชื่อมต่อ player_id นี้' })); } catch (_) {}
      }
      return;
    }

    // ---- Monitor client list bots (admin only) ----
    if (msg.type === 'list') {
      ws.role = 'monitor';
      // ★ ต้องส่ง token ที่ตรงกับ ADMIN_TOKEN ถึงจะเห็นรายชื่อบอททั้งหมด
      if (msg.token !== ADMIN_TOKEN) {
        try { ws.send(JSON.stringify({ type: 'botList', bots: [], error: 'unauthorized' })); } catch (_) {}
        return;
      }
      ws.isAdmin = true;
      const list = [];
      for (const [pid, entry] of bots) {
        const isOnline = entry.botWs && entry.botWs.readyState === 1;
        const d = entry.lastData || {};
        // ★ hasTelegram: เช็คทั้ง lastData.player.name และ ws.playerName (fallback)
        const tgName = cleanPlayerName(d.player?.name) || (entry.botWs ? entry.botWs.playerName : null) || null;
        list.push({
          playerId: pid,
          online: !!isOnline,
          lastSeen: d.t || 0,
          name: d.player?.name || (entry.botWs ? entry.botWs.playerName : null) || '?',
          map: d.map || '?',
          version: d.version || '?',
          elapsedMs: d.stats?.elapsedMs || 0,
          baseExp: d.stats?.baseExpGained || 0,
          zeny: d.zeny ?? null,
          gameServer: d.gameServer || '',
          hasTelegram: !!(tgName && telegramConfigs[tgName]),
          viewers: entry.monitors ? entry.monitors.size : 0,
        });
      }
      // ★ เรียง: online ก่อน offline, offline เรียงตาม lastSeen ล่าสุดก่อน
      list.sort((a, b) => (b.online - a.online) || (b.lastSeen - a.lastSeen));
      try { ws.send(JSON.stringify({ type: 'botList', bots: list })); } catch (_) {}
      return;
    }

    // ---- Bot client setTelegram config (เก็บ botToken + chatId per playerName) ----
    if (msg.type === 'setTelegram' && ws.role === 'bot' && ws.playerId) {
      const entry = bots.get(ws.playerId);
      // ★ เอา playerName จาก lastData ก่อน ถ้าไม่มี → เอาจาก ws (register ส่งมาแล้ว)
      const playerName = cleanPlayerName(entry?.lastData?.player?.name) || ws.playerName || null;
      if (!playerName) { try { ws.send(JSON.stringify({ type: 'telegramSaved', ok: false, error: 'ยังไม่รู้ชื่อตัวละคร' })); } catch (_) {} return; }
      // ★ เก็บ token + chatId (ถ้าส่งมาว่าง = ลบ config)
      if (msg.botToken && msg.chatId) {
        telegramConfigs[playerName] = { botToken: msg.botToken, chatId: String(msg.chatId) };
      } else {
        delete telegramConfigs[playerName];
      }
      saveTelegramConfigs();
      log(`📨 Telegram config saved for ${playerName}`);
      try { ws.send(JSON.stringify({ type: 'telegramSaved', ok: true })); } catch (_) {}
      return;
    }

    // ---- Bot client request current telegram config (สำหรับแสดงใน UI) ----
    if (msg.type === 'getTelegram' && ws.role === 'bot' && ws.playerId) {
      const entry = bots.get(ws.playerId);
      const playerName = cleanPlayerName(entry?.lastData?.player?.name) || ws.playerName || null;
      const cfg = playerName ? telegramConfigs[playerName] : null;
      try { ws.send(JSON.stringify({ type: 'telegramConfig', configured: !!cfg, chatId: cfg?.chatId || null })); } catch (_) {}
      return;
    }

    // ---- Bot client alert → forward ไป Telegram (ถ้ามี config) ----
    if (msg.type === 'alert' && ws.role === 'bot' && ws.playerId) {
      const entry = bots.get(ws.playerId);
      const playerName = cleanPlayerName(entry?.lastData?.player?.name) || ws.playerName || '?';
      const cfg = telegramConfigs[playerName];
      if (cfg && cfg.botToken && cfg.chatId && msg.msg) {
        const text = `<b>${playerName}</b>\n${msg.msg}`;
        sendTelegram(cfg.botToken, cfg.chatId, text).then((ok) => {
          if (!ok) log(`⚠️ Telegram send failed for ${playerName}`);
        });
      }
      return;
    }

    // ---- Monitor client → command (toggle on/off / move) ไป bot ----
    if (msg.type === 'command' && msg.playerId && ws.role === 'monitor') {
      const entry = bots.get(String(msg.playerId));
      if (entry && entry.botWs && entry.botWs.readyState === 1) {
        // ★ ฝัง sourceMonitorId เพื่อ forward ack กลับไป monitor ที่สั่ง
        // ★★ forward x, y ด้วย (สำหรับ move command — คลิกแผนที่)
        // ★★ forward itemId ด้วย (สำหรับ item action — วน เก็บ→ขาย→ฝาก จาก monitor)
        const fwd = { type: 'command', system: msg.system, action: msg.action, _fromMonitor: ws._monitorId || null };
        if (msg.x != null) fwd.x = msg.x;
        if (msg.y != null) fwd.y = msg.y;
        if (msg.targetId != null) fwd.targetId = msg.targetId;
        if (msg.itemId != null) fwd.itemId = msg.itemId;
        entry.botWs.send(JSON.stringify(fwd));
        log(`🎮 Command → bot ${msg.playerId}: ${msg.system} ${msg.action}` + (msg.x != null ? ` (${msg.x},${msg.y})` : '') + (msg.itemId != null ? ` itemId=${msg.itemId}` : ''));
      }
      return;
    }

    // ---- Monitor client → chat ไป bot ----
    if (msg.type === 'chat' && msg.playerId && ws.role === 'monitor') {
      const entry = bots.get(String(msg.playerId));
      if (entry && entry.botWs && entry.botWs.readyState === 1) {
        entry.botWs.send(JSON.stringify({ type: 'chat', message: String(msg.message || '').slice(0, 200), chatType: msg.chatType || 0, _fromMonitor: ws._monitorId || null }));
        log(`💬 Chat → bot ${msg.playerId}: ${(msg.message || '').slice(0, 50)}`);
      }
      return;
    }

    // ---- Bot → ack (forward กลับไป monitor ที่สั่ง) ----
    if ((msg.type === 'commandAck' || msg.type === 'chatAck') && ws.role === 'bot' && ws.playerId) {
      const entry = bots.get(ws.playerId);
      if (entry && entry.monitors) {
        const ack = JSON.stringify(msg);
        for (const mon of entry.monitors) {
          if (mon.readyState === 1) { try { mon.send(ack); } catch (_) {} }
        }
      }
      return;
    }

    // ---- ★★★ Chat Room (global — ทุก client คุยกันได้) ----
    //   roomJoin: ขอประวัติ 100 ข้อความล่าสุด
    // ★★ Feedback จาก userscript — เก็บลง store
    if (msg.type === 'feedback' && msg.message) {
      const fb = {
        t: Date.now(),
        message: String(msg.message).slice(0, 5000),
        log: Array.isArray(msg.log) ? msg.log.slice(-500) : null,
        version: String(msg.version || '').slice(0, 20),
        map: String(msg.map || '').slice(0, 30),
        playerName: cleanPlayerName(msg.playerName) || 'ผู้ไม่ประสงค์ออกนาม',
        status: 'pending',
      };
      feedbackStore.push(fb);
      if (feedbackStore.length > 200) feedbackStore = feedbackStore.slice(-200);
      saveFeedback();
      log(`💬 Feedback [${fb.playerName}] v${fb.version}: ${fb.message.slice(0, 60)}`);
      return;
    }
    // ★★ Feedback admin — เปลี่ยนสถานะ / ลบ (ต้องมี token)
    if (msg.type === 'feedbackAdmin' && msg.token === ADMIN_TOKEN) {
      const idx = feedbackStore.findIndex(f => f.t === msg.id);
      if (msg.action === 'status' && idx >= 0 && msg.status) {
        feedbackStore[idx].status = String(msg.status);
        saveFeedback();
        log(`💬 Feedback #${msg.id} → status: ${msg.status}`);
      } else if (msg.action === 'delete' && idx >= 0) {
        feedbackStore.splice(idx, 1);
        saveFeedback();
        log(`💬 Feedback #${msg.id} deleted`);
      }
      return;
    }
    if (msg.type === 'roomJoin') {
      const recent = chatHistory.slice(-CHAT_SEND_MAX);
      try { ws.send(JSON.stringify({ type: 'roomHistory', messages: recent })); } catch (_) {}
      return;
    }
    //   roomSend: ส่งข้อความใหม่ → store + broadcast ทุก client
    if (msg.type === 'roomSend') {
      const text = String(msg.message || '').trim().slice(0, 200);
      const displayName = String(msg.displayName || 'ผู้ไม่ประสงค์ออกนาม').trim().slice(0, 30) || 'ผู้ไม่ประสงค์ออกนาม';
      // ★★ attachment (รูป/ไฟล์) — ไม่ต้องมี text ถ้ามี attachment
      let attachment = null;
      if (msg.attachment && typeof msg.attachment === 'object') {
        const at = msg.attachment;
        if (at.type === 'text' && typeof at.text === 'string') {
          // ★★ text attachment — เก็บใน message ไม่ต้อง upload ไฟล์ (สูงสุด 50KB)
          const lines = (at.text.match(/\n/g) || []).length + 1;
          attachment = { type: 'text', text: at.text.slice(0, 51200), lines };
        } else if (at.filename && at.type) {
          attachment = { type: at.type, filename: String(at.filename).slice(0, 100), mimeType: String(at.mimeType || '').slice(0, 50) };
        }
      }
      if (!text && !attachment) return;   // ต้องมีอย่างน้อย text หรือ attachment
      // ★ เติม metadata ฝั่ง relay: botName + version จากข้อมูลที่ register ไว้
      const entry = ws.playerId ? bots.get(ws.playerId) : null;
      const botName = cleanPlayerName(entry?.lastData?.player?.name) || ws.playerName || '';
      const version = entry?.lastData?.version || '';
      const msgObj = { t: Date.now(), displayName, botName, version, text, attachment };
      // ★★ replyTo — อ้างอิงข้อความเดิม (quote reply)
      if (msg.replyTo && typeof msg.replyTo === 'object' && msg.replyTo.displayName) {
        msgObj.replyTo = { displayName: String(msg.replyTo.displayName).slice(0, 30), text: String(msg.replyTo.text || '').slice(0, 100) };
      }
      chatHistory.push(msgObj);
      if (chatHistory.length > CHAT_HISTORY_MAX) chatHistory = chatHistory.slice(-CHAT_HISTORY_MAX);
      saveChatHistory();
      broadcastToAll({ type: 'roomMessage', message: msgObj });
      log(`🗨️ RoomChat [${displayName}] (${botName || ws.role}): ${attachment ? '[📎 ' + attachment.type + ']' : ''} ${text.slice(0, 60)}`);
      return;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'bot' && ws.playerId) {
      const entry = bots.get(ws.playerId);
      if (entry && entry.botWs === ws) {
        entry.botWs = null;
        log(`🤖 Bot disconnected: ${ws.playerId}`);
      }
    } else if (ws.role === 'monitor' && ws.playerId) {
      const entry = bots.get(ws.playerId);
      if (entry) entry.monitors.delete(ws);
      log(`🖥️ Monitor disconnected from ${ip}`);
    }
  });

  ws.on('error', () => {});
});

// Heartbeat — ล้าง connection ที่ตาย
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, 30000);

// ★★ Bot entry cleanup — ลบ entries เฉพาะที่ bot ตายนาน > 1 ชั่วโมง (ทุก 5 นาที)
//   เก็บไว้ให้ admin กดดูย้อนหลังได้ แม้ไม่มี monitor ดูอยู่
const botCleanup = setInterval(() => {
  let removed = 0;
  for (const [pid, entry] of bots) {
    const botDead = !entry.botWs || entry.botWs.readyState !== 1;
    const lastDataOld = !entry.lastData || (Date.now() - (entry.lastData.t || 0) > 3600000);  // > 1 ชั่วโมง
    if (botDead && lastDataOld) {
      bots.delete(pid);
      removed++;
    }
  }
  if (removed > 0) log(`🧹 Bot cleanup: removed ${removed} entries offline > 1hr (total: ${bots.size})`);
}, 300000);

server.listen(PORT, () => {
  log(`✅ RO Monitor Relay running on port ${PORT}`);
  log(`   🌐 Monitor web:  http://localhost:${PORT}/`);
  log(`   🤖 Bot connect:   ws://localhost:${PORT}`);
  log(`   🖥️ Monitor WS:    ws://localhost:${PORT} (send {type:'subscribe', playerId:'...'})`);
});

process.on('SIGINT', () => { clearInterval(heartbeat); clearInterval(botCleanup); wss.close(); server.close(); process.exit(0); });
