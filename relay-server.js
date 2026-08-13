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
const server = http.createServer((req, res) => {
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
        if (entry.botWs && entry.botWs.readyState === 1) {
          const d = entry.lastData || {};
          // ★ hasTelegram: เช็คทั้ง lastData.player.name และ ws.playerName (fallback)
          //   เหมือน setTelegram handler — กันกรณีชื่อใน payload ยังเป็น null หรือต่างจากตอน save
          const tgName = cleanPlayerName(d.player?.name) || entry.botWs.playerName || null;
          list.push({
            playerId: pid,
            name: d.player?.name || entry.botWs.playerName || '?',
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
      }
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
        const fwd = { type: 'command', system: msg.system, action: msg.action, _fromMonitor: ws._monitorId || null };
        if (msg.x != null) fwd.x = msg.x;
        if (msg.y != null) fwd.y = msg.y;
        entry.botWs.send(JSON.stringify(fwd));
        log(`🎮 Command → bot ${msg.playerId}: ${msg.system} ${msg.action}` + (msg.x != null ? ` (${msg.x},${msg.y})` : ''));
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
    if (msg.type === 'roomJoin') {
      const recent = chatHistory.slice(-CHAT_SEND_MAX);
      try { ws.send(JSON.stringify({ type: 'roomHistory', messages: recent })); } catch (_) {}
      return;
    }
    //   roomSend: ส่งข้อความใหม่ → store + broadcast ทุก client
    if (msg.type === 'roomSend') {
      const text = String(msg.message || '').trim().slice(0, 200);
      const displayName = String(msg.displayName || 'ผู้ไม่ประสงค์ออกนาม').trim().slice(0, 30) || 'ผู้ไม่ประสงค์ออกนาม';
      if (!text) return;
      // ★ เติม metadata ฝั่ง relay: botName + version จากข้อมูลที่ register ไว้
      const entry = ws.playerId ? bots.get(ws.playerId) : null;
      const botName = cleanPlayerName(entry?.lastData?.player?.name) || ws.playerName || '';
      const version = entry?.lastData?.version || '';
      const msgObj = { t: Date.now(), displayName, botName, version, text };
      chatHistory.push(msgObj);
      if (chatHistory.length > CHAT_HISTORY_MAX) chatHistory = chatHistory.slice(-CHAT_HISTORY_MAX);
      saveChatHistory();
      broadcastToAll({ type: 'roomMessage', message: msgObj });
      log(`🗨️ RoomChat [${displayName}] (${botName || ws.role}): ${text.slice(0, 60)}`);
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

server.listen(PORT, () => {
  log(`✅ RO Monitor Relay running on port ${PORT}`);
  log(`   🌐 Monitor web:  http://localhost:${PORT}/`);
  log(`   🤖 Bot connect:   ws://localhost:${PORT}`);
  log(`   🖥️ Monitor WS:    ws://localhost:${PORT} (send {type:'subscribe', playerId:'...'})`);
});

process.on('SIGINT', () => { clearInterval(heartbeat); wss.close(); server.close(); process.exit(0); });
