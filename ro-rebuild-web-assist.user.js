// ==UserScript==
// @name         RO Rebuild Web Assist
// @namespace    ro-rebuild-web-assist
// @version      4.63.0
// @description  ผู้ช่วยเล่นเว็บ client RO — auto-loot, auto-heal, auto-combat, auto-rest + อัปเดตอัตโนมัติ (Unity WebGL / WebSocket)
// @match        *://*.rayrag.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/superogira/ro-rebuild-web-assist/main/ro-rebuild-web-assist.user.js
// @downloadURL  https://raw.githubusercontent.com/superogira/ro-rebuild-web-assist/main/ro-rebuild-web-assist.user.js
// ==/UserScript==

/* ==========================================================================
   RO REBUILD WEB ASSIST  —  ผู้ช่วยเล่นสำหรับเว็บ client (Unity WebGL)
   ==========================================================================

   มี 2 ระบบทำงานแยกกัน (เปิด/ปิดเป็นอิสระ):

     1) AUTO-LOOT  — เก็บของที่ตกจากมอนที่เราฆ่าเอง
     2) AUTO-HEAL  — ใช้ขวดยาอัตโนมัติเมื่อเลือดต่ำกว่า % ที่ตั้ง

   --------------------------------------------------------------------------
   วิธีติดตั้ง
   --------------------------------------------------------------------------
   ทางเลือก A — Tampermonkey (แนะนำ)
     1. ติดตั้งส่วนเสริม "Tampermonkey"
     2. คลิกไอคอน Tampermonkey → Create a new script
     3. ลบเนื้อหาเดิม → วางสคริปต์นี้ทั้งหมด → Ctrl+S บันทึก
     4. รีเฟรชหน้าเว็บเกม (ต้องติดตั้งก่อนเข้าเกม เพราะต้องดัก WebSocket ตั้งแต่ต้น)

   ทางเลือก B — Console (ชั่วคราว)
     1. เปิดหน้าเว็บเกม แต่ "ยังไม่คลิกเข้าเกม"
     2. กด F12 → แท็บ Console
     3. วางสคริปต์นี้ทั้งหมด → Enter
     4. ค่อยคลิกเข้าเกม/เลือกตัวละคร
     (หมายเหตุ: ใช้วิธีนี้ต้องวางใหม่ทุกครั้งที่รีเฟรช)

   --------------------------------------------------------------------------
   ⭐ ที่ใช้บ่อย (พิมพ์ใน console)
   --------------------------------------------------------------------------
     ASSIST.status()           // ดูสถานะทั้งหมด (HP%, คิวของ, ค่าที่ตั้งไว้)
     ASSIST.help()             // ดูคำสั่งทั้งหมด

     // Auto-Loot (เปิดอยู่ default)
     ASSIST.lootOn()  /  ASSIST.lootOff()

     // Auto-Heal ★ DEFAULT = OFF (ยังไม่สมบูรณ์)
     //   ต้องตั้ง item ก่อน แล้วเปิดเอง:
     ASSIST.setHealItems(501,502,503)   // ตั้งไอเทม (จะเปิด auto-heal ให้อัตโนมัติ)
     ASSIST.setHealAt(50)               // เลือดต่ำกว่า 50% → ใช้ยา
     ASSIST.healOn()  /  ASSIST.healOff()

     // Warp-to-Loot ★ DEFAULT = OFF (ส่ง packet วาร์ปจริง)
     //   เก็บไม่ได้ครบ 6 ครั้ง → วาร์ปไปที่ไอเท็ม (กรณีติดกำแพง/หน้าผา)
     ASSIST.warpLootOn() / ASSIST.warpLootOff()

   ==========================================================================
   ส่วนที่ 1 — AUTO-HEAL
   ==========================================================================

   ทำงานยังไง?
     • อ่าน HP จาก packet ของตัวเอง (opcode 0x25 STAT)
     • พอ HP% ต่ำกว่าค่าที่ตั้ง (เช่น 50%) → สั่งใช้ item ที่กำหนด (packet 0x2f)
     • เลือก item 2 โหมด:
         'order'   = ใช้ item ตัวเดิมซ้ำจนกว่าจะหมด แล้วค่อยไปตัวถัดไป
         'random'  = สุ่มเลือก item ใหม่ทุกครั้ง
     • ★ วิธีรู้ว่า item "หมด": ใช้แล้ว HP ไม่ขยับเลย → ถือว่าหมด → ใช้ตัวถัดไป "ทันที"
       (ไม่ mark ว่าอันไหนหมดถาวร เพราะผู้เล่นอาจไปเก็บ/ซื้อเพิ่มมาแล้ว → รอบถัดไปที่วนกลับมาจะลองใหม่)
     • มีดีเลย์ระหว่างการใช้แต่ละครั้ง (ตั้งได้)

   คำสั่ง console (พิมพ์ได้เลย มีผลทันที):
     ASSIST.setHealAt(50)              // เปิด auto-heal + ตั้ง threshold 50%
     ASSIST.setHealItems(501, 502)     // เซ็ตรายการ item id ที่จะใช้ (ทับของเดิม)
     ASSIST.addHealItem(503)           // เพิ่ม item เข้ารายการ
     ASSIST.setHealMode('order')       // 'order' = ใช้ตัวเดิมจนหมดแล้วข้าม, 'random' = สุ่ม
     ASSIST.setHealDelay(800)          // ดีเลย์ 800ms ระหว่างการใช้แต่ละครั้ง
     ASSIST.healOn() / ASSIST.healOff()    // เปิด/ปิด

   ==========================================================================
   ส่วนที่ 2 — AUTO-LOOT
   ==========================================================================

   ทำงานยังไง?
     • ตรวจจับของที่ตกจากมอนที่ "เราฆ่าเอง" (สัญญาณ EXP + ระยะใกล้ตัว)
     • ส่งคำสั่งเก็บของ (packet 0x52)
     • เก็บไม่ได้ → ลองใหม่สูงสุด 6 ครั้ง ห่างกัน 1.2 วิ พร้อมสลับไปเก็บชิ้นอื่นก่อน
     • ครบ 6 ครั้งยังไม่ได้ → ปล่อยทิ้ง
     • ★ server ทำ walk-and-pickup เอง: ส่ง packet เดียว server เดินตัวละครไปเก็บเอง (รองรับนักธนูฆ่าไกล)
     • มีระบบกรอง: เก็บทั้งหมด / เก็บเฉพาะบางชิ้น / ไม่เก็บบางชิ้น

   คำสั่ง console:
     ASSIST.setLootMode('all')         // 'all' = เก็บหมด, 'only' = เก็บเฉพาะ, 'except' = ยกเว้น
     ASSIST.addLootOnly(909, 512)      // เพิ่ม item สำหรับโหมด 'only'
     ASSIST.addLootExcept(909)         // เพิ่ม item สำหรับโหมด 'except'
     ASSIST.clearLootOnly()            // ล้างรายการ 'only'
     ASSIST.clearLootExcept()          // ล้างรายการ 'except'
     ASSIST.name(935, 'Feather')       // ตั้งชื่อ item ให้อ่าน log ง่าย
     ASSIST.lootOn() / ASSIST.lootOff()    // เปิด/ปิด

   --------------------------------------------------------------------------
   เคล็ดลับหา "item id"
   --------------------------------------------------------------------------
   พิมพ์ ASSIST.status() ตอนมีของ/เลือด → จะเห็นชื่อแบบ "item_935" หรือเปิด inventory
   ในเกมแล้วเอา id มาใส่ในคำสั่งด้านบน

   ตัวอย่าง item id ทั่วไป (อ้างอิง RO มาตรฐาน — อาจต่างในแต่ละเซิร์ฟ):
     501 = Red Potion,    502 = Yellow Potion,   503 = White Potion
     504 = Blue Potion,   505 = Wing of Fly,     601 = Wing of Butterfly
     909 = Jellopy,       512 = Apple
   ========================================================================== */

(function () {
  if (window.__ASSIST) { console.warn('[ASSIST] รันอยู่แล้ว'); return; }
  window.__ASSIST = true;

  // ============================================================
  //  VERSION + config persistence (localStorage)
  // ============================================================
  const VERSION = '4.63.0';
  const GITHUB_RAW = 'https://raw.githubusercontent.com/superogira/ro-rebuild-web-assist/main/ro-rebuild-web-assist.user.js';
  // ★ Feedback — ส่งปัญหา/ข้อเสนอแนะถึงผู้พัฒนาผ่าน Telegram
  const FEEDBACK_BOT_TOKEN = '7932077955:AAEc2u3FaKLY-6iY6VjseK5_GPJXgYK3ORA';
  const FEEDBACK_CHAT_ID = '-5021728172';
  const CFG_STORAGE_KEY = 'roAssistConfig_v1';
  // keys ที่บันทึก/โหลด (boolean/number/array/string — ไม่เก็บ function หรือ object ซ้อน)
  const PERSIST_KEYS = [
    'healEnabled', 'healAtPercent', 'healItems', 'healMode', 'healDelayMs', 'healAtMax',
    'buffEnabled', 'buffItems', 'buffRebuffDelayMs', 'autoClearConsoleMin', 'monitorServerEnabled', 'monitorServerUrl', 'monitorSendIntervalMs',
    'skillEnabled', 'skills', 'disabledSkillIds',
    'lootEnabled', 'lootDelayAfterDropMs', 'lootUseKillPos', 'pickRadiusKill', 'filter', 'sendThrottleMs',
    'warpLootEnabled',
    'combatEnabled', 'targetWhitelist', 'targetBlacklist', 'attackRange', 'rangedAttackRange',
    'maxAcquireDistance', 'searchRadii', 'maxChaseDistance', 'antiKS', 'avoidOtherPlayers', 'targetLowestHpFirst',
    'fleeOnMobCount', 'fleeOnAggroCount', 'fleeOnProximityCount', 'fleeOnProximityRadius', 'fleeMonsters', 'fleeMonsterRadius', 'maxEngageSecSlow', 'slowMonsterSubIds',
    'wanderEnabled', 'warpFindEnabled', 'warpToMonster', 'stuckWarpOnAbandon', 'warpToBoss', 'warpToMiniBoss', 'bossAlertRadius',
    'restEnabled', 'restHpPercent', 'restUntilPercent', 'restMaxSec', 'postCombatDelayMs', 'autoRespawnEnabled', 'autoRespawnDelayMs', 'telegramAlertCard', 'telegramAlertFlee', 'telegramAlertBotMention', 'telegramAlertNearby', 'telegramAlertWhisper', 'telegramBotToken', 'telegramChatId',
    'sellEnabled', 'sellNpcName', 'sellNpcMap', 'sellNpcX', 'sellNpcY', 'sellIntervalMin', 'sellOnFull', 'sellItemIds',
    'storageEnabled', 'kafraName', 'kafraMap', 'kafraMapX', 'kafraMapY', 'kafraChoice', 'depositOnFull', 'depositAfterSell', 'depositItemIds',
    'farmMap', 'farmMapX', 'farmMapY', 'warpBackToFarm',
    'navRecording', 'navMergeRadius', 'navWanderUseNav', 'navWanderMode',
    'itemNames',
  ];
  function saveConfig() {
    try {
      const out = {};
      for (const k of PERSIST_KEYS) if (k in CFG) out[k] = CFG[k];
      // ★ sort item ID arrays ตามเลขไอดี (เวลาเขียน localStorage/export จะได้มองง่าย)
      const sortNum = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => a - b) : arr;
      if (out.healItems) out.healItems = sortNum(out.healItems);
      if (out.sellItemIds) out.sellItemIds = sortNum(out.sellItemIds);
      if (out.depositItemIds) out.depositItemIds = sortNum(out.depositItemIds);
      if (out.buffItems && Array.isArray(out.buffItems)) out.buffItems = [...out.buffItems].sort((a, b) => a.itemId - b.itemId);
      localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(out));
    } catch (e) { /* localStorage อาจถูกบล็อก — ข้าม */ }
  }
  function loadConfig() {
    try {
      const raw = localStorage.getItem(CFG_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const k of PERSIST_KEYS) if (k in saved) CFG[k] = saved[k];
      // ★ migrate: monitorSendIntervalMs เก่า default 3000 → ใหม่ 1000
      //   ถ้า saved = 3000 (= old default) → ปรับเป็น 1000 (new default)
      //   ถ้า saved เป็นค่าอื่นที่ผู้ใช้ตั้งเอง → เก็บไว้
      if (saved.monitorSendIntervalMs === 3000) { CFG.monitorSendIntervalMs = 1000; log('⚙️ migrate monitorSendIntervalMs: 3000 → 1000'); }
      log('💾 โหลดค่าที่บันทึกไว้จากเครื่อง (' + PERSIST_KEYS.filter(k => k in saved).length + ' รายการ)');
    } catch (e) { /* parse fail — ใช้ default */ }
  }
  // debounce save (กันเขียนถี่เกินไป)
  let saveTimer = null;
  function saveConfigDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 800);
  }

  // ============================================================
  //  AUTO-BUFF persistence — เก็บเวลาใช้ buff ล่าสุดข้าม session
  //    (mirror bot.js:207-231 serializeUseTimes)
  //    กัน buff หายเมื่อ refresh หน้าเว็บ → บัพจะใช้ใหม่ทันทีถ้าหมดเวลา
  // ============================================================
  const BUFF_TIMES_KEY = 'roAssistBuffTimes_v1';
  const lastBuffUse = new Map();   // itemId → timestamp (ms) ใช้ครั้งล่าสุด
  function loadBuffTimes() {
    try {
      const raw = localStorage.getItem(BUFF_TIMES_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [id, ts] of Object.entries(obj)) lastBuffUse.set(Number(id), Number(ts) || 0);
      log('✨ โหลดเวลา buff ล่าสุด:', lastBuffUse.size, 'รายการ');
    } catch (e) { /* ignore */ }
  }
  function saveBuffTimes() {
    try {
      const obj = {};
      for (const [id, ts] of lastBuffUse) obj[id] = ts;
      localStorage.setItem(BUFF_TIMES_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }
  let buffSaveTimer = null;
  function saveBuffTimesDebounced() {
    if (buffSaveTimer) clearTimeout(buffSaveTimer);
    buffSaveTimer = setTimeout(saveBuffTimes, 1000);
  }

  // ============================================================
  //  Item database (โหลดจาก GitHub raw + cache localStorage)
  // ============================================================
  const ITEMS_CSV_URL = GITHUB_RAW.replace('/ro-rebuild-web-assist.user.js', '/items.csv');
  const ITEMS_META_URL = GITHUB_RAW.replace('/ro-rebuild-web-assist.user.js', '/items/meta.json');
  const ITEMS_ICON_URL = GITHUB_RAW.replace('/ro-rebuild-web-assist.user.js', '/items/small/');
  const ITEMDB_CACHE_KEY = 'roAssistItemDB_v1';
  const itemDB = { names: {}, prices: {}, loaded: false };
  async function loadItemDB() {
    if (itemDB.loaded) return;
    // ลอง cache ก่อน
    try {
      const cached = localStorage.getItem(ITEMDB_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.names && parsed.prices) {
          itemDB.names = parsed.names;
          itemDB.prices = parsed.prices;
          itemDB.loaded = true;
          log('🗃️ โหลด item DB จาก cache (' + Object.keys(parsed.names).length + ' รายการ)');
          return;
        }
      }
    } catch (e) {}
    // โหลดจาก GitHub
    try {
      log('🗃️ กำลังโหลด item DB จาก GitHub...');
      const [csvRes, metaRes] = await Promise.all([fetch(ITEMS_CSV_URL), fetch(ITEMS_META_URL)]);
      if (csvRes.ok) {
        const csv = await csvRes.text();
        for (const line of csv.split('\n')) {
          const c = line.indexOf(',');
          if (c > 0) { const id = line.slice(0, c).trim(); const nm = line.slice(c + 1).trim(); if (id && nm) itemDB.names[id] = nm; }
        }
      }
      if (metaRes.ok) {
        const meta = await metaRes.json();
        for (const [id, info] of Object.entries(meta)) {
          if (info && info.buyPrice != null) itemDB.prices[id] = info.buyPrice;
        }
      }
      itemDB.loaded = true;
      // cache ลง localStorage (กันโหลดใหม่ทุกครั้ง)
      try { localStorage.setItem(ITEMDB_CACHE_KEY, JSON.stringify({ names: itemDB.names, prices: itemDB.prices })); } catch (e) {}
      log('🗃️ โหลด item DB สำเร็จ: ' + Object.keys(itemDB.names).length + ' ชื่อ, ' + Object.keys(itemDB.prices).length + ' ราคา');
    } catch (e) {
      log('⚠️ โหลด item DB ล้มเหลว (offline?) — ใช้ชื่อเริ่มต้น');
      itemDB.loaded = true;   // ไม่ลองใหม่
    }
  }
  // ชื่อ item จาก DB (fallback ไป CFG.itemNames หรือ item_<id>)
  function itemDisplayName(id) {
    const k = String(id);
    if (itemDB.names[k]) return itemDB.names[k];
    if (CFG.itemNames[id]) return CFG.itemNames[id];
    return 'item_' + id;
  }
  // ราคา item (buyPrice) — 0 ถ้าไม่มีข้อมูล
  function itemPrice(id) { return itemDB.prices[String(id)] || 0; }
  // URL รูป item (lazy-load จาก GitHub raw)
  function itemIconUrl(id) {
    // ★ Card ใช้ card.gif แทนรูปตามไอดี (การ์ดทุดใบเหมือนกัน)
    const name = itemDisplayName(id);
    if (name.endsWith(' Card') || (id >= 4001 && id <= 4520)) return ITEMS_ICON_URL + 'card.gif';
    return ITEMS_ICON_URL + id + '.gif';
  }
  // ยอด zeny รวม session (จาก inventory จริง × buyPrice)
  function sessionZeny() {
    let total = 0;
    for (const [id, count] of inventory) total += (itemPrice(Number(id)) || 0) * count;
    return total;
  }

  // ============================================================
  //  ตั้งค่าเริ่มต้น — แก้ได้ที่นี่ หรือใช้คำสั่ง ASSIST.* จาก console
  // ============================================================
  const CFG = {
    // ---------- AUTO-HEAL ----------
    //  ★★ DEFAULT = OFF — ระบบยังไม่สมบูรณ์ อาจส่ง packet แปลกปลอมถ้าไม่มี item heal
    //     เปิดใช้เองด้วย ASSIST.healOn() หรือ ASSIST.setHealItems(...) (จะเปิดให้อัตโนมัติ)
    healEnabled: false,           // เปิดใช้ตอนเริ่มหรือไม่
    healAtPercent: 60,            // HP% ที่จะเริ่มใช้ยา (เช่น 60 = ต่ำกว่า 60% ใช้ยา)
    healItems: [501,502],                // ★ DEFAULT = ว่าง → จะไม่ส่ง packet heal ใด ๆ จนกว่าจะตั้ง item
    healMode: 'order',            // 'order' = ใช้ตัวเดิมจนหมดแล้วค่อยข้าม, 'random' = สุ่มทุกครั้ง
    healDelayMs: 200,             // ดีเลย์ขั้นต่ำระหว่างการใช้ item แต่ละครั้ง
    healCheckMs: 100,             // ความถี่ในการเช็ค HP
    healAtMax: false,             // true = ใช้ยาจนเต็มก่อนหยุด (ไม่ใช่แค่พ้น threshold)
    healExhaustedMs: 3000,        // ★ item ที่ "หมด" จะรออีก N ms ก่อนลองใหม่ (เผื่อเก็บ/ซื้อมาเพิ่ม)
    healItemEffectCheckMs: 300,   // รอ server ส่ง HP กลับ N ms หลังใช้ item แล้วค่อยเช็คผล

    // ---------- AUTO-BUFF (ใช้ไอเทมบัพเป็นระยะ — countdown) ----------
    //  mirror บอทหลัก autoBuff (config.json:402-441) — timer mode
    //  เก็บเวลาใช้ล่าสุดข้าม session (localStorage) กัน buff หายเมื่อ refresh
    buffEnabled: false,           // เปิดใช้ตอนเริ่มหรือไม่
    // ★ รายการ buff: [{itemId, intervalMin}] — intervalMin = ทุกกี่นาทีจะใช้ซ้ำ
    //   ตัวอย่าง: [{itemId:656, intervalMin:30}] = Awakening Potion ทุก 30 นาที
    buffItems: [{itemId:645, intervalMin:30}],                // ★ default ว่าง = ไม่ใช้ buff ใด ๆ
    buffCheckMs: 20000,            // ความถี่ในการเช็ค (1 วิ)
    buffRebuffDelayMs: 5000,      // รออย่างน้อย N ms ก่อนใช้ buff ตัวเดิมซ้ำ (กัน spurious)

    // ---------- AUTO-SKILL (ใช้สกิลตามเงื่อนไข — mirror bot.js autoSkill) ----------
    //  3 mode: targeted (Bash/Charge), AoE (Magnum Break), self-cast (Two-Hand Quicken)
    //  แต่ละ skill: {name, skillId, level, targeted, selfCast, intervalMin, mobCountMin,
    //                 maxUsesPerTarget, maxDistance, minDistance, spMin, cooldownMs}
    skillEnabled: false,          // ★ default OFF
    skills: [],                   // รายการ skill config
    disabledSkillIds: [],         // skillId ที่ toggle ปิดชั่วคราว

    // ---------- MISC ----------
    autoClearConsoleMin: 10,       // ★ 0=off, >0=clear browser console ทุก N นาที (กัน log เยอะค้างหน่วย)

    // ---------- REMOTE MONITOR ----------
    monitorServerEnabled: true,  // ★ เปิดส่งข้อมูลไป relay server (ดูจากมือถือ/เครื่องอื่นได้)
    monitorServerUrl: 'wss://rayro.catgg.net',  // URL relay server
    monitorSendIntervalMs: 1000,  // ★ ส่งข้อมูลทุก 1 วิ (real-time)

    // ---------- NAVIGATION (บันทึกเส้นทางเดิน + waypoint graph) ----------
    //  เก็บตำแหน่งที่ผู้เล่นคลิกเดิน → สร้าง waypoint graph → bot เดินตามเส้นทางจริง
    //  ★ ข้อมูลเก็บ localStorage (roAssistNav_<map>) + export/import + sync GitHub
    navRecording: false,          // ★ default OFF — เปิดเพื่อบันทึกตอนเดินเก็บข้อมูล
    navMergeRadius: 3,            // จุดที่อยู่ใกล้กัน <= N ช่อง = รวมเป็น node เดียว (dedup)
    navWanderUseNav: true,        // wander ใช้ nav แทนสุ่ม (ถ้ามีข้อมูลแมปนั้น)
    navWanderMode: 'patrol',      // ★ 'patrol' = เดินตามลำดับ route ครบแล้วย้อนกลับ, 'graph' = wander สุ่มตาม graph

    // ---------- AUTO-REST (★ default OFF — นั่งพักเสี่ยงถ้ามีมอนรอบตัว) ----------
    //  เมื่อ HP ต่ำกว่า restHpPercent และไม่โดนรุม → นั่งพัก
    //  ฟื้นถึง restUntilPercent หรือหมดเวลา restMaxSec → ลุกยืนกลับฟาร์ม
    //  ★ โดนรุมระหว่างนั่ง → ลุกทันทีเพื่อตีตอบ
    restEnabled: true,
    restHpPercent: 40,            // HP ต่ำกว่า 30% → นั่งพัก
    restUntilPercent: 90,         // ฟื้นถึง 90% → ลุก
    restMaxSec: 40,               // นั่งนานสุด 60 วิ (กันค้าง — HP ไม่ขยับ = มีปัญหา)

    // ---------- AUTO-RESPAWN ----------
    //  ตาย (0x24 DEATH) → ส่ง respawn packet (0x29) → กลับจุด save
    //  หลัง respawn → บังคับนั่งพักจนเลือดเต็ม → กลับฟาร์ม
    autoRespawnEnabled: true,
    autoRespawnDelayMs: 3000,     // รอ N ms หลังตายก่อนส่ง respawn (กันสแปม — ถ้า server lag)

    // ---------- TELEGRAM ALERT FILTERS ----------
    //   ★ ควบคุมว่าจะส่ง alert ประเภทไหนไป Telegram บ้าง
    telegramAlertCard: true,       // 🃏 ดรอปการ์ด (logImportant type=card)
    telegramAlertFlee: true,       // 🚨 หนีมอน/ตาย (logImportant type=flee)
    telegramAlertBotMention: true, // 💬 แชทที่พูดถึง bot/บอท/บอต (logImportant type=chat)
    telegramAlertNearby: true,    // 💬 แชท nearby ทุกข้อความ
    telegramAlertWhisper: false,    // 💬 แชทกระซิบ (whisper) ทุกข้อความ
    telegramBotToken: '',           // ★ Bot Token (จาก @BotFather) — persist ในเครื่อง + ส่งไป relay
    telegramChatId: '',             // ★ Chat ID (จาก @userinfobot)

    // ---------- AUTO-SELL (★ default OFF) ----------
    //  trigger: ของเต็ม (0x20 'too full') OR ครบเวลา sellIntervalMin
    //  เลือก NPC + แมป เอง + เลือก item ที่จะขายเอง (default ไม่ขายอะไร)
    sellEnabled: true,
    sellNpcName: 'Tool Dealer',   // ชื่อ NPC (หาจาก entities kind=2)
    sellNpcMap: 'izlude_in',     // แมปที่ NPC อยู่ (วาร์ปไปแมปนี้)
    sellNpcX: 116,                // ★ พิกัด X ที่จะวาร์ปไป (ใกล้ NPC ที่สุด, mirror บอทหลัก npcMapX)
    sellNpcY: 55,                 // ★ พิกัด Y ที่จะวาร์ปไป (-999 = random spawn, แต่อาจไกล NPC)
    sellIntervalMin: 0,           // 0=off, >0=ขายทุก N นาที
    sellOnFull: true,             // ขายเมื่อของเต็ม (server ส่ง 'too full')
    sellItemIds: [908,909,910,911,918,919,920,921,924,926,928,940,943,946,949,950,951,955,960,961,962,1024,1052,7033,935,915,913,957,7032,902,1068,1067,948,907,1021,906,937,945,705,1023,1050,956,1057,963,914,905,511,711,721,1051,1054,1053,901,1094,1020,1019,7054,1022,7013,7094,7356,7317,7004,7049,1055,7064,967,912,1027,1096,7070,7358,7357,942,7359,953,1501,2221,1035,1032,1031,1013,1402,1916,1026,947,1014,1040,1034,1012,737,904,7031,1056,7007,903,7041,930,958,934,1059,1099,1098,7174,1025,1042,1017,7318,1028,1041,1061,1405,1408,2220,7119,923,7012,1063,7009,7002,931,7005,1095,1097,938,2297,1301,932,1505,1060,734,7069,7072,7066,7068,954,7156,7053,7158,7157,7106,7107,7001,7159,7124,7063,7111,7112,1038,7015,713,936,2303,1016,2304,1202,7154,7155,7153,7152,7126,1044,922,1116,1064,1201,1039,1602,1033,7067,1048,1062,944,7003,7006,1036,7123,1037,941,7030,7150,7149,7151,959],              // ★ item id ที่ติ๊กว่าจะขาย (default ว่าง = ไม่ขายอะไร)

    // ---------- AUTO-STORAGE (ฝากของเข้า Kafra) ----------
    //  ★ default OFF — เปิดเองใน config tab หรือ ASSIST.storageOn()
    //  mirror บอทหลัก config.bot.autoStorage (config.json:743-924)
    storageEnabled: true,        // เปิดใช้ตอนเริ่มหรือไม่
    kafraName: 'Kafra Staff',     // ชื่อ NPC Kafra (หาจาก entities kind=2)
    kafraMap: 'izlude',           // แมปที่ Kafra อยู่ (วาร์ปไปแมปนี้)
    kafraMapX: 134,                 // พิกัดวาร์ป X (0 = ใช้ sellNpcX/Y แทน)
    kafraMapY: 79,                 // พิกัดวาร์ป Y
    kafraChoice: 1,               // index เมนู "Use Storage" (0=Save, 1=Use Storage, 2=Teleport)
    depositOnFull: true,          // ฝากเมื่อของเต็ม (server ส่ง 'too full')
    depositAfterSell: true,       // ★ chain: ฝากต่อทันทีหลังขายเสร็จ
    depositItemIds: [],           // ★ item id ที่จะฝาก (default ว่าง = ไม่ฝากอะไร)

    // ---------- FARM MAP (แมปฟาร์ม) ----------
    //  ใช้สำหรับ: (1) เผลอเดินเข้าวาร์ป → เปลี่ยนแมป → วาร์ปกลับอัตโนมัติ
    //             (2) กดปุ่ม "วาร์ปไปแมปฟาร์ม" เพื่อกลับทันที (manual)
    //  ★ farmMap ว่าง = ปิดฟีเจอร์ทั้งคู่ (mirror บอทหลัก autoTeleport.mapName)
    farmMap: 'iz_dun00',                  // ชื่อแมปฟาร์ม (เช่น 'cmd_fild01') — ว่าง = ไม่ใช้
    farmMapX: -999,               // พิกัด X ที่จะวาร์ปไป (-999 = random spawn ในแมปนั้น)
    farmMapY: -999,               // พิกัด Y
    warpBackToFarm: true,         // ถ้า currentMap เปลี่ยนจาก farmMap → วาร์ปกลับอัตโนมัติ

    // ---------- AUTO-LOOT ----------
    lootEnabled: true,
    pickRadius: 2,                // ระยะ (ช่อง) จากตัวเรา ที่จะถือว่าของเป็นของเรา
    combatWindowMs: 2500,         // ของตกต้องมาภายในเวลานี้หลังเราตี/ฆ่า
    lootDelayAfterDropMs: 600,      // ★ รอ N ms หลังของตก แล้วค่อยเริ่มเก็บ (0 = เก็บทันที, กันดูเป็นบอท)
    lootUseKillPos: true,         // ★ เช็ค item ใกล้พิกัดมอนที่เราฆ่า (นักธนูฆ่าไกล → ของตกไกล)
    pickRadiusKill: 5,            // ★ ระยะ (ช่อง) จากพิกัดมอนที่ตาย ที่จะถือว่าของเป็นของเรา
    attemptIntervalMs: 1200,      // ห่างระหว่างการลองเก็บชิ้นเดิม (1.2 วิ — รอ server เดินไปเก็บ)
    sendThrottleMs: 400,          // ห่างระหว่างคำสั่งเก็บทุกชิ้น (กันสแปม)
    maxAttempts: 4,               // เก็บไม่ได้ 6 ครั้ง → ปล่อย (นักธนูฆ่าไกล ตัวเดินไปเก็บนานขึ้น)
    itemMaxAgeMs: 30000,          // ของเก่ากว่านี้ → ทิ้งออกจากคิว
    lootTickMs: 300,

    // ---------- WARP-TO-LOOT (ฟีเจอร์รุนแรง — default OFF) ----------
    //  เมื่อเก็บของไม่ได้ครบ maxAttempts (server เงียบ = ติดกำแพง/หน้าผา)
    //  → วาร์ปไปที่พิกัดของไอเท็ม แล้วส่ง pickup อีกครั้ง
    //  ★ default OFF เพราะส่ง packet warp จริง — เปิดเองด้วย ASSIST.warpLootOn()
    warpLootEnabled: true,
    warpLootMaxOffsets: 3,        // ลองกี่ offset รอบไอเท็ม (กลาง + ±3 รอบข้าง) ก่อนปล่อยทิ้ง
    warpLootCooldownMs: 2000,     // ห่างขั้นต่ำระหว่างการวาร์ป (กันสแปม)
    warpLootPickupDelayMs: 1000,   // รอ server ย้ายตัวละครหลังวาร์ป ก่อนส่ง pickup

    // ---------- AUTO-COMBAT (★ default OFF — ส่ง attack packet จริง) ----------
    //  เปิดเองด้วย ASSIST.combatOn()
    //  targetWhitelist: [] = ตีทุกมอน kind=1; ['Poring', 4000] = ตีเฉพาะ (รองรับชื่อ + sprite id)
    //  ⚠️ ว่าง = ตีทุกมอน รวม MVP/มอนแรง → แนะนำให้ตั้ง whitelist หรือใช้ blacklist กันตาย
    combatEnabled: false,
    targetWhitelist: [],          // [] = ตีมอน kind=1 ทุกตัว; ['Poring', 4000] = เฉพาะ (รองรับชื่อ + sprite id)
    targetBlacklist: [],          // ไม่ตีมอนเหล่านี้ (ชื่อหรือ sprite id)
    attackRange: 2,               // ระยะโจมตี (ช่อง) — ใกล้กว่านี้สั่งตี, ไกลกว่าเดินไป
    rangedAttackRange: 8,         // 0 = ใช้ attackRange; >0 = นักธนูตีไกลได้ N ช่อง
    maxAcquireDistance: 30,       // ★ เลือกเป้า + ส่ง ATTACK ได้ในระยะนี้ (cap สูงสุด)
    searchRadii: [1,3,5, 10, 15, 20, 30], // ★ progressive search — ค้นจากรัศมีเล็กก่อน ถ้าเจอใช้เลย (mirror bot.js:3944)
    maxChaseDistance: 40,         // ★ เดินไล่ตามมอนได้สูงสุด N ช่อง (ไกลกว่านี้ abandon หาตัวอื่น)
    walkStepDistance: 20,         // ★ สั่งเดินทีละ N ช่อง (game click-walk cap ~20)
    maxWalkDistance: 15,          // (legacy — ใช้น้อย เพราะ server walk-and-attack เอง)
    combatTickMs: 200,            // tick loop (มี jitter ±25% เหมือนบอทหลัก)
    postCombatDelayMs: 800,      // ★ รอ N ms หลังสู้เสร็จ/เก็บของเสร็จ ก่อนทำอย่างอื่น (ดูเป็นธรรมชาติ)
    attackReIssueMs: 2000,        // ส่ง attack ซ้ำถ้า server เงียบนานกว่านี้ (เพิ่มจาก 2500 → pending เพิ่มช้าลง)
    attackAbandonMs: 5000,       // ★ ส่ง attack แล้ว server ไม่ตอบ N ms → abandon (เพิ่มจาก 8s → 20s รองรับ reset ล่าช้า)
    attackPendingMax: 3,          // ★ abandon ถ้า pending ≥ N (ลดจาก 8 → 4 ใกล้บอทหลัก ตัดมอนตีไม่ได้เร็วขึ้น)
    aggroKeepAliveMs: 15000,      // ★ มอน aggro เรา → ถือว่ายังสู้อยู่ N ms (กัน abandon ตอนมอนเดินมาหา)
    maxEngageSec: 30,             // abandon target ถ้า engage นานกว่านี้
    maxEngageSecSlow: 180,        // ★ abandon มอน "ตีช้า/เจาะไม่เข้า" (เห็ด/พืช) ถ้านานกว่านี้ (3 นาที)
    slowMonsterSubIds: [4010, 4011, 4013, 4017, 4041, 4030, 4106, 4153],  // ★ sub-ID ที่ตี damage 1
    // flee (วาร์ปหนี)
    fleeOnMobCount: 3,            // มอนรุม N ตัว (ที่ตีเรา) → วาร์ปหนี (0=off)
    fleeOnAggroCount: 5,          // มอนจับเราเป็นเป้า N ตัว → วาร์ปหนี (0=off)
    fleeOnProximityCount: 10,      // มอนอยู่รอบ N ตัวในระยะ → วาร์ปหนี (0=off)
    fleeOnProximityRadius: 8,
    fleeMobWindowMs: 5000,        // ช่วงเวลาที่นับว่ามอน "กำลังตีเรา"
    fleeCooldownMs: 3000,
    fleeMonsters: [],             // ★ มอนที่ต้องหนี (ชื่อหรือ sub-ID) — เจอในระยะ → วาร์ปหนีทันที
    fleeMonsterRadius: 20,        // ★ ระยะ (ช่อง) ที่ถ้าเจอมอนใน fleeMonsters → วาร์ปหนี
    // KS avoidance + ป้องกันแย่ง
    antiKS: true,                 // ไม่ตีมอนที่คนอื่นกำลังสู้ (default ON)
    antiKSCooldownMs: 5000,       // มอนที่ถูกตีโดยคนอื่น จะถูกข้ามไป N ms
    avoidOtherPlayers: true,      // ไม่ตีมอนที่อยู่ใกล้ผู้เล่นคนอื่น
    playerProximityRadius: 10,
    // target selection
    targetLowestHpFirst: true,    // ถูกรุม ≥2 ตัว → ตีเลือดน้อยสุดก่อน
    // stuck
    warpToMonster: false,         // ติดกำแพง → วาร์ปไปหามอน (toggle, default OFF)
    warpToMonsterCooldownMs: 10000,
    warpToMonsterMaxPerEntity: 2,
    stuckWarpOnAbandon: 0,        // abandon 3 ครั้งใน 60s → วาร์ปสุ่ม
    warpToBoss: false,            // ★ วาร์ปไปสู้ Boss เมื่อตรวจจับได้ (flag=4, toggle, default OFF)
    warpToMiniBoss: false,        // ★ วาร์ปไปสู้ Mini Boss เมื่อตรวจจับได้ (flag=3, toggle, default OFF)
    bossAlertRadius: 0,           // ★ ระยะที่จะ alert mini-boss (0 = ทุกระยะ)
    bossAlertRadius: 0,           // ★ ระยะที่จะ alert boss (0 = ทุกระยะ, เช่น 50 = ภายใน 50 ช่อง)
    // หามอน
    wanderEnabled: true,          // ไม่เจอมอน → สุ่มเดิน
    wanderMaxStep: 20,            // สุ่มระยะ ≤20 ช่อง
    wanderCooldownMs: 3000,
    warpFindEnabled: false,       // ไม่เจอมอนนาน → วาร์ปสุ่ม (toggle, default OFF)
    noMonsterWarpSec: 30,

    // โหมดกรองของ: 'all' = เก็บหมด, 'only' = เก็บเฉพาะ, 'except' = ยกเว้น
    filter: { mode: 'except', onlyItems: [], exceptItems: [909,916,1302,1602,2302] },

    // ---------- ทั่วไป ----------
    verbose: true,
    itemNames: {
      501: 'Red Potion', 502: 'Yellow Potion', 503: 'White Potion',
      504: 'Blue Potion', 505: 'Wing of Fly', 601: 'Wing of Butterfly',
      909: 'Jellopy', 916: 'Bird Feather', 512: 'Apple',
    },
  };

  // ★ โหลดค่าที่บันทึกไว้จาก localStorage (ทับ default)
  loadConfig();
  loadBuffTimes();   // ★ โหลดเวลา buff ล่าสุดข้าม session
  loadSkillTimes();  // ★ โหลดเวลา skill ล่าสุดข้าม session

  // ---------- state ทั่วไป ----------
  let activeWS = null;                 // game socket (ใช้ส่งคำสั่ง)
  let gameServerUrl = '';              // ★ URL ของเซิร์ฟเวอร์เกม (เช่น wss://gamesea01.rayrag.com/ws)
  let playerId = null;                 // ไอดีตัวเรา
  let playerName = null;               // ★ ชื่อตัวเรา — guard กัน false ID change (mirror world.js:1235)
  let hpStatGraceUntil = 0;            // ★ grace period หลัง ID เปลี่ยน (ข้าม STAT HP ที่อาจผิด)
  const player = { x: null, y: null }; // ตำแหน่งตัวเรา

  // ---------- log buffer (สำหรับ panel log console) ----------
  const LOG_BUF_MAX = 200;
  const logBuf = [];
  function log(...a) {
    const msg = a.map(x => (typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch (e) { return String(x); } })() : String(x))).join(' ');
    logBuf.push({ t: Date.now(), msg });
    while (logBuf.length > LOG_BUF_MAX) logBuf.shift();
    if (CFG.verbose) console.log('[ASSIST]', ...a);
  }
  // ★ important log buffer — card drop + chat ที่พูดถึง bot
  const IMPORTANT_BUF_MAX = 200;
  const importantLogBuf = [];
  function logImportant(type, msg) {
    importantLogBuf.push({ t: Date.now(), type, msg });
    while (importantLogBuf.length > IMPORTANT_BUF_MAX) importantLogBuf.shift();
    log(msg);   // ส่งไป log ปกติด้วย
    // ★ ส่ง alert ไป relay server → forward ไป Telegram (ถ้ามี config + เปิด toggle ประเภทนี้)
    let category = null;
    if (type === 'card') category = 'telegramAlertCard';
    else if (type === 'flee') category = 'telegramAlertFlee';
    else if (type === 'chat') category = 'telegramAlertBotMention';
    else category = 'telegramAlertCard';   // default = ส่ง
    if (CFG[category] !== false) sendRelayAlert(msg);
  }
  // ★ chat history buffer — เก็บแชทล่าสุดสำหรับ monitor
  const CHAT_BUF_MAX = 50;
  const chatBuf = [];
  const nameOf = (id) => {
    const db = itemDisplayName(id);
    return db !== 'item_' + id ? `${db}(${id})` : (CFG.itemNames[id] ? `${CFG.itemNames[id]}(${id})` : `item_${id}`);
  };

  // ★ per-item action: 'keep' | 'sell' | 'deposit' (เก็บ/ขาย/ฝาก — เลือกได้อย่างเดียว)
  //   เก็บไว้ใน sellItemIds/depositItemIds ที่มีอยู่แล้ว (deposit สำคัญกว่า sell ถ้าซ้ำ)
  function getItemAction(id) {
    if (CFG.depositItemIds.includes(id)) return 'deposit';
    if (CFG.sellItemIds.includes(id)) return 'sell';
    return 'keep';
  }
  // ★ วน toggle: keep → sell → deposit → keep (สำหรับปุ่มใน UI)
  function cycleItemAction(id) {
    const cur = getItemAction(id);
    // ลบจากทั้งสองก่อน
    CFG.sellItemIds = CFG.sellItemIds.filter(x => x !== id);
    CFG.depositItemIds = CFG.depositItemIds.filter(x => x !== id);
    if (cur === 'keep') { CFG.sellItemIds.push(id); log('💰', nameOf(id), '→ ขาย'); }
    else if (cur === 'sell') { CFG.depositItemIds.push(id); log('🏦', nameOf(id), '→ ฝาก'); }
    else { log('📦', nameOf(id), '→ เก็บ'); }
    return getItemAction(id);
  }

  // ---------- สถิติการฟาร์ม ----------
  const stats = {
    startTime: Date.now(),
    kills: 0,              // จำนวนที่ฆ่าได้ (นับจาก EXP gain)
    itemsLooted: 0,        // จำนวนชิ้นที่เก็บได้
    expGained: 0,          // EXP รวมที่ได้ (base+job delta)
    baseExpGained: 0,      // ★ Base EXP delta (session) — แยกจาก job
    jobExpGained: 0,       // ★ Job EXP delta (session)
    itemsByCount: new Map(), // itemId -> จำนวนที่เก็บได้
    pickupFails: 0,        // ครั้งที่พยายามเก็บแล้วล้มเหลว
    deaths: 0,             // ครั้งที่ตาย
    // ★ rolling windows (mirror world.js:66-67, bot.js:401-422)
    dealtWindow: [],       // [{t, damage}] — 10s rolling for DPS
    attackWindow: [],      // [{t}] — 10s rolling for ASPD (รวม miss)
    goldWindow: [],        // [{t, gold}] — 5min rolling for zeny/hour
    sessionDamageDealt: 0, // cumulative total damage (session)
    sessionAttacks: 0,     // cumulative total attacks (session)
    sessionGold: 0,        // cumulative total gold value (session)
  };
  function resetStats() {
    stats.startTime = Date.now();
    stats.kills = 0; stats.itemsLooted = 0; stats.expGained = 0; stats.baseExpGained = 0; stats.jobExpGained = 0;
    stats.itemsByCount = new Map(); stats.pickupFails = 0; stats.deaths = 0;
    stats.dealtWindow = []; stats.attackWindow = []; stats.goldWindow = [];
    stats.sessionDamageDealt = 0; stats.sessionAttacks = 0; stats.sessionGold = 0;
  }

  // ---------- HP tracking ----------
  //  ★★★ ทุก STAT(0x25) packet ของ player = HP update (หลักฐานจากบอทหลัก world.js:1605-1643)
  //    statType เป็นแค่ label วนๆ (83 ค่าต่อ session) ทุก packet มี (cur,max) อยู่ในช่วง HP เดียวกัน
  //    → รับทุกตัวเลย แค่ sanity check (0 ≤ cur ≤ max)
  //    (ก่อนหน้านี้ใช้เทคนิค "เก็บ max สูงสุด" → ผิด! ถ้า server ส่ง sub-stat ที่ max=6774 → ทับ hp.max
  //     → แสดง 549/6774 ทั้งที่ HP จริง 408)
  const hp = { cur: null, max: null };
  const sp = { cur: null, max: null };   // ★ SP สำหรับ autoSkill — ตรวจ spMin
  function applyStat(id, cur, m) {
    if (id !== playerId) return;
    if (!(m > 0) || cur < 0 || cur > m) return;          // sanity check
    const now = nowMs();
    // ★★ grace period หลัง ID เปลี่ยน — ข้าม STAT HP ที่อาจผิด (mirror world.js:1620-1626)
    if (hpStatGraceUntil && now < hpStatGraceUntil && hp.cur != null) {
      return;   // ยังอยู่ใน grace + มี HP เก่า → ข้าม (รอค่าจริง)
    }
    if (hpStatGraceUntil && now >= hpStatGraceUntil) hpStatGraceUntil = 0;   // หมด grace → consume
    // ★ respawn detection: HP จาก 0/ตาย → กลับมา > 0 = เกิดใหม่แล้ว
    if (isDead && cur > 0) {
      isDead = false;
      heal.clearExhausted();                            // ล้าง mark "หมด" ทั้งหมด เริ่มนับใหม่
      heal.allExhaustedLogged = false;
    }
    hp.cur = cur;
    hp.max = m;
  }
  const hpPct = () => (hp.cur != null && hp.max > 0) ? (hp.cur / hp.max) * 100 : null;

  // ============================================================
  //  AUTO-HEAL
  // ============================================================
  //  ★ logic การเลือก item:
  //   - แต่ละ item มี "exhaustedUntil" = เวลาที่จะลองใช้ใหม่ได้
  //     (= 0 หรือ ผ่านไปแล้ว = ใช้ได้ปกติ)
  //   - 'order'  : เลือก item แรกสุดที่ "ใช้ได้" (ตามลำดับที่ตั้ง) → ใช้ซ้ำจนกว่าจะหมด
  //                พอหมด → mark exhaustedUntil = now + healExhaustedMs → ข้ามไปตัวถัดไปทันที
  //                พอหมดเวลา → ลองใหม่ → ถ้าเก็บมาเพิ่มก็ใช้ได้ทันที (ไม่ mark ถาวร)
  //   - 'random' : สุ่มเลือกเฉพาะ item ที่ "ใช้ได้" ตอนนั้น
  //   - ทุกครั้งที่ใช้ item → จำ HP ก่อนใช้ → รอ healItemEffectCheckMs → เช็คผล
  //     ถ้า HP ไม่ขยับ = หมด → mark exhaustedUntil + ข้าม delay → ใช้ตัวถัดไปทันที
  //   - ตอนตาย (isDead) → หยุด heal ทั้งหมด (กันนึกว่ายาหมดทั้งหมด)
  let isDead = false;
  let lastRespawnAt = 0;          // ★ timestamp ที่ส่ง respawn ล่าสุด (throttle)
  let postRespawnRest = false;    // ★ บังคับนั่งพักหลัง respawn จนกว่า HP จะเต็ม

  // ---------- AUTO-REST state ----------
  let isResting = false;          // กำลังนั่งพักอยู่
  let restUntil = 0;              // timestamp ที่จะลุก (กันค้าง — restMaxSec)
  const heal = {
    exhaustedUntil: new Map(),    // itemId -> timestamp ที่จะลองใช้ใหม่ได้
    lastUseAt: 0,                 // เวลาที่ใช้ item ครั้งล่าสุด
    pendingCheckAt: 0,            // เวลาที่ใช้ item ล่าสุด (รอเช็คผล)
    pendingItemId: null,          // item ที่รอเช็คผลอยู่
    pendingHpBefore: null,        // HP ก่อนใช้ item ล่าสุด

    // item นี้ "ใช้ได้" ไหม (ไม่ได้ถูก mark ว่าเพิ่งหมด)
    isAvailable(id, now) {
      const t = this.exhaustedUntil.get(id) || 0;
      return now >= t;
    },
    // mark ว่า item หมด → รอ healExhaustedMs แล้วค่อยลองใหม่
    markExhausted(id, now) {
      this.exhaustedUntil.set(id, now + CFG.healExhaustedMs);
    },
    // เลือก item ถัดไปที่จะใช้ (ตามโหมด)
    pickNext(now) {
      const ids = CFG.healItems;
      if (!ids.length) return null;
      const avail = ids.filter(id => this.isAvailable(id, now));
      if (!avail.length) return null;                // ทุกตัว mark ว่าหมดอยู่
      if (CFG.healMode === 'random') {
        return avail[Math.floor(Math.random() * avail.length)];
      }
      return avail[0];                               // 'order' = ตัวแรกที่ใช้ได้
    },
    // ล้าง mark "หมด" ทั้งหมด (ใช้ตอน respawn / reset)
    clearExhausted() { this.exhaustedUntil.clear(); },
  };

  // ส่งคำสั่งใช้ item: packet 0x2f, [2f][item_id:4 LE][target:4 LE], target=FFFFFFFF (self)
  function sendUseItem(itemId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(9);
    b[0] = 0x2f;
    b[1] = itemId & 0xff; b[2] = (itemId >> 8) & 0xff;
    b[3] = (itemId >> 16) & 0xff; b[4] = (itemId >>> 24) & 0xff;
    b[5] = 0xff; b[6] = 0xff; b[7] = 0xff; b[8] = 0xff;   // target = FFFFFFFF (self)
    activeWS.send(b);
    return true;
  }

  // ตัวเช็ค HP และใช้ยา
  const healLoop = setInterval(() => {
    if (!CFG.healEnabled) return;
    // ★★ GUARD สำคัญ: ถ้าไม่มี item heal เลย → ห้ามทำอะไร (กันส่ง packet 0x2f ปลอม → ถูกตรวจจับเป็นบอท)
    if (!CFG.healItems.length) return;
    const now = Date.now();
    const pct = hpPct();
    if (pct == null || hp.cur == null) return;            // ยังไม่รู้ HP
    if (isDead) return;                                   // ★ ตายอยู่ → ห้าม heal
    if (isResting) return;                                // ★ กำลังนั่งพัก → ข้าม heal (ใช้ regen แทน ประหยัดยา)

    // ★ เช็คผลของ item ที่ใช้ครั้งก่อน (background — ไม่บล็อกการใช้ตัวถัดไป)
    //   ถ้า HP ไม่ขยับ = หมด → mark exhausted (pickNext จะข้ามเอง)
    //   แต่ไม่ return — ให้ด้านล่างใช้ยาตัวถัดไปได้เลยถ้า HP ยังต่ำ + ผ่าน delay
    if (heal.pendingItemId != null && heal.pendingHpBefore != null &&
        now - heal.pendingCheckAt >= CFG.healItemEffectCheckMs) {
      if (hp.cur <= heal.pendingHpBefore + 1) {
        log('💊', nameOf(heal.pendingItemId), 'หมด (ใช้แล้ว HP ไม่ขยับ) → ใช้ตัวถัดไป');
        heal.markExhausted(heal.pendingItemId, now);
        heal.lastUseAt = 0;                              // ข้าม delay ให้ใช้ตัวถัดไปทันที
      }
      heal.pendingItemId = null;
      heal.pendingHpBefore = null;
      heal.pendingCheckAt = 0;
    }

    // เงื่อนไขการใช้ยา — ใช้ได้เลยถ้า HP ยังต่ำ + ผ่าน delay (ไม่ต้องรอ pending เคลียร์)
    const belowThreshold = pct < CFG.healAtPercent;
    const notFull = CFG.healAtMax ? (hp.cur < hp.max) : belowThreshold;
    if (!notFull) return;
    if (now - heal.lastUseAt < CFG.healDelayMs) return;   // throttle ดีเลย์เท่านั้น

    const id = heal.pickNext(now);
    if (id == null) {
      // ทุกตัว mark ว่าหมดอยู่ → log ครั้งเดียวเมื่อเริ่มหมด (กัน spam)
      if (!heal.allExhaustedLogged) {
        log('⚠️ item heal ทุกตัวหมด/ไม่ได้ผล — รอเก็บ/ซื้อเพิ่ม');
        heal.allExhaustedLogged = true;
      }
      return;
    }
    heal.allExhaustedLogged = false;
    if (sendUseItem(id)) {
      heal.lastUseAt = now;
      heal.pendingItemId = id;
      heal.pendingHpBefore = hp.cur;                      // จำ HP ก่อนใช้ เพื่อเช็คผล
      heal.pendingCheckAt = now;
      log('💉 ใช้', nameOf(id), `@ HP ${hp.cur}/${hp.max} (${pct.toFixed(0)}%)`);
    }
  }, CFG.healCheckMs);

  // ============================================================
  //  AUTO-BUFF — ใช้ไอเทมบัพเป็นระยะ (timer mode, mirror bot.js _maybeBuff:3505-3558)
  //    แต่ละ item มี intervalMin ของตัวเอง → ใช้ซ้ำเมื่อครบเวลา
  //    เก็บ lastBuffUse ข้าม session → refresh หน้าแล้ว buff ยังจำเวลาเดิม
  // ============================================================
  const buffLoop = setInterval(() => {
    if (!CFG.buffEnabled) return;
    if (!CFG.buffItems || !CFG.buffItems.length) return;
    if (isDead) return;
    if (!activeWS || activeWS.readyState !== 1) return;
    const now = nowMs();
    for (const item of CFG.buffItems) {
      if (!item || !item.itemId || !item.intervalMin) continue;
      const intervalMs = item.intervalMin * 60 * 1000;
      const last = lastBuffUse.get(item.itemId) || 0;
      // ★ rebuffDelay: รออย่างน้อย N ms ก่อนใช้ซ้ำ (กัน spurious ถ้า server ล้าง buff)
      if (last > 0 && (now - last) < Math.min(intervalMs, CFG.buffRebuffDelayMs)) continue;
      // ★ ยังไม่ครบ interval → skip
      if (last > 0 && (now - last) < intervalMs) continue;
      if (sendUseItem(item.itemId)) {
        lastBuffUse.set(item.itemId, now);
        saveBuffTimesDebounced();
        const remainMin = item.intervalMin;
        log('✨ ใช้ buff', nameOf(item.itemId), '(ทุก', remainMin + 'นาที)');
      }
    }
  }, CFG.buffCheckMs);

  // ★ auto clear browser console — กัน log เยอะค้างหน่วย (0=off)
  let lastConsoleClearAt = Date.now();
  const consoleClearLoop = setInterval(() => {
    if (!CFG.autoClearConsoleMin || CFG.autoClearConsoleMin <= 0) return;
    if (Date.now() - lastConsoleClearAt >= CFG.autoClearConsoleMin * 60 * 1000) {
      try { console.clear(); } catch (_) {}
      lastConsoleClearAt = Date.now();
      log('🧹 clear console (ทุก ' + CFG.autoClearConsoleMin + ' นาที)');
    }
  }, 30000);   // เช็คทุก 30s

  // ============================================================
  //  AUTO-LOOT
  // ============================================================
  let lastCombatAt = 0, lastExpAt = 0, lastSendAt = 0;
  const recentDrops = new Map();       // dropId -> {dropId,x,y,itemId,t}
  const queue = new Map();             // dropId -> {dropId,itemId,x,y,attempts,lastAttemptAt,addedAt}
  // ★ recent kill positions — จดพิกัดมอนที่เราฆ่า เพื่อเช็ค item drop ใกล้หรือไม่
  //   สำคัญสำหรับนักธนู: ยิงมอนตายไกล → ของตกที่พิกัดมอน ไม่ใช่ที่ตัวเรา
  const recentKillPos = [];            // [{x, y, t}] — ล่าสุด 20 ตำแหน่ง, TTL 15 วินาที
  const KILL_POS_TTL_MS = 15000;
  const KILL_POS_MAX = 20;

  // ---------- WARP-TO-LOOT state ----------
  let currentMap = null;               // ชื่อแมปปัจจุบัน (จาก opcode 0x12) — จำเป็นสำหรับ warp
  let playerZeny = null;              // ★ เงินปัจจุบัน (จาก 0x38 MAP_DATA offset 9 — ส่งตอนเข้าแมป/วาร์ป)
  let lastFarmWarpBackAt = 0;          // ★ throttle retry วาร์ปกลับแมปฟาร์ม (กันติดแมปผิด)
  let bossAlertedIds = new Set();       // ★ entity IDs ที่ alert boss ไปแล้ว (กันสแปม)
  let lastBossWarpAt = 0;              // ★ throttle วาร์ปไปหา boss
  const warpQueue = new Map();         // dropId -> {dropId,itemId,x,y,offsetIdx,warpAt,pickupSentAt}
  let lastWarpAt = 0;                  // throttle การวาร์ป
  let warpGuardUntil = 0;              // ★ ระยะหลังวาร์ป — รอ player pos อัปเดตก่อนคำนวณ dist
  let lastWarpPlayerPos = null;        // ★ player.x/y ก่อนวาร์ป (เช็คว่า pos เปลี่ยนไหม)
  let lastWarpTargetId = null;         // dropId ที่กำลังวาร์ปไป (เช็คผลจาก 0x2a)

  const u16 = (u, o) => u[o] | (u[o + 1] << 8);
  const u32 = (u, o) => ((u[o]) | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
  const i16 = (u, o) => { const v = u16(u, o); return v >= 0x8000 ? v - 0x10000 : v; };   // signed int16 LE (พิกัดติดลบได้)
  const dv = new DataView(new ArrayBuffer(4));
  const f32 = (u, o) => { dv.setUint32(0, u32(u, o), true); return dv.getFloat32(0, true); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const FAIL = 0xffffffff;

  function shouldLoot(itemId) {
    const f = CFG.filter;
    if (f.mode === 'only')   return f.onlyItems.includes(itemId);
    if (f.mode === 'except') return !f.exceptItems.includes(itemId);
    return true;
  }

  function syncU8(d) {
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    return null;
  }
  async function toU8(d) {
    const u = syncU8(d);
    if (u) return u;
    if (typeof Blob !== 'undefined' && d instanceof Blob) return new Uint8Array(await d.arrayBuffer());
    return null;
  }

  // ส่งคำสั่งเก็บของ: packet 0x52, [52][drop_id:4 LE]
  function sendPickup(dropId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5);
    b[0] = 0x52;
    b[1] = dropId & 0xff; b[2] = (dropId >> 8) & 0xff;
    b[3] = (dropId >> 16) & 0xff; b[4] = (dropId >>> 24) & 0xff;
    activeWS.send(b);
    return true;
  }

  // ★ เขียน signed int16 LE ลง Uint8Array ที่ offset (รองรับค่าติดลบ เช่น -999)
  function writeI16LE(b, off, v) {
    const x = v & 0xffff;
    b[off] = x & 0xff; b[off + 1] = (x >> 8) & 0xff;
  }
  // ★ ส่งคำสั่งวาร์ป: packet 0x40, [40][len:2 LE][mapname UTF-8][x:i16 LE][y:i16 LE][00]
  //   x/y เป็น signed int16 (-999 = random) — format ยืนยันจากบอทหลักแล้ว
  function sendTeleport(mapName, x, y) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (!mapName) return false;
    const mapBytes = new TextEncoder().encode(mapName);
    const b = new Uint8Array(1 + 2 + mapBytes.length + 2 + 2 + 1);
    let p = 0;
    b[p++] = 0x40;
    b[p++] = mapBytes.length & 0xff; b[p++] = (mapBytes.length >> 8) & 0xff;
    b.set(mapBytes, p); p += mapBytes.length;
    writeI16LE(b, p, Math.round(x)); p += 2;
    writeI16LE(b, p, Math.round(y)); p += 2;
    b[p] = 0x00;
    activeWS.send(b);
    // ★★★ อัปเดต player.x/y หลังวาร์ป — กันตำแหน่งค้างตลอดกาล
    //   กรณี 1: วาร์ปไปพิกัดเฉพาะ (x,y ≠ -999) → อัปเดตทันที (เรารู้ปลายทาง)
    //   กรณี 2: วาร์ปสุ่ม (-999) → null ตำแหน่ง (ไม่รู้ปลายทาง → รอ server ส่ง pos ใหม่)
    if (x !== -999 && y !== -999 && x >= -500 && x <= 1000 && y >= -500 && y <= 1000) {
      player.x = Math.round(x); player.y = Math.round(y);
      warpGuardUntil = 0; lastWarpPlayerPos = null;   // รู้พิกัด → ไม่ต้อง guard
    } else {
      // วาร์ปสุ่ม → ตั้ง guard รอ server ส่ง pos ใหม่ (หมดเวลา 3s)
      warpGuardUntil = nowMs() + 3000;
      lastWarpPlayerPos = (player.x != null) ? { x: player.x, y: player.y } : null;
    }
    return true;
  }

  function tryClaim(d) {
    if (queue.has(d.dropId)) return;
    const now = Date.now();
    if (now - lastCombatAt > CFG.combatWindowMs) return;
    // ★ เช็คว่า item อยู่ใกล้เราหรือใกล้พิกัดมอนที่เราฆ่า
    const nearPlayer = (player.x != null && dist(player, d) <= CFG.pickRadius);
    const nearExp = (now - lastExpAt) < 2000;
    // ★ nearKillPos: เช็คว่า item อยู่ใกล้พิกัดมอนที่เราฆ่าล่าสุดหรือไม่ (นักธนูยิงไกล)
    let nearKillPos = false;
    if (CFG.lootUseKillPos) {
      // cleanup expired entries
      while (recentKillPos.length > 0 && now - recentKillPos[0].t > KILL_POS_TTL_MS) recentKillPos.shift();
      const r = CFG.pickRadiusKill || 5;
      for (const k of recentKillPos) {
        if (Math.hypot(k.x - d.x, k.y - d.y) <= r) { nearKillPos = true; break; }
      }
    }
    // ★ เก็บถ้า: ใกล้ตัวเรา OR เพิ่งได้ EXP OR ใกล้พิกัดมอนที่เราฆ่า
    if (!(nearPlayer || nearExp || nearKillPos)) return;
    if (!shouldLoot(d.itemId)) {
      log('⛔ ข้าม', nameOf(d.itemId), '(ตัวกรอง mode=' + CFG.filter.mode + ') drop', d.dropId);
      return;
    }
    queue.set(d.dropId, { dropId: d.dropId, itemId: d.itemId, x: d.x, y: d.y, attempts: 0, lastAttemptAt: 0, addedAt: now });
    log('🎯 คิวเก็บ', nameOf(d.itemId), 'drop', d.dropId, '@(', d.x.toFixed(1), d.y.toFixed(1) + ')');
  }
  function markCombat() { lastCombatAt = Date.now(); }

  // ---------- ประมวลผล packet ----------
  function handleIn(u) {
    if (!u.length) return;
    const op = u[0];

    // 0x25 STAT: HP/SP ของ entity → [25][eid:4][statType:4][cur:4][max:4][flag:1]
    //   ★★ ห้ามตั้ง playerId จากที่นี่! STAT ส่งมาให้หลาย entity (player + monster)
    //      entityId แรกที่ส่ง STAT อาจเป็น monster → playerId ผิด → player position ไม่อัปเดต
    //      playerId ต้องมาจาก SELECT_CHAR(0x03) หรือ SPAWN(flag=1) เท่านั้น
    if (op === 0x25 && u.length >= 18) {
      const id = u32(u, 1);
      const cur = u32(u, 9), m = u32(u, 13);
      applyStat(id, cur, m);
    }
    // 0x27 SP_UPDATE: SP ปัจจุบัน + max ของ player (regen ทุก 6s)
    //   ★ mirror world.js:468-477 — STAT (0x25) ส่งแค่ HP ไม่มี SP → SP ต้องอ่านจาก 0x27 เท่านั้น
    //   [27][sp:4][spMax:4] (9 bytes)
    else if (op === 0x27 && u.length >= 9) {
      sp.cur = u32(u, 1);
      sp.max = u32(u, 5);
    }
    // 0x07 MOVE: ตำแหน่ง entity (ทั้ง player + monster/NPC)
    //   ★ player ใช้ i16 (offset 5/7) เหมือน monster เพื่อให้ระบบพิกัดตรงกัน (combat คำนวณระยะ/ทิศได้แม่น)
    //   ★ VALID_COORD: พิกัด Ragnarok อยู่ในช่วง [-500, 1000] — ค่านอกนี้ = parse ผิด → ปฏิเสธ
    else if (op === 0x07 && u.length >= 9) {
      const id = u32(u, 1);
      const x = i16(u, 5), y = i16(u, 7);
      // sanity check: พิกัดต้องอยู่ในช่วงแผนที่ (-500 ถึง 1000) — กัน garbage จาก parse ผิด
      const valid = (x >= -500 && x <= 1000 && y >= -500 && y <= 1000);
      if (!valid) return;   // พิกัดผิดปกติ → ข้ามทั้ง packet
      // ★ (D) stalePlayerIds check — กัน phantom entity จาก oldPlayerId (mirror world.js:1562)
      if (isStaleId(id, nowMs())) return;
      if (playerId != null && id === playerId) {
        player.x = x; player.y = y;
        // ★ ซิงค์ entities[playerId] ให้ตรง player.x/y (กัน entity ค้างที่ค่าผิด)
        const pe = entities.get(playerId);
        if (pe) { pe.x = x; pe.y = y; pe.kind = 0; pe.alive = true; pe._lastSeenAt = nowMs(); }
        else { entities.set(playerId, { id, kind: 0, x, y, alive: true, _lastSeenAt: nowMs() }); }
      } else {
        const e = entities.get(id);
        if (e) { e.x = x; e.y = y; e._lastSeenAt = nowMs(); }
        else { entities.set(id, { id, kind: 1, x, y, alive: true, _lastSeenAt: nowMs() }); }   // assume monster
      }
    }
    // 0x0b ATTACK_RESULT: ถ้าตัวเราเป็นคนตี → กำลังสู้
    else if (op === 0x0b && u.length >= 9) {
      if (playerId != null && u32(u, 1) === playerId) markCombat();
    }
    // 0x22 EXP: ได้รับ EXP (solo/party/event ใช้ opcode เดียวกัน)
    //   format: [22][baseTotal:4][baseDelta:4][jobTotal:4][jobDelta:4] (17 bytes)
    //   ★ delta=0 = zone-in sync → ไม่นับ session EXP (mirror world.js:985)
    //   ★★ ไม่นับ kills ที่นี่ — 0x22 มาทุกครั้งที่ได้ EXP (รวม party/event)
    //      kills นับใน 0x0f ENTITY_ACTION action=3 (มอนตายจริง) เท่านั้น
    else if (op === 0x22) {
      lastExpAt = Date.now(); markCombat();
      if (u.length >= 17) {
        const baseDelta = u32(u, 5);    // offset 5 = baseDelta (unsigned — mirror protocol.js:726)
        const jobDelta  = u32(u, 13);   // offset 13 = jobDelta
        const gain = (baseDelta > 0 ? baseDelta : 0) + (jobDelta > 0 ? jobDelta : 0);
        if (gain > 0) stats.expGained += gain;
        // ★ แยก Base/Job EXP (สำหรับ monitor) — mirror world.js:990-991
        if (baseDelta > 0) stats.baseExpGained += baseDelta;
        if (jobDelta > 0) stats.jobExpGained += jobDelta;
      }
      // ★ จดพิกัดมอนที่เราฆ่า — ใช้ target หรือ entity ล่าสุดที่เราตี
      //   สำคัญสำหรับนักธนู: ยิงมอนตายไกล → ของตกที่พิกัดมอน ไม่ใช่ที่ตัวเรา
      let killX = null, killY = null;
      if (target && target.x != null) { killX = target.x; killY = target.y; }
      else if (target) {
        // target อาจถูก abandon แล้ว → หาจาก entity ล่าสุดที่เราตี (_lastEngagedByMeAt)
        let bestT = 0;
        for (const e of entities.values()) {
          if (e._lastEngagedByMeAt && e._lastEngagedByMeAt > bestT && e.x != null) {
            bestT = e._lastEngagedByMeAt; killX = e.x; killY = e.y;
          }
        }
      }
      if (killX != null && killY != null) {
        recentKillPos.push({ x: killX, y: killY, t: Date.now() });
        while (recentKillPos.length > KILL_POS_MAX) recentKillPos.shift();
      }
      for (const d of recentDrops.values()) tryClaim(d);
    }
    // 0x51 ITEM_DROP: ของตก
    else if (op === 0x51 && u.length >= 15) {
      const d = { dropId: u32(u, 1), x: f32(u, 5), y: f32(u, 9), itemId: u16(u, 13), t: Date.now() };
      recentDrops.set(d.dropId, d);
      tryClaim(d);
    }
    // 0x52 PICKUP result (เช็คทั้ง queue ปกติ + warpQueue)
    else if (op === 0x52 && u.length >= 9) {
      const picker = u32(u, 1), dropId = u32(u, 5);
      const it = queue.get(dropId);
      const wit = warpQueue.get(dropId);   // ★ อาจมาจาก warpQueue หลังวาร์ปไปเก็บ
      // ★★ เช็คว่า "เรา" เป็นคนเก็บ (picker === playerId) ไม่ใช่แค่ "ใครบางคนเก็บ"
      //   ปัญหา: คนอื่นเก็บการ์ด → server ส่ง picker = คนอื่น → บอทเข้าใจว่าเก็บได้เอง!
      if (picker !== FAIL && picker === playerId) {
        if (it) { queue.delete(dropId); }
        if (wit) { warpQueue.delete(dropId); log('✨ วาร์ปไปเก็บสำเร็จ:', nameOf(wit.itemId), 'drop', dropId); }
        const itemId = (it || wit).itemId;
        stats.itemsLooted++;
        stats.itemsByCount.set(itemId, (stats.itemsByCount.get(itemId) || 0) + 1);
        // ★ zeny/hour tracking — buyPrice × count (mirror bot.js:401-422)
        const price = itemPrice(itemId);
        if (price > 0) {
          stats.goldWindow.push({ t: nowMs(), gold: price });
          stats.sessionGold += price;
        }
        log('✅ เก็บได้', nameOf(itemId), 'drop', dropId);
        // ★ Card detection — เก็บการ์ดได้ → log สำคัญ
        const itemName = itemDisplayName(itemId);
        if (itemName.endsWith(' Card') || (itemId >= 4001 && itemId <= 4520)) {
          logImportant('card', '🃏 เก็บการ์ดได้! ' + itemName + ' (' + itemId + ')');
        }
        // ★ ถ้าเก็บหมดแล้ว (queue ว่าง) → trigger cooldown ก่อน combatLoop acquire ใหม่
        if (queue.size === 0 && warpQueue.size === 0) {
          combatCooldownUntil = nowMs() + CFG.postCombatDelayMs;
        }
      } else {
        // server ตอบ FAIL ชัดเจน → ของอาจถูกมอนเก็บไปแล้ว → ลด attempts ที่เหลือให้เหลือ 1 (ลองอีกทีเดียวแล้วปล่อย)
        stats.pickupFails++;
        if (it) {
          if (it.attempts >= CFG.maxAttempts - 1) {
            queue.delete(dropId);
            log('🚫 ปล่อย', nameOf(it.itemId), 'drop', dropId, '(server ตอบ FAIL', it.attempts, 'ครั้ง — ของอาจถูกเก็บไปแล้ว)');
          }
        }
        // wit ไม่ delete ที่นี่ → warpLoop จะจัดการ offset ถัดไป
      }
    }
    // 0x24 DEATH: player ตาย → ล็อค isDead (ห้าม heal ตอนตาย) + รีเซ็ต HP
    else if (op === 0x24 && u.length >= 5 && playerId != null && u32(u, 1) === playerId) {
      isDead = true;
      hp.cur = 0;
      stats.deaths++;
      // ★ ล้างเวลา buff — ตายแล้ว buff หายหมด → ใช้ใหม่ได้ทันทีหลัง respawn (mirror bot.js:743-746)
      if (lastBuffUse.size > 0) { lastBuffUse.clear(); saveBuffTimesDebounced(); }
      // ★ ล้างเวลา skill + per-target uses (mirror bot.js:744-747)
      if (lastSkillUse.size > 0) { lastSkillUse.clear(); saveSkillTimesDebounced(); }
      skillUsesOnTarget.clear();
      log('☠️ ตัวละครตาย — หยุด heal จนกว่าจะ respawn');
    }
    // 0x12 MAP_NAME: ชื่อแมปปัจจุบัน → เก็บไว้ใช้สำหรับ warp
    //   format: [12][len:2 LE][mapname UTF-8]
    //   ★ ตรวจ "ออกจากแมปฟาร์ม" → วาร์ปกลับอัตโนมัติ (mirror bot.js:1226-1235)
    else if (op === 0x12 && u.length >= 3) {
      const len = u16(u, 1);
      if (u.length >= 3 + len) {
        const name = new TextDecoder().decode(u.slice(3, 3 + len));
        if (name && name !== currentMap) {
          const prevMap = currentMap;
          currentMap = name;
          log('🗺️ แมป:', name);
          // ★★★ clear entities ของแมปเก่า — กัน monster ค้างติดมาแมปใหม่ (mirror world.js:293-306)
          //   ปัญหา: ไม่ clear → Merman/Strouf จากแมปเก่ายังค้าง → บอทพยายามตีมอนที่ไม่มีจริง
          //   ★ เก็บตัวเองไว้ (re-add self หลัง clear)
          const myEntry = playerId != null ? entities.get(playerId) : null;
          entities.clear();
          if (myEntry) entities.set(playerId, myEntry);
          monsterAggro.clear(); mobAttackers.clear();
          target = null;
          log('🧹 ล้าง entities แมปเก่า (เปลี่ยนแมป)');
          bossAlertedIds.clear();   // ★ ล้าง boss alert cache (เริ่มนับใหม่ในแมปใหม่)
          navWanderReset();   // ★ เปลี่ยนแมป → reset wander state (ล้าง target เก่า)
          navPatrolReset();   // ★ reset patrol state ด้วย
          // ★ warp-back-to-farm: ออกจากแมปฟาร์ม → วาร์ปกลับ
          //   เงื่อนไข: warpBackToFarm=on AND farmMap ไม่ว่าง AND ตอนนี้ไม่ใช่ farmMap
          //   ★★ ไม่จำกัดแค่ "มาจาก farmMap" — ถ้าอยู่แมปผิดก็วาร์ปกลับเสมอ (กันติดแมปอื่น)
          //   ยกเว้น: อยู่ใน sell/storage routine (sellNpcMap/kafraMap) — ไม่วาร์ปกลับ
          if (CFG.warpBackToFarm && CFG.farmMap && name !== CFG.farmMap
              && name !== CFG.sellNpcMap && name !== CFG.kafraMap) {
            log('🌀 อยู่แมปผิด (' + name + '≠' + CFG.farmMap + ') → วาร์ปกลับ');
            sendTeleport(CFG.farmMap, CFG.farmMapX, CFG.farmMapY);
            lastFarmWarpBackAt = nowMs();
          }
        }
      }
    }
    // 0x03 SELECT_CHAR: server ตอบหลังเลือกตัวละคร — ★ ฝัง mapName (MAP_NAME ไม่ส่งตอน login ครั้งแรก)
    //   format: [03][eid:4][len:2][mapname null-terminated]
    else if (op === 0x03 && u.length >= 7) {
      const eid = u32(u, 1);
      if (playerId == null && eid) { playerId = eid; log('👤 player_id =', eid.toString(16), '(จาก SELECT_CHAR)'); relayRegisterPlayer(); }
      const mapLen = u16(u, 5);
      if (u.length >= 7 + mapLen && mapLen > 0) {
        let name = new TextDecoder().decode(u.slice(7, 7 + mapLen));
        name = name.split('\0')[0];   // ตัดที่ null terminator
        if (name && name !== currentMap) { currentMap = name; log('🗺️ แมป:', name, '(จาก SELECT_CHAR)'); }
      }
    }
    // 0x2a WARP_FAIL: server บอกว่าพิกัดวาร์ป invalid (กำแพง/น้ำ) → warpLoop จะลอง offset ถัดไป
    //   format: [2a][02]
    else if (op === 0x2a && u.length >= 2) {
      if (lastWarpTargetId != null) {
        const wit = warpQueue.get(lastWarpTargetId);
        if (wit) {
          log('⚠️ วาร์ป fail (พิกัด invalid) → ลอง offset ถัดไป:', nameOf(wit.itemId));
          wit.offsetIdx++;              // บังคับ offset ถัดไปใน warpLoop
          wit.warpAt = 0;               // ให้ warpLoop วาร์ปใหม่ได้เลย (ผ่าน cooldown)
        }
        lastWarpTargetId = null;
      }
    }
    // 0x36 DESPAWN_REASON: [36][eid:4][reason:4] — reason=2 = entity ถูกเก็บไป (โดย player หรือมอน loot)
    //   ★ สำคัญ: ถ้าของที่เรารอเก็บถูกมอน loot (เช่น Poring กินของ) → ลบออกจาก queue ทันที ไม่ต้องลองเก็บเปล่าๆ
    else if (op === 0x36 && u.length >= 9) {
      const eid = u32(u, 1);
      const reason = u32(u, 5);
      if (reason === 2) {
        // ของถูกเก็บไป → ลบจาก queue/recentDrops/warpQueue
        if (queue.has(eid)) {
          const it = queue.get(eid);
          queue.delete(eid);
          log('🗑️ ของหายไป:', nameOf(it.itemId), 'drop', eid, '(ถูกเก็บไปแล้ว — อาจโดยมอน loot)');
        }
        recentDrops.delete(eid);
        warpQueue.delete(eid);
      }
    }
    // ============== SELL / INVENTORY packets ==============
    // 0x32 INVENTORY_UPDATE (IN) — mirror protocol.js:1217-1281
    //   โครงสร้างจริง (19B): [32][03][invId:4=itemId×2][02 00][seqId:4][invId:4][count_enc:2][flag:1]
    //   offset: 0=op 1=sub 2..5=invId 6..7=const(02 00) 8..11=seqId 12..15=invId repeat 16..17=count_enc 18=flag
    //   itemId = invId >>> 1   (bit-packed: bit 0 = identified flag)
    //   count  = count_enc >>> 1  (bit-packed: bit 0 = flag; real = count_enc/2)
    //   หลักฐาน: Heart of Mermaid 160 → 0x0140=320; Meat 11 → 0x0016=22; Poison Spore 18 → 0x0024=36
    else if (op === 0x32 && u.length >= 6) {
      const sub = u[1];
      if (sub === 3 && u.length >= 18) {
        // ★ stackable: set count ตรงจาก server (รองรับทั้งเพิ่ม/ลด/ใช้)
        const invId = u32(u, 2);
        const itemId = invId >>> 1;
        // ★ count_enc อยู่ offset 16-17 (protocol.js:1270-1278)
        const countEnc = u16(u, 16);
        const count = countEnc >>> 1;
        if (itemId > 0 && itemId < 50000) {
          inventory.set(itemId, count);   // SET ตรงจาก server (แม่นยำเสมอ)
        }
      } else if (sub === 5 && u.length >= 15) {
        // ★ equipment add (sub=5): itemId @ offset 12 (2B LE) bit-packed >>> 1
        //   slotId @ offset 2 (4B LE) bit-packed >>> 1 — mirror protocol.js:1237-1248
        //   ★★ track slotId สำหรับฝากเข้า storage (storage ต้องการ slotId ไม่ใช่ itemId)
        const itemId = u16(u, 12) >>> 1;
        const slotId = u32(u, 2) >>> 1;   // เช่น Bow(1701) slot 20010 → offset2 = 40020
        if (itemId > 0 && itemId < 50000) {
          inventory.set(itemId, (inventory.get(itemId) || 0) + 1);
          // ★ track slot id ของแต่ละชิ้น (mirror world.js:773-777)
          if (slotId > 0) {
            const slots = equipmentSlots.get(itemId) || [];
            if (!slots.includes(slotId)) slots.push(slotId);
            equipmentSlots.set(itemId, slots);
          }
        }
      } else if (sub !== 3 && sub !== 5 && u.length >= 7 && u.length <= 14) {
        // ★★ equipment removal (drop/sell/move to storage) — 12B packet
        //   โครงสร้าง: [32][sub][slotId×2:4][02 00][...] (protocol.js:1256-1264)
        //   ใช้ล้าง slot id ออกจาก equipmentSlots กัน stale slot
        const rawSlot = u32(u, 1);
        if (rawSlot > 0) {
          const slotId = rawSlot >>> 1;
          if (slotId > 0 && slotId < 100000) {
            for (const [itemId, slots] of equipmentSlots) {
              const idx = slots.indexOf(slotId);
              if (idx >= 0) {
                slots.splice(idx, 1);
                const cur = inventory.get(itemId) || 0;
                if (cur > 1) inventory.set(itemId, cur - 1);
                else inventory.delete(itemId);
                if (slots.length === 0) equipmentSlots.delete(itemId);
                break;
              }
            }
          }
        }
      }
      // ★ sub อื่น ๆ → ไม่ track (protocol.js:1265 ทิ้ง)
    }
    // 0x20 SYS_MESSAGE: detect "too full" → inventoryFull (mirror world.js:264-279)
    else if (op === 0x20 && u.length >= 2) {
      try {
        const msg = new TextDecoder('utf8', { fatal: false }).decode(u.slice(1)).toLowerCase();
        if (msg.includes('too full') || msg.includes('inventory is full') || msg.includes('cannot carry') || msg.includes('กระเป๋าเต็ม')) {
          if (!inventoryFull) log('🎒 ของเต็ม! (inventory full)');
          inventoryFull = true;
        }
        if (msg.includes('could not complete sale') || msg.includes('do not match')) {
          // sell failed signal
          if (sellState === 'SELL') { log('⚠️ ขายของล้มเหลว (server ปฏิเสธ)'); }
        }
      } catch (e) {}
    }
    // 0x2c CHAT: [2c][sender:4][msg_len:2][msg][name_len:2][name][chat_type:1]
    //   chatType: 0=nearby, 1=shout, 2=whisper (mirror protocol.js:1113-1128)
    //   ★ ตรวจคำว่า bot/บอท/บอต → log สำคัญ
    else if (op === 0x2c && u.length >= 7) {
      try {
        let p = 1;
        const sender = u32(u, p); p += 4;
        const msgLen = u16(u, p); p += 2;
        if (p + msgLen > u.length) return;
        const message = new TextDecoder('utf8', { fatal: false }).decode(u.slice(p, p + msgLen));
        p += msgLen;
        let name = '';
        if (p + 2 <= u.length) {
          const nameLen = u16(u, p); p += 2;
          if (p + nameLen <= u.length) {
            name = new TextDecoder('utf8', { fatal: false }).decode(u.slice(p, p + nameLen));
            p += nameLen;
          }
        }
        let chatType = -1;
        if (p < u.length) chatType = u[p];
        const typeNames = { 0: 'ใกล้', 1: 'ตะโกน', 2: 'กระซิบ' };
        const typeName = typeNames[chatType] || ('type' + chatType);
        // ★ เก็บลง chat history buffer (สำหรับ monitor)
        chatBuf.push({ t: Date.now(), type: typeName, chatType, sender: name || '?', message });
        while (chatBuf.length > CHAT_BUF_MAX) chatBuf.shift();
        // ★ ตรวจคำต้องห้าม
        const lower = message.toLowerCase();
        if (lower.includes('bot') || message.includes('บอท') || message.includes('บอต')) {
          logImportant('chat', '💬 [' + typeName + '] ' + (name || '?') + ': ' + message);
        }
        // ★ ส่งแชท nearby/whisper ทุกข้อความไป Telegram (ถ้าเปิด toggle)
        else {
          const alertMsg = '💬 [' + typeName + '] ' + (name || '?') + ': ' + message;
          if (chatType === 0 && CFG.telegramAlertNearby !== false) sendRelayAlert(alertMsg);
          else if (chatType === 2 && CFG.telegramAlertWhisper !== false) sendRelayAlert(alertMsg);
        }
      } catch (e) {}
    }
    // 0x38 MAP_DATA: zone-enter data — ★ มี zeny ที่ offset 9 (u32LE)
    //   format: [38][u32:?][u32:?][u32:ZENY][...rest...] (mirror protocol.js:1415-1421)
    //   ★ ส่งตอนเข้าแมป/วาร์ป — เป็นแหล่งเดียวที่บอก zeny ปัจจุบัน
    else if (op === 0x38 && u.length >= 13) {
      const zeny = u32(u, 9);
      if (zeny != null && zeny !== playerZeny) {
        playerZeny = zeny;
      }
    }
    // ★ 0x3c MINIMAP_MARKER: 2 โหมด
    //   sub=1: [3c][0100][id:4][x:2][y:2][flag:1] — boss/player position (single, 12 bytes)
    //   sub=7: [3c][0700][id:4][x:2][y:2][flag:1] × N — warp portals + entities (multi)
    //   flag=1/3 = boss/player, flag=5 = warp portal
    else if (op === 0x3c && u.length >= 3) {
      const sub = u16(u, 1);
      const now = nowMs();
      if (sub === 7 && u.length >= 5) {
        // ★ sub=7: multi-entity list (warp portals + positions)
        //   format: [3c][0700] then repeating [id:4][x:2][y:2][flag:1] (9 bytes each)
        let p = 3;
        while (p + 9 <= u.length) {
          const eid = u32(u, p); p += 4;
          const ex = i16(u, p), ey = i16(u, p + 2); p += 4;
          const eflag = u[p]; p += 1;
          if (!eid || ex < -500 || ex > 1000 || ey < -500 || ey > 1000) continue;
          if (eflag === 5) {
            // ★ warp portal → track as entity kind=2 (NPC) + _isWarp flag
            entities.set(eid, { id: eid, kind: 2, x: ex, y: ey, alive: true, _lastSeenAt: now, _isWarp: true, name: 'Warp' });
          } else if (eflag === 4) {
            // ★ flag=4 = Boss (จริง) → track as _isBoss
            let m = entities.get(eid);
            if (m) { m.x = ex; m.y = ey; m._lastSeenAt = now; m._isBoss = true; }
            else { entities.set(eid, { id: eid, kind: 1, x: ex, y: ey, alive: true, _lastSeenAt: now, _isBoss: true, name: 'Boss' }); }
          } else if (eflag === 3) {
            // ★ flag=3 = Mini Boss
            let m = entities.get(eid);
            if (m) { m.x = ex; m.y = ey; m._lastSeenAt = now; m._isMiniBoss = true; }
            else { entities.set(eid, { id: eid, kind: 1, x: ex, y: ey, alive: true, _lastSeenAt: now, _isMiniBoss: true, name: 'Mini Boss' }); }
          } else if (eflag === 1) {
            // ★ flag=1 = ผู้เล่นอื่นบนแมป (minimap marker) → track เป็น kind=0
            let m = entities.get(eid);
            if (m) { m.x = ex; m.y = ey; m._lastSeenAt = now; }
            else { entities.set(eid, { id: eid, kind: 0, x: ex, y: ey, alive: true, _lastSeenAt: now, name: '' }); }
          }
        }
      } else if (sub === 1 && u.length >= 12) {
        // ★ sub=1: single boss/player position
        const id = u32(u, 3);
        const x = i16(u, 7), y = i16(u, 9);
        const flag = u[11];
        if (id && x >= -500 && x <= 1000 && y >= -500 && y <= 1000 && (flag === 1 || flag === 3 || flag === 4)) {
          if (flag === 1) {
            // ★ flag=1 = ผู้เล่นอื่นบนแมป (minimap marker) → track เป็น kind=0
            let m = entities.get(id);
            if (m) { m.x = x; m.y = y; m._lastSeenAt = now; }
            else { entities.set(id, { id, kind: 0, x, y, alive: true, _lastSeenAt: now, name: '' }); }
          } else {
            // ★ flag=3 = Mini Boss, flag=4 = Boss
            const isRealBoss = (flag === 4);
            let m = entities.get(id);
            if (isRealBoss) {
              if (m) { m.x = x; m.y = y; m._lastSeenAt = now; m._isBoss = true; }
              else { m = { id, kind: 1, x, y, alive: true, _lastSeenAt: now, _isBoss: true, name: 'Boss' }; entities.set(id, m); }
            } else {
              if (m) { m.x = x; m.y = y; m._lastSeenAt = now; m._isMiniBoss = true; }
              else { m = { id, kind: 1, x, y, alive: true, _lastSeenAt: now, _isMiniBoss: true, name: 'Mini Boss' }; entities.set(id, m); }
            }
            // ★ alert (ครั้งเดียวต่อ entity ID)
            if (!bossAlertedIds.has(id)) {
              bossAlertedIds.add(id);
              const dist = (player.x != null) ? Math.hypot(x - player.x, y - player.y).toFixed(0) : '?';
              const label = isRealBoss ? '👑 Boss' : '👹 Mini Boss';
              log(label + '! entity', id.toString(16), '@(', x, y, ') ห่าง', dist, 'ช่อง');
              logImportant('card', label + ' ที่ (' + x + ', ' + y + ') ห่าง ' + dist + ' ช่อง');
            }
            // ★ auto-warp — แยก toggle สำหรับ Boss และ Mini Boss
            const warpEnabled = isRealBoss ? CFG.warpToBoss : CFG.warpToMiniBoss;
            if (warpEnabled && player.x != null && now - lastBossWarpAt > 10000) {
              const d = Math.hypot(x - player.x, y - player.y);
              if (d > 10) {
                const label = isRealBoss ? '👑 Boss' : '👹 Mini Boss';
                log(label + ' → วาร์ปไปสู้ @(', x, y, ') ห่าง', d.toFixed(0), 'ช่อง');
                sendTeleport(currentMap, x, y);
                lastBossWarpAt = now;
              }
            }
          }
        }
      }
    }
    // 0x4d NPC_DIALOG (mirror world.js:441-449)
    //   sub=1 = บทพูด (text) → กด Next ไปต่อ
    //   sub=2 = choice list (menu) → เลือก choice
    //   ★ ใช้ร่วมกับทั้ง sell (Tool Dealer) และ storage (Kafra)
    else if (op === 0x4d && u.length >= 6) {
      const sub = u[1];
      // --- SELL: TALK → เลือก Sell (choice 1) ---
      if (sub === 2 && sellState === 'TALK') {
        log('💰 ได้ NPC dialog choices → เลือก Sell');
        sendNpcSelect(1);
        sellState = 'SELECT_SELL'; sellStateAt = nowMs();
      }
      // --- STORAGE: TALK_KAFRA (บทพูด) → กด Next ---
      else if (storageState === 'TALK_KAFRA') {
        if (sub === 1) {
          log('🏦 Kafra บทพูด → กด Next');
          sendNpcNext();
          storageState = 'SELECT_STORAGE'; storageStateAt = nowMs();
        } else if (sub === 2) {
          // Kafra ส่ง menu ตรงๆ (ไม่มี intro) → เลือก Use Storage
          const choice = CFG.kafraChoice != null ? CFG.kafraChoice : 1;
          log('🏦 Kafra menu → เลือก Use Storage (choice', choice + ')');
          sendNpcSelect(choice);
          storageState = 'STORAGE_OPENED'; storageStateAt = nowMs();
        }
      }
      // --- STORAGE: SELECT_STORAGE (menu) → เลือก Use Storage ---
      else if (sub === 2 && storageState === 'SELECT_STORAGE') {
        const choice = CFG.kafraChoice != null ? CFG.kafraChoice : 1;
        log('🏦 Kafra menu → เลือก Use Storage (choice', choice + ')');
        sendNpcSelect(choice);
        storageState = 'STORAGE_OPENED'; storageStateAt = nowMs();
      }
    }
    // 0x53 SELL_OPEN: sell menu opened → ส่ง sellItems
    else if (op === 0x53 && sellState === 'SELECT_SELL') {
      // ★ สร้างรายการขาย — แยก equipment vs stackable (mirror bot.js _buildSellItems:1141-1171)
      //   equipment: ส่ง slot ID (20000+) count=1 ทีละชิ้น — เหมือน storageMove
      //   stackable: ส่ง itemId + count ปกติ
      const items = [];
      let eqCount = 0;
      for (const id of CFG.sellItemIds) {
        const stock = inventory.get(id) || 0;
        if (stock <= 0) continue;
        const eqSlots = equipmentSlots.get(id);
        if (eqSlots && eqSlots.length > 0) {
          // ★ equipment — ฝากจาก slot สูง→ต่ำ (กัน index shift เหมือน storage)
          const sorted = [...eqSlots].sort((a, b) => b - a);
          for (const slotId of sorted) { items.push({ itemId: slotId, count: 1 }); eqCount++; }
        } else {
          // ★ stackable — itemId + count จริง (server ปฏิเสธถ้า count ไม่ตรง)
          items.push({ itemId: id, count: stock });
        }
      }
      if (items.length === 0) {
        log('⚠️ ไม่มีของที่จะขาย (sellItemIds ว่าง หรือ inventory ไม่มี)');
        sellState = 'WARP_BACK'; sellStateAt = nowMs();
      } else {
        log('💰 ขายของ', items.length, 'รายการ' + (eqCount ? ' (' + eqCount + ' equipment)' : '') + ':',
            items.map(i => nameOf(i.itemId) + '×' + i.count).join(', '));
        sendSellItems(items);
        sellState = 'SELL'; sellStateAt = nowMs();
      }
    }
    // 0x5b SELL_RESULT: [5b][flag:1] flag>0 = success
    else if (op === 0x5b && u.length >= 2 && sellState === 'SELL') {
      if (u[1] > 0) {
        log('✅ ขายของสำเร็จ!');
        // ล้าง inventory tracking ของ sold items (mirror bot.js:1767)
        for (const id of CFG.sellItemIds) inventory.delete(id);
        inventoryFull = false;
        lastSellAt = nowMs();
        // ★ chain → storage: ถ้าเปิด depositAfterSell และมีของฝาก → ฝากต่อ (mirror bot.js:1773-1781)
        //   ใช้ sellReturnTo เป็นจุดกลับของ storage ด้วย (เพราะอยู่ในเมืองอยู่แล้ว → วาร์ปไป Kafra ใกล้ ๆ)
        if (CFG.storageEnabled && CFG.depositAfterSell && CFG.depositItemIds.length > 0) {
          let hasDeposit = false;
          for (const id of CFG.depositItemIds) { if ((inventory.get(id) || 0) > 0) { hasDeposit = true; break; } }
          if (hasDeposit) {
            const retTo = sellReturnTo;   // จดก่อน sell clear
            sellState = 'IDLE'; sellReturnTo = null;   // clear sell ก่อนเริ่ม storage
            startStorage('หลังขาย', retTo);
            return;
          }
        }
      } else {
        log('⚠️ ขายของล้มเหลว (SELL_RESULT flag=0)');
      }
      sellState = 'WARP_BACK'; sellStateAt = nowMs();
    }
    // ============== COMBAT packets ==============
    // 0x06 SPAWN: สร้าง/อัปเดต entity (kind=0 player/1 monster/2 NPC)
    //   layout: [06][flag:1][type:4][0f][id:4][sub:4][?:4][z:i32][nameLen:4][name][kind:1][class:2][x:i32][y:i32][hp:u32][hpMax:u32]
    //   ★ name เริ่มที่ offset 27 (หลัง z@19-22 + nameLen@23-26) ไม่ใช่ 19!
    //   nameLen (u32 @23) ใช้ได้สำหรับ ASCII แต่ผิดสำหรับ UTF-8 ไทย → scan สำรอง
    else if (op === 0x06 && u.length >= 27) {
      try {
        const flag = u[1];
        const id = u32(u, 7);            // offset 7 (ข้าม marker 0x0f @6)
        const sub = u32(u, 11);          // offset 11
        // ★ flag=1 = SPAWN ตัวเอง → ใช้หา/อัปเดต playerId (mirror world.js:1230-1281)
        //   ★★ CRITICAL guard: flag=1 ไม่ได้แปลว่าเป็นเราเสมอ! (mirror world.js:1230-1244)
        //   ปัญหา: SPAWN flag=1 ของผู้เล่นอื่นถูกมองเป็นตัวเรา → playerId ทับเป็นคนอื่น
        //   → STAT ของคนอื่นเข้ามาอัปเดต hp → กดยารัว ๆ
        //   แก้: เช็คชื่อต้องตรงกับ playerName (defense-in-depth)
        if (flag === 1) {
          if (playerId == null) {
            playerId = id; log('👤 player_id =', id.toString(16), '(จาก SPAWN flag=1)'); relayRegisterPlayer();
          } else if (playerId !== id) {
            // ★★ guard: ถ้าเรารู้ชื่อตัวเองแล้ว และชื่อใน packet นี้ไม่ตรง → เป็นคนอื่น → ไม่ทับ playerId
            //   (กัน false ID change ในที่คนเยอะ — mirror world.js:1235-1238)
            if (playerName && name && name !== playerName) {
              log('⚠️ flag=1 แต่ชื่อ "' + name + '" ≠ "' + playerName + '" → ไม่ใช่เรา → ข้าม');
            } else {
              // ID เปลี่ยนจริง (respawn/warp) → track oldId + clear + grace period
              log('🔄 player_id เปลี่ยน:', playerId.toString(16), '→', id.toString(16));
              stalePlayerIds.set(playerId, nowMs() + 300000);  // stale 5 นาที
              entities.clear();
              monsterAggro.clear(); mobAttackers.clear();
              playerId = id; relayRegisterPlayer();
              // ★ grace period 3s — ข้าม STAT HP ที่อาจผิดหลัง ID เปลี่ยน (mirror world.js:1265)
              hpStatGraceUntil = nowMs() + 3000;
              hp.cur = null; hp.max = null;   // reset กันค่าเก่าทับ
              // ★★ รีเซ็ตตำแหน่ง — ID เปลี่ยน = อยู่ที่ใหม่แน่ๆ ตำแหน่งเดิมใช้ไม่ได้แล้ว
              player.x = null; player.y = null;
              warpGuardUntil = nowMs() + 3000; lastWarpPlayerPos = null;
            }
          }
        }
        // z @ 19-22 (i32 signed) — ข้าม
        const nameLenField = u32(u, 23); // nameLen @ 23 (u32 — น่าเชื่อถือไม่ได้สำหรับ UTF-8 ไทย)
        // หา nameEnd: เริ่มจาก 27+nameLenField ถ้าดูเหมือน ASCII, ไม่งั้น scan จาก offset 27
        let nameEnd = 27 + nameLenField;
        let name = '';
        if (nameLenField > 0 && nameLenField < 32) {
          const candidate = u.slice(27, 27 + nameLenField);
          const lastByte = candidate[candidate.length - 1];
          const looksTruncated = (lastByte >= 0x80);   // ถ้า byte สุดท้ายเป็น UTF-8 continuation → ตัดกลางคัน
          if (looksTruncated) {
            // scan หา [00 00][kind<=2] จาก offset 27 (ข้าม z + nameLen)
            for (let i = 27; i < u.length - 2; i++) {
              if (u[i] === 0 && u[i + 1] === 0 && u[i + 2] <= 2) { nameEnd = i; break; }
            }
          }
          try { name = new TextDecoder('utf8', { fatal: false }).decode(u.slice(27, nameEnd)); } catch (e) { name = ''; }
        } else {
          // nameLen ผิดปกติ → scan หา [00 00][kind<=2] จาก offset 27
          nameEnd = -1;
          for (let i = 27; i < u.length - 2; i++) {
            if (u[i] === 0 && u[i + 1] === 0 && u[i + 2] <= 2) { nameEnd = i; break; }
          }
          if (nameEnd < 0) nameEnd = u.length;   // ไม่เจอ → ใช้ท้าย packet
          try { name = new TextDecoder('utf8', { fatal: false }).decode(u.slice(27, nameEnd)); } catch (e) { name = ''; }
        }
        // kind @ nameEnd + 2 (หลัง 00 00 ตัวที่ 2) — เหมือนบอทหลักที่ scan pattern หา kind
        // จริงๆ nameEnd ใน path scan = index ของ 00 ตัวแรก → kind อยู่ที่ nameEnd+2
        // ใน path nameLen (ไม่ scan) → nameEnd = 27+nameLenField → kind @ nameEnd ตรงๆ
        // แก้โดยใช้ logic เดียวกับบอทหลัก: kind = byte หลัง name
        let kind = -1;
        // ถ้า nameEnd มาจาก scan (มี 00 00 ก่อน) → kind @ nameEnd+2
        if (u[nameEnd] === 0 && u[nameEnd + 1] === 0) kind = u[nameEnd + 2];
        else kind = u[nameEnd];   // nameEnd = จุดสิ้นสุดชื่อ (path nameLen)
        if (kind < 0 || kind > 2) {
          // kind ไม่ valid → scan ใหม่หา pattern [00 00][0-2]
          for (let i = 27; i < u.length - 2; i++) {
            if (u[i] === 0 && u[i + 1] === 0 && u[i + 2] <= 2) { nameEnd = i; kind = u[i + 2]; break; }
          }
        }
        if (kind >= 0 && kind <= 2) {
          let x = null, y = null, hp = null, hpMax = null;
          // x/y/hp/hpMax relative to nameEnd (kind @ nameEnd+2 → data เริ่ม nameEnd+3)
          // ★ บอทหลัก: x @ nameEnd+3, y @ nameEnd+7 (i32 signed), hp @ +12, hpMax @ +16
          if (u.length >= nameEnd + 20) {
            let rx = u32(u, nameEnd + 3); rx = rx > 0x7fffffff ? rx - 0x100000000 : rx;
            let ry = u32(u, nameEnd + 7); ry = ry > 0x7fffffff ? ry - 0x100000000 : ry;
            // ★ VALID_COORD: พิกัดต้องอยู่ในช่วงแผนที่ [-500, 1000] — ถ้าไม่ใช่ = nameEnd ผิด → ไม่รับ
            if (rx >= -500 && rx <= 1000 && ry >= -500 && ry <= 1000) { x = rx; y = ry; }
            const v3 = u32(u, nameEnd + 12);
            const v4 = u32(u, nameEnd + 16);
            if (v3 > 0 && v3 <= v4) { hp = v3; hpMax = v4; }
          }
          const existing = entities.get(id) || {};
          entities.set(id, {
            id, kind, sub, name,
            x: x != null ? x : (existing.x != null ? existing.x : null),
            y: y != null ? y : (existing.y != null ? existing.y : null),
            hp: hp != null ? hp : existing.hp,
            hpMax: hpMax != null ? hpMax : existing.hpMax,
            alive: true, _lastSeenAt: nowMs(),
            _lastEngagedByOtherAt: existing._lastEngagedByOtherAt || 0,
            _lastDamageAt: existing._lastDamageAt || 0,
          });
          // ★ (C) SPAWN อัปเดต player.x/y ด้วย (mirror world.js:1289-1292) — กัน stale หลังวาร์ป
          if (id === playerId && x != null) { player.x = x; player.y = y; }
          // ★ เก็บ playerName — ใช้เป็น guard กัน false ID change (mirror world.js:1235)
          if (id === playerId && name && !playerName) {
            playerName = name; log('👤 player_name =', name);
            // ★ re-register + re-send Telegram config ตอนรู้ชื่อครั้งแรก
            //   (SELECT_CHAR ส่ง setTelegram ก่อนรู้ชื่อ → relay ปฏิเสธ → ส่งใหม่ตอนนี้)
            if (relayWs && relayWs.readyState === 1) {
              try {
                relayWs.send(JSON.stringify({ type: 'register', playerId: playerId.toString(16), playerName }));
                if (CFG.telegramBotToken && CFG.telegramChatId) {
                  relayWs.send(JSON.stringify({ type: 'setTelegram', botToken: CFG.telegramBotToken, chatId: CFG.telegramChatId }));
                  log('📨 ส่ง Telegram config ไป relay อีกครั้ง (หลังรู้ชื่อ)');
                }
              } catch (_) {}
            }
          }
        }
      } catch (e) { /* SPAWN parse error ข้าม */ }
    }
    // 0x07 MOVE_UPDATE: อัปเดตตำแหน่ง entity — merge แล้วใน handler 0x07 ด้านบน (player + entity)
    // 0x3c ENTITY_LIST: batch ตำแหน่ง [3c][count:2][eid:4][x:2][y:2][flag:1]...
    else if (op === 0x3c && u.length >= 3) {
      const count = u16(u, 1);
      const now = nowMs();
      let p = 3;
      for (let i = 0; i < count && p + 9 <= u.length; i++) {
        const id = u32(u, p);
        const x = i16(u, p + 4), y = i16(u, p + 6);
        // sanity check พิกัด (กัน garbage)
        if (x >= -500 && x <= 1000 && y >= -500 && y <= 1000) {
          if (id !== playerId && !isStaleId(id, now)) {
            const e = entities.get(id);
            if (e) { e.x = x; e.y = y; e._lastSeenAt = now; }
            else { entities.set(id, { id, kind: 1, x, y, alive: true, _lastSeenAt: now }); }
          } else if (id === playerId) { player.x = x; player.y = y; }   // ★ player ด้วย
        }
        p += 9;
      }
    }
    // 0x14 ENTITY_POS: [14][id:4][x:2][y:2][flag:1]
    else if (op === 0x14 && u.length >= 9) {
      const id = u32(u, 1);
      const x = i16(u, 5), y = i16(u, 7);
      if (x >= -500 && x <= 1000 && y >= -500 && y <= 1000) {   // sanity
        if (id !== playerId && !isStaleId(id, nowMs())) {
          const e = entities.get(id);
          if (e) { e.x = x; e.y = y; e._lastSeenAt = nowMs(); }
          else { entities.set(id, { id, kind: 1, x, y, alive: true, _lastSeenAt: nowMs() }); }
        } else if (id === playerId) { player.x = x; player.y = y; }
      }
    }
    // 0x0b ATTACK_RESULT IN: [0b][attacker:4][target:4]...[damage:4 @17 ถ้ามี]
    //   + 0x26 variant: [26][attacker:4][damage:4] (มอนตี player)
    //   ★ บอทหลักรับแค่ 8 bytes (attacker+target) damage เป็น optional — กันเคส packet สั้น
    else if ((op === 0x0b || op === 0x26) && playerId != null) {
      let attacker, victimId, damage;
      if (op === 0x26 && u.length >= 9) { attacker = u32(u, 1); victimId = 0; damage = u32(u, 5); }
      else if (op === 0x0b && u.length >= 9) {   // ★ ลดจาก 21 → 9 (รับ packet สั้น)
        attacker = u32(u, 1); victimId = u32(u, 5);
        damage = u.length >= 21 ? u32(u, 17) : 0;   // damage optional (offset 17 ถ้ามี)
      }
      else return;
      const now = nowMs();
      // ★ DEBUG: ถ้ากำลังตี target อยู่ → log packet จริงเพื่อหาสาเหตุ reset ไม่ทำงาน
      if (target && CFG.verbose) {
        const isOur = (attacker === playerId);
        const isTgt = (victimId === target.id);
        if (!isOur && !isTgt && victimId !== playerId && victimId !== 0) {
          // packet ไม่ match ทั้ง playerId ทั้ง target.id → น่าสงสัย
          console.log('[ASSIST][debug] ATTACK_RESULT ไม่ match: attacker=' + attacker.toString(16) + ' victim=' + victimId.toString(16) + ' target=' + target.id.toString(16) + ' playerId=' + playerId.toString(16) + ' len=' + u.length + ' dmg=' + damage);
        }
      }
      // เราตีมอน → ลด HP มอน + reset pending + mark combat
      //   ★ reset pending เฉพาะ damage > 0 (miss ไม่ reset — กันค้างตีมอนที่ตีไม่ได้)
      //   ★ reset pending ถ้า victimId = target ปัจจุบัน (แม้ attacker ไม่ตรง playerId — กัน playerId ผิด)
      //   ★ ถ้าไม่มี entity ใน map → สร้างเลย (กัน _lastDamageAt ไม่ถูก stamp)
      const isOurAttack = (attacker === playerId && victimId !== playerId && victimId !== 0);
      const isTargetHit = (target && victimId === target.id && victimId !== 0 && victimId !== playerId);
      if (isOurAttack || isTargetHit) {
        let m = entities.get(victimId);
        if (!m) { m = { id: victimId, kind: 1, alive: true }; entities.set(victimId, m); }   // สร้างถ้าไม่มี
        m._lastDamageAt = now;
        if (damage > 0 && m.hp != null && m.hpMax != null) m.hp = Math.max(0, m.hp - damage);
        // ★ reset pending เฉพาะ damage > 0 (mirror bot.js:343) — miss (damage=0) ไม่ reset
        if (damage > 0 && target && target.id === victimId) { target.lastAttackResultAt = now; target.pendingAttacks = 0; target.firstAttackAt = 0; stuckAbandonCount = 0; stuckAbandonHistory = []; }
        markCombat();
        // ★ DPS/ASPD tracking — นับทุกครั้งที่เราตี (isOurAttack หรือ target โดน)
        //   isOurAttack = server ส่ง 0x0b บอกว่าเราตี, isTargetHit = target ของเราโดน damage
        //   (server บางตัวส่ง 0x17 แทน 0x0b → isOurAttack ไม่เป็น true → ใช้ isTargetHit ด้วย)
        if (isOurAttack || isTargetHit) {
          const t = nowMs();
          stats.attackWindow.push({ t });
          stats.sessionAttacks++;
          if (damage > 0) {
            stats.dealtWindow.push({ t, damage });
            stats.sessionDamageDealt += damage;
          }
          // ★ claim: เราตีมอนตัวนี้ → ยึดสิทธิ์ (mirror world.js:825-836)
          if (!m._claimedByMe && !m._lastEngagedByOtherAt) {
            m._claimedByMe = true; m._claimedAt = t;
          } else if (m._claimedByMe) {
            // renew claim
          }
          m._lastEngagedByMeAt = t;
        }
      }
      // มอนตีเรา → mark mobAttacker
      else if (victimId === playerId || (victimId === 0 && attacker !== playerId)) {
        mobAttackers.set(attacker, now);
        markCombat();
      }
      // คนอื่นตีมอน → mark engaged (KS avoidance)
      else if (attacker !== playerId && victimId !== playerId && victimId !== 0) {
        const m = entities.get(victimId);
        if (m && m.kind === 1) m._lastEngagedByOtherAt = now;
      }
    }
    // 0x17 DAMAGE_V2: [17][victimId:4][damage:4][x:2][y:2][flag:1] (14 bytes)
    //   ★ server ส่ง damage ของมอนที่เราตีผ่าน packet นี้ (ไม่ใช่ 0x0b!)
    //   ★★ อ่านเฉพาะ damage + victimId เท่านั้น — ไม่อัปเดต x/y (กัน bug ตำแหน่งมอนเสีย)
    //   heuristic: victim เป็นมอน = เราตี (mirror world.js:889-946)
    else if (op === 0x17 && u.length >= 9 && playerId != null) {
      const victimId = u32(u, 1);
      const damage = u32(u, 5);
      // victim = player → ข้าม (โดนตี จัดการใน 0x0b แล้ว)
      if (victimId !== playerId && victimId !== 0) {
        const now = nowMs();
        let m = entities.get(victimId);
        if (!m) { m = { id: victimId, kind: 1, alive: true }; entities.set(victimId, m); }
        m._lastDamageAt = now;
        // ★★ ลด HP มอนตาม damage (server นี้ส่ง damage ผ่าน 0x17 เท่านั้น — ไม่มี 0x0b)
        //   ต่างจากบอทหลักที่ไม่ลดใน 0x17 เพราะกัน double-count กับ 0x0b
        //   แต่ server rayrag ส่งแค่ 0x17 → ต้องลดที่นี่
        if (damage > 0 && m.hp != null && m.hpMax != null) {
          m.hp = Math.max(0, m.hp - damage);
        }
        // ★★ heuristic: เราเป็นคนตีหรือคนอื่น?
        //   0x17 ไม่มี attacker field → ใช้ "เราส่ง ATTACK ใส่มอนตัวนี้ภายใน 2 วินาทีไหม?" เป็นตัววัด
        //   ถ้าใช่ = เราตี (DPS/claim/reset pending)
        //   ถ้าไม่ใช่ = คนอื่นตี → stamp _lastEngagedByOtherAt (anti-KS)
        const weAttackedThis = (lastAttackSentTarget === victimId && (now - lastAttackSentAt) < 2000);
        if (weAttackedThis) {
          // ★ เราตี — DPS/ASPD tracking + claim
          stats.attackWindow.push({ t: now });
          stats.sessionAttacks++;
          if (damage > 0) {
            stats.dealtWindow.push({ t: now, damage });
            stats.sessionDamageDealt += damage;
            if (target && target.id === victimId) {
              target.lastAttackResultAt = now; target.pendingAttacks = 0; target.firstAttackAt = 0;
              stuckAbandonCount = 0; stuckAbandonHistory = [];
            }
          }
          // ★ claim: ถ้าเราตีมอนตัวนี้ก่อนคนอื่น → claim (mirror world.js:825-836)
          if (!m._claimedByMe && !m._lastEngagedByOtherAt) {
            m._claimedByMe = true; m._claimedAt = now;
          } else if (m._claimedByMe) {
            // มี claim อยู่แล้ว → renew
          } else if (m._lastEngagedByOtherAt && (now - m._lastEngagedByOtherAt > CFG.antiKSCooldownMs)) {
            // anti-KS cooldown หมดแล้ว → claim ใหม่ได้
            m._claimedByMe = true; m._claimedAt = now;
          }
          m._lastEngagedByMeAt = now;
        } else {
          // ★ คนอื่นตีมอนตัวนี้ → stamp anti-KS (mirror world.js:864-872)
          m._lastEngagedByOtherAt = now;
          if (!m._claimedByMe) m._claimedByMe = false;   // คนอื่นตีก่อน → เราไม่ claim
        }
        markCombat();
      }
    }
    // 0x18 MONSTER_SKILL: [18][srcId:4][dstId:4][skillId:2]... → aggro tracking
    //   ★ mirror world.js:988-1004 — aggro tracking (dstId=player)
    //   ★★ ไม่อัปเดต x/y (offset ไม่แน่นอน → เคยทำให้ตำแหน่งมอนเสีย → dist กระโดด)
    //      ตำแหน่งมอนอัปเดตจาก 0x07 MOVE / 0x06 SPAWN / 0x14 ENTITY_POS เท่านั้น
    else if (op === 0x18 && u.length >= 11 && playerId != null) {
      const srcId = u32(u, 1), dstId = u32(u, 5);
      if (dstId === playerId) { monsterAggro.set(srcId, nowMs()); markCombat(); }
    }
    // 0x1d SKILL (IN): [1d][sub:1][srcId:4][dstId:4]... → antiKS
    //   ★ mirror world.js:234-246 — antiKS: player อื่น cast skill ใส่มอน
    //   ★★ ไม่อัปเดต x/y (offset ไม่แน่นอน — เหมือน 0x18)
    else if (op === 0x1d && u.length >= 10 && playerId != null) {
      const srcId = u32(u, 2), dstId = u32(u, 6);
      if (srcId !== playerId && dstId !== playerId && dstId !== 0) {
        const m = entities.get(dstId);
        if (m && m.kind === 1) m._lastEngagedByOtherAt = nowMs();
      }
    }
    // 0x0f ENTITY_ACTION: action=3 = มอนตายจริง (authoritative)
    //   ★ นับ kills ที่นี่ ไม่ใช่ใน 0x22 EXP (mirror world.js:964 — sessionKills++ ที่นี่)
    else if (op === 0x0f && u.length >= 6 && u[5] === 3) {
      const id = u32(u, 1);
      const e = entities.get(id);
      if (e) {
        e.alive = false;
        // ★ ถ้าเป็น boss/mini boss ที่ตาย → ล้าง bossAlertedIds เพื่อ alert ใหม่ตอนเกิดใหม่
        if (e._isMiniBoss || e._isBoss) { bossAlertedIds.delete(id); log((e._isBoss ? '👑 Boss' : '👹 Mini Boss') + ' ตาย — จะ alert ใหม่เมื่อเกิดใหม่'); }
      }
      entities.delete(id);
      // ★ นับ kill — ถ้าเป็นมอน (kind=1) และเรามี target หรือ mobAttacker ตัวนี้
      if (e && e.kind === 1) {
        stats.kills++;
      }
      if (target && target.id === id) {
        abandonTarget('ฆ่าได้', false); target = null;
        // ★ trigger post-combat cooldown (รอก่อน acquire ใหม่ — ถ้ามีของ loot-blocking จะเก็บก่อน)
        combatCooldownUntil = nowMs() + CFG.postCombatDelayMs;
      }
    }
    // 0x1b DESPAWN: entity หาย (มี false-despawn guard)
    else if (op === 0x1b && u.length >= 5) {
      const id = u32(u, 1);
      const e = entities.get(id);
      if (e) {
        const now = nowMs();
        if (e._lastDamageAt && now - e._lastDamageAt < 3000) { e.alive = false; }   // false despawn guard
        else { entities.delete(id); if (target && target.id === id) { abandonTarget('despawn', false); target = null; } }
      }
    }
  }
  function handleOut(u) {
    if (!u.length) return;
    if (u[0] === 0x0b) markCombat();
    // ★ ดัก click-move (0x07) ของผู้เล่น → บันทึก trail (ถ้า navRecording=on)
    //   บอทสั่งเอง (sendMove) จะตั้ง navBotMoving=true ก่อน → ข้ามไม่บันทึก
    if (u[0] === 0x07 && u.length >= 5) {
      const mx = i16(u, 1), my = i16(u, 3);
      // ★★★ อัปเดต player.x/y จาก outgoing MOVE — สำคัญมาก!
      //   เกมส่ง move packet = player กำลังไปที่ (mx,my) → อัปเดตทันที
      //   แก้ปัญหาตำแหน่งค้างหลังวาร์ป (server ไม่ส่ง pos กลับ)
      if (mx >= -500 && mx <= 1000 && my >= -500 && my <= 1000) {
        player.x = mx; player.y = my;
        warpGuardUntil = 0; lastWarpPlayerPos = null;   // ★ เคลียร์ warp guard (pos อัปเดตแล้ว)
      }
      if (!navBotMoving && CFG.navRecording) {
        navRecordMove(mx, my);
      }
      navBotMoving = false;   // reset flag (บอทสั่งครั้งเดียว)
    }
  }

  // ---------- loop เก็บของ ----------
  const lootLoop = setInterval(() => {
    if (!CFG.lootEnabled) return;
    const now = Date.now();
    for (const [id, it] of queue) {
      if (now - it.addedAt > CFG.itemMaxAgeMs) { queue.delete(id); log('⌛ หมดอายุ drop', id); }
    }
    for (const [id, d] of recentDrops) if (now - d.t > 4000) recentDrops.delete(id);

    // ทิ้งชิ้นที่ครบ maxAttempts — ถ้าเปิด warpLoot ให้ย้ายไป warpQueue แทนที่จะปล่อยทิ้ง
    for (const [id, it] of queue) {
      if (it.attempts >= CFG.maxAttempts) {
        queue.delete(id);
        if (CFG.warpLootEnabled && currentMap) {
          // ★ ย้ายไป warpQueue เพื่อวาร์ปไปเก็บ (น่าจะติดกำแพง/หน้าผา)
          warpQueue.set(id, { dropId: id, itemId: it.itemId, x: it.x, y: it.y, offsetIdx: 0, warpAt: 0, pickupSentAt: 0 });
          log('🌀 เก็บไม่ได้ครบ', it.attempts, 'ครั้ง → วาร์ปไปเก็บ:', nameOf(it.itemId), 'drop', id);
        } else {
          log('🚫 ปล่อย', nameOf(it.itemId), 'drop', id, '(ล้มเหลว', it.attempts, 'ครั้ง ไม่มีผลจาก server)');
        }
      }
    }

    const eligible = [];
    for (const it of queue.values()) {
      if (it.attempts >= CFG.maxAttempts) continue;
      if (now - it.lastAttemptAt < CFG.attemptIntervalMs) continue;
      // ★ รอ lootDelayAfterDropMs หลังของตก ก่อนเริ่มเก็บ (addedAt = ตอนของตกเข้าคิว)
      //   ★★ แต่ละ drop จะมี delay ต่างกันเล็กน้อย (±200ms jitter — กันดูเป็นบอท)
      if (it.delayAfterDrop == null) it.delayAfterDrop = CFG.lootDelayAfterDropMs + (Math.random() * 400 - 200);
      if (now - it.addedAt < it.delayAfterDrop) continue;
      eligible.push(it);
    }
    if (!eligible.length) return;
    // ★★ sendThrottle กับ jitter ±200ms ด้วย — กันสแปมแต่ไม่ตายตัว
    if (now - lastSendAt < (CFG.sendThrottleMs + (Math.random() * 400 - 200))) return;

    eligible.sort((a, b) => a.lastAttemptAt - b.lastAttemptAt);
    const it = eligible[0];
    if (sendPickup(it.dropId)) {
      it.lastAttemptAt = now; it.attempts++; lastSendAt = now;
      log('📨 ลองเก็บ', nameOf(it.itemId), 'drop', it.dropId, '(ครั้ง', it.attempts + '/' + CFG.maxAttempts + ')');
    }
  }, CFG.lootTickMs);

  // ============================================================
  //  WARP-TO-LOOT loop — วาร์ปไปเก็บของที่เก็บไม่ได้ (ติดกำแพง/หน้าผา)
  // ============================================================
  //  offset pattern: กลาง → เหนือ3 → ตอ3 → ใต้3 → ตต3 (เหมือนบอทหลัก)
  const WARP_OFFSETS = [[0,0,'กลาง'], [0,-3,'เหนือ3'], [3,0,'ตอ3'], [0,3,'ใต้3'], [-3,0,'ตต3']];
  const warpLoop = setInterval(() => {
    if (!CFG.warpLootEnabled) return;
    if (!currentMap) return;                          // ไม่รู้แมป → ไม่วาร์ป (กัน packet ผิด)
    const now = Date.now();

    for (const [id, wit] of warpQueue) {
      // ครบ offset ทั้งหมดแล้วยัง fail → ปล่อยทิ้ง
      if (wit.offsetIdx >= Math.min(CFG.warpLootMaxOffsets, WARP_OFFSETS.length)) {
        warpQueue.delete(id);
        log('🚫 ปล่อย', nameOf(wit.itemId), 'drop', id, '(วาร์ปครบ', wit.offsetIdx, 'offset แล้วยังไม่ได้)');
        continue;
      }

      // ถ้ายังไม่ได้วาร์ปในรอบนี้ และผ่าน cooldown แล้ว → วาร์ป
      if (wit.warpAt === 0 && now - lastWarpAt >= CFG.warpLootCooldownMs) {
        const off = WARP_OFFSETS[wit.offsetIdx] || [0, 0, '?'];
        const tx = Math.round(wit.x + off[0]);
        const ty = Math.round(wit.y + off[1]);
        if (sendTeleport(currentMap, tx, ty)) {
          wit.warpAt = now;
          wit.pickupSentAt = 0;
          lastWarpAt = now;
          lastWarpTargetId = id;
          log('🌀 วาร์ปไปเก็บ', nameOf(wit.itemId), '@(', tx, ty, ') offset', off[2]);
        }
        return;   // วาร์ปทีละชิ้นต่อรอบ
      }

      // หลังวาร์ปแล้วรอ warpLootPickupDelayMs → ส่ง pickup อีกครั้ง
      if (wit.warpAt !== 0 && wit.pickupSentAt === 0 && now - wit.warpAt >= CFG.warpLootPickupDelayMs) {
        if (sendPickup(id)) {
          wit.pickupSentAt = now;
          log('📨 ลองเก็บหลังวาร์ป', nameOf(wit.itemId), 'drop', id);
        }
        return;
      }

      // ถ้าส่ง pickup ไปแล้ว แต่รอนานเกินไป (server เงียบ = วาร์ปไปที่ไม่ดี) → offset ถัดไป
      if (wit.pickupSentAt !== 0 && now - wit.pickupSentAt > 3000) {
        wit.offsetIdx++;
        wit.warpAt = 0;
        wit.pickupSentAt = 0;
        log('⏭️', nameOf(wit.itemId), 'ยังไม่ได้หลังวาร์ป → offset ถัดไป');
        return;
      }
    }
  }, CFG.lootTickMs);

  // ============================================================
  //  AUTO-SELL — state machine (IDLE → WARP → MOVE → TALK → SELECT → SELL → WARP_BACK)
  // ============================================================
  // หา NPC จาก entities (kind=2 + ชื่อตรง) — mirror world.js:1948-1959
  function findSellNpc() {
    const target = (CFG.sellNpcName || '').toLowerCase();
    for (const e of entities.values()) {
      if (e.kind === 2 && e.alive && e.x != null && e.name && e.name.toLowerCase().includes(target)) return e;
    }
    return null;
  }
  function setSellState(s) { sellState = s; sellStateAt = nowMs(); }
  function abortSell(reason) {
    log('⚠️ ยกเลิกขาย:', reason);
    sellState = 'IDLE'; sellStateAt = 0;
    // พยายามวาร์ปกลับถ้ามี returnTo
    if (sellReturnTo && sellReturnTo.map) { sendTeleport(sellReturnTo.map, sellReturnTo.x, sellReturnTo.y); }
    sellReturnTo = null;
  }
  // สร้าง trigger check + state machine ใน loop เดียว
  const sellLoop = setInterval(() => {
    if (!CFG.sellEnabled) return;
    if (!activeWS || activeWS.readyState !== 1) return;
    if (isDead) return;
    // ★ กัน race: ถ้า storage กำลังทำอยู่ → รอก่อน
    if (storageState !== 'IDLE') return;
    const now = nowMs();

    // === trigger (เฉพาะ IDLE) ===
    if (sellState === 'IDLE') {
      let shouldSell = false; let reason = '';
      // trigger 1: ของเต็ม
      if (CFG.sellOnFull && inventoryFull && CFG.sellItemIds.length > 0) { shouldSell = true; reason = 'ของเต็ม'; }
      // trigger 2: ครบเวลา
      if (CFG.sellIntervalMin > 0 && CFG.sellItemIds.length > 0 && lastSellAt > 0 && (now - lastSellAt >= CFG.sellIntervalMin * 60000)) {
        shouldSell = true; reason = 'ครบ ' + CFG.sellIntervalMin + ' นาที';
      }
      if (shouldSell && currentMap && player.x != null) {
        sellReturnTo = { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) };
        log('💰 เริ่มขายของ (' + reason + ') → วาร์ปไป', CFG.sellNpcMap, '@(', CFG.sellNpcX, CFG.sellNpcY + ')');
        sendTeleport(CFG.sellNpcMap, CFG.sellNpcX, CFG.sellNpcY);
        setSellState('WARP_TO_NPC');
      }
      return;
    }

    // === watchdog: stuck >60s → abort ===
    if (now - sellStateAt > 60000) { abortSell('timeout (' + sellState + ' 60s)'); return; }

    // === state machine ===
    if (sellState === 'WARP_TO_NPC') {
      // รอ 3s หลังวาร์ป ให้ entities โหลด → หา NPC
      if (now - sellStateAt > 3000) {
        const npc = findSellNpc();
        if (npc) { sellNpcId = npc.id; setSellState('MOVE_TO_NPC'); log('💰 พบ', npc.name, '@(', npc.x, npc.y + ')'); }
        else { setSellState('MOVE_TO_NPC'); log('⚠️ ไม่พบ NPC', CFG.sellNpcName, '→ ลองเดินหา'); }
      }
      return;
    }
    if (sellState === 'MOVE_TO_NPC') {
      const npc = sellNpcId ? entities.get(sellNpcId) : null;
      if (!npc || !npc.alive || npc.x == null) {
        // NPC หาย → ลองหาใหม่
        const found = findSellNpc();
        if (found) { sellNpcId = found.id; }
        else { abortSell('ไม่พบ NPC ' + CFG.sellNpcName); return; }
      }
      if (player.x != null) {
        const d = Math.hypot(npc.x - player.x, npc.y - player.y);
        if (d <= 3) {
          // ใกล้แล้ว → คุย NPC
          if (now - sellStateAt > 1500) { sendNpcTalk(sellNpcId); setSellState('TALK'); log('💰 คุย NPC', npc.name); }
        } else {
          // เดินไปหา (throttle 1s)
          if (now - (sellState._lastMove || 0) > 1000) { sellState._lastMove = now; sendMove(npc.x, npc.y); }
        }
      }
      return;
    }
    if (sellState === 'TALK') {
      // รอ 0x4d sub=2 (handler จะเปลี่ยน state) — ถ้า 5s ไม่มา → คุยใหม่
      if (now - sellStateAt > 5000) { sendNpcTalk(sellNpcId); sellStateAt = now; log('💰 รอ dialog นาน → คุยใหม่'); }
      return;
    }
    if (sellState === 'SELECT_SELL') {
      // รอ 0x53 SELL_OPEN (handler จะเปลี่ยน state) — ถ้า 5s ไม่มา → abort
      if (now - sellStateAt > 5000) { abortSell('ไม่ได้รับ SELL_OPEN'); }
      return;
    }
    if (sellState === 'SELL') {
      // รอ 0x5b SELL_RESULT (handler จะเปลี่ยน state) — ถ้า 15s ไม่มา → abort
      if (now - sellStateAt > 15000) { abortSell('ไม่ได้รับ SELL_RESULT'); }
      return;
    }
    if (sellState === 'WARP_BACK') {
      // รอ 2s แล้ววาร์ปกลับ
      if (now - sellStateAt > 2000 && sellReturnTo) {
        sendTeleport(sellReturnTo.map, sellReturnTo.x, sellReturnTo.y);
        log('💰 วาร์ปกลับ', sellReturnTo.map);
        sellReturnTo = null;
        setSellState('IDLE');
      }
      return;
    }
  }, 1000);

  // ============================================================
  //  AUTO-STORAGE — state machine (mirror bot.js:1816-2047)
  //  IDLE → WARP_TO_KAFRA → MOVE_TO_KAFRA → TALK_KAFRA → SELECT_STORAGE
  //       → STORAGE_OPENED → MOVE_ITEMS → CLOSE_STORAGE → WARP_BACK → IDLE
  // ============================================================
  function findKafraNpc() {
    const target = (CFG.kafraName || '').toLowerCase();
    for (const e of entities.values()) {
      if (e.kind === 2 && e.alive && e.x != null && e.name && e.name.toLowerCase().includes(target)) return e;
    }
    return null;
  }
  function setStorageState(s) { storageState = s; storageStateAt = nowMs(); }
  function abortStorage(reason) {
    log('⚠️ ยกเลิกฝาก:', reason);
    storageState = 'IDLE'; storageStateAt = 0;
    storageMoveQueue = []; storageMoveIdx = 0;
    if (storageReturnTo && storageReturnTo.map) { sendTeleport(storageReturnTo.map, storageReturnTo.x, storageReturnTo.y); }
    storageReturnTo = null;
  }
  // ★ เริ่มฝากของ — จด returnTo แล้ววาร์ปไปแมป Kafra
  function startStorage(reason, returnTo) {
    const kx = (CFG.kafraMapX && CFG.kafraMapX > 0) ? CFG.kafraMapX : CFG.sellNpcX;
    const ky = (CFG.kafraMapY && CFG.kafraMapY > 0) ? CFG.kafraMapY : CFG.sellNpcY;
    storageReturnTo = returnTo || { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) };
    log('🏦 เริ่มฝากของ (' + reason + ') → วาร์ปไป', CFG.kafraMap, '@(', kx, ky + ')');
    sendTeleport(CFG.kafraMap, kx, ky);
    setStorageState('WARP_TO_KAFRA');
  }
  // ★ สร้าง queue ของที่จะฝาก — แยก equipment vs stackable (mirror bot.js:1947-1987)
  function buildDepositQueue() {
    const queue = [];
    for (const itemId of CFG.depositItemIds) {
      const stock = inventory.get(itemId) || 0;
      if (stock <= 0) continue;
      const eqSlots = equipmentSlots.get(itemId);
      if (eqSlots && eqSlots.length > 0) {
        // ★★ equipment — ฝากจาก slot สูง→ต่ำ (กัน index shift) ทีละชิ้น amount=1
        const sorted = [...eqSlots].sort((a, b) => b - a);
        for (const slotId of sorted) queue.push({ itemId, amount: 1, invId: slotId, isEquipment: true });
      } else {
        // ★ stackable — ทั้งกองทีเดียว (moveId = itemId)
        queue.push({ itemId, amount: stock, invId: itemId, isEquipment: false });
      }
    }
    return queue;
  }
  const storageLoop = setInterval(() => {
    if (!CFG.storageEnabled) return;
    if (!activeWS || activeWS.readyState !== 1) return;
    if (isDead) return;
    // ★ กัน race: ถ้า sell กำลังทำอยู่ → รอก่อน (storage จะ trigger หลัง sell เสร็จผ่าน depositAfterSell chain)
    if (sellState !== 'IDLE') return;
    const now = nowMs();

    // === trigger (IDLE เท่านั้น) ===
    if (storageState === 'IDLE') {
      let shouldDeposit = false; let reason = '';
      // trigger 1: ของเต็ม (เหมือน sell แต่ฝากแทน)
      if (CFG.depositOnFull && inventoryFull && CFG.depositItemIds.length > 0) { shouldDeposit = true; reason = 'ของเต็ม'; }
      if (shouldDeposit && currentMap && player.x != null) startStorage(reason, null);
      return;
    }

    // === watchdog: ค้าง >60s → ยกเลิก ===
    if (now - storageStateAt > 60000) { abortStorage('timeout (' + storageState + ' 60s)'); return; }

    if (storageState === 'WARP_TO_KAFRA') {
      if (now - storageStateAt > 3000) {
        const npc = findKafraNpc();
        if (npc) { storageNpcId = npc.id; setStorageState('MOVE_TO_KAFRA'); log('🏦 พบ', npc.name, '@(', npc.x, npc.y + ')'); }
        else { abortStorage('ไม่พบ Kafra ' + CFG.kafraName); return; }
      }
      return;
    }
    if (storageState === 'MOVE_TO_KAFRA') {
      const npc = storageNpcId ? entities.get(storageNpcId) : null;
      if (!npc || !npc.alive || npc.x == null) {
        const found = findKafraNpc();
        if (found) { storageNpcId = found.id; }
        else { abortStorage('ไม่พบ Kafra ' + CFG.kafraName); return; }
      }
      if (player.x != null) {
        const d = Math.hypot(npc.x - player.x, npc.y - player.y);
        if (d <= 3) {
          if (now - storageStateAt > 1500) { sendNpcTalk(storageNpcId); setStorageState('TALK_KAFRA'); log('🏦 คุย Kafra', npc.name); }
        } else {
          if (now - storageLastMoveAt > 1000) { storageLastMoveAt = now; sendMove(npc.x, npc.y); }
        }
      }
      return;
    }
    // TALK_KAFRA / SELECT_STORAGE จัดการโดย 0x4d handler (packet-driven)
    if (storageState === 'TALK_KAFRA') {
      // รอ dialog — ถ้านานเกินไป คุยใหม่
      if (now - storageStateAt > 5000) { sendNpcTalk(storageNpcId); storageStateAt = now; log('🏦 รอ dialog นาน → คุยใหม่'); }
      return;
    }
    if (storageState === 'SELECT_STORAGE') {
      // รอ menu — ถ้านานเกินไป คุยใหม่
      if (now - storageStateAt > 5000) { abortStorage('ไม่ได้รับเมนู Kafra'); }
      return;
    }
    if (storageState === 'STORAGE_OPENED') {
      // ★ build queue + เริ่มฝาก
      storageMoveQueue = buildDepositQueue();
      storageMoveIdx = 0;
      if (storageMoveQueue.length === 0) {
        log('🏦 ไม่มีของที่จะฝาก → ปิด storage');
        sendStorageClose();
        setStorageState('CLOSE_STORAGE');
      } else {
        const total = storageMoveQueue.length;
        const types = storageMoveQueue.filter(q => q.isEquipment).length;
        log('🏦 เปิด storage แล้ว → ฝาก', total, 'รายการ' + (types ? ' (' + types + ' equipment)' : ''));
        setStorageState('MOVE_ITEMS');
      }
      return;
    }
    if (storageState === 'MOVE_ITEMS') {
      // ★ ส่งของทีละชิ้น (รอ 800ms ระหว่างชิ้น กัน server บล็อก)
      if (now - storageLastMoveAt < 800) return;
      if (storageMoveIdx >= storageMoveQueue.length) {
        // ครบแล้ว → ปิด storage
        log('🏦 ฝากครบแล้ว → ปิด storage');
        sendStorageClose();
        setStorageState('CLOSE_STORAGE');
        return;
      }
      const item = storageMoveQueue[storageMoveIdx];
      const moveId = item.isEquipment ? item.invId : item.itemId;
      log('🏦 ฝาก', nameOf(item.itemId) + (item.isEquipment ? ' (slot ' + item.invId + ')' : ' ×' + item.amount));
      sendStorageMove(moveId, item.amount);
      // ★ optimistic: ลบ slot + ลด inventory count (server จะส่ง 0x32 removal ยืนยัน)
      if (item.isEquipment) {
        const slots = equipmentSlots.get(item.itemId);
        if (slots) {
          const i = slots.indexOf(item.invId);
          if (i >= 0) slots.splice(i, 1);
          if (slots.length === 0) equipmentSlots.delete(item.itemId);
        }
        const cur = inventory.get(item.itemId) || 0;
        if (cur > 1) inventory.set(item.itemId, cur - 1);
        else inventory.delete(item.itemId);
      } else {
        inventory.delete(item.itemId);   // stackable ทั้งกอง
      }
      storageMoveIdx++;
      storageLastMoveAt = now;
      return;
    }
    if (storageState === 'CLOSE_STORAGE') {
      // รอ 1.5s หลัง close แล้ววาร์ปกลับ
      if (now - storageStateAt > 1500 && storageReturnTo) {
        sendTeleport(storageReturnTo.map, storageReturnTo.x, storageReturnTo.y);
        log('🏦 วาร์ปกลับ', storageReturnTo.map);
        storageReturnTo = null;
        setStorageState('IDLE');
      }
      return;
    }
  }, 1000);
  // ---------- entity tracker ----------
  //  kind: 0=player, 1=monster, 2=NPC (จาก SPAWN)
  const entities = new Map();    // id -> {id,kind,sub,name,x,y,hp,hpMax,alive,_lastEngagedByOtherAt,_lastDamageAt}
  const monsterAggro = new Map(); // monsterId -> timestamp (มอนจับเราเป็นเป้า)
  const stalePlayerIds = new Map(); // oldPlayerId -> expireAt (กัน phantom entity จาก ID เก่า, 5 นาที)
  function isStaleId(id, now) {
    const exp = stalePlayerIds.get(id);
    if (!exp) return false;
    if (now >= exp) { stalePlayerIds.delete(id); return false; }
    return true;
  }
  const mobAttackers = new Map(); // monsterId -> timestamp (มอนตีเรา)

  // ---------- AUTO-SELL + AUTO-STORAGE state + inventory ----------
  const inventory = new Map();    // itemId -> count (authoritative from 0x32, mirror world.js:34)
  const equipmentSlots = new Map(); // ★ itemId -> [slotId, slotId, ...] (mirror world.js:773-777)
  let inventoryFull = false;      // true เมื่อ server ส่ง "too full" (0x20)
  let sellState = 'IDLE';         // IDLE|WARP_TO_NPC|MOVE_TO_NPC|TALK|SELECT_SELL|SELL|WARP_BACK
  let sellStateAt = 0;            // timestamp เข้า state (watchdog)
  let sellReturnTo = null;        // {map,x,y} ที่จะวาร์ปกลับหลังขาย
  let sellNpcId = null;           // NPC entity id (หาจาก entities)
  let lastSellAt = 0;             // throttle interval
  // ---------- AUTO-STORAGE state (mirror bot.js:1817-1824) ----------
  let storageState = 'IDLE';      // IDLE|WARP_TO_KAFRA|MOVE_TO_KAFRA|TALK_KAFRA|SELECT_STORAGE|STORAGE_OPENED|MOVE_ITEMS|CLOSE_STORAGE|WARP_BACK
  let storageStateAt = 0;         // timestamp เข้า state (watchdog)
  let storageReturnTo = null;     // {map,x,y} ที่จะวาร์ปกลับหลังฝาก
  let storageNpcId = null;        // Kafra entity id
  let storageMoveQueue = [];      // [{itemId, amount, invId, isEquipment}]
  let storageMoveIdx = 0;         // index ใน queue ที่กำลังส่ง
  let storageLastMoveAt = 0;      // throttle MOVE_TO_KAFRA + MOVE_ITEMS
  let noMonsterSince = 0;        // timestamp ที่เริ่มไม่เจอมอน
  let lastWanderAt = 0;
  let lastNavLogTag = '';   // ★ track last nav log target (กัน spam log)
  let lastFleeAt = 0;
  let lastWarpFindAt = 0;        // throttle warpFind กัน spam
  let lastTargetSwitchAt = 0;    // throttle การสลับ target (กันสลับบ่อย)

  // ---------- combat target state ----------
  let target = null;             // {id, x, y, acquiredAt, engageAt, lastAttackAt, lastAttackResultAt, pendingAttacks, stuckCount, warpCount}
  let lastWalkPos = null;        // {x,y} สำหรับ stuck detection
  let stuckWalkCount = 0;
  let stuckAbandonCount = 0;
  let stuckAbandonHistory = [];  // timestamps ใน 60s
  const warpToMonsterCount = new Map(); // entityId -> count

  // ---------- combat helpers ----------
  function nowMs() { return Date.now(); }

  // whitelist/blacklist matching (รองรับทั้งชื่อ + sprite id แบบ number)
  function matchList(entity, list) {
    if (!list || !list.length) return false;
    return list.some(e => {
      if (typeof e === 'number') return entity.sub === e;
      return entity.name && entity.name.toLowerCase() === String(e).toLowerCase();
    });
  }
  function isTargetable(m, now) {
    if (!m || !m.alive) return false;
    if (m.kind !== 1) return false;                       // ตีเฉพาะ monster
    if (m.x == null || m.y == null) return false;
    if (isStaleId(m.id, now)) return false;               // ★ skip stale player IDs (phantom)
    // ★ ข้ามมอนที่เพิ่ง abandon (กันเลือกตัวเดิมซ้ำทันที → วนลูป)
    const ab = abandonCooldown.get(m.id);
    if (ab && now < ab) return false;
    if (ab && now >= ab) abandonCooldown.delete(m.id);    // หมดอายุ → ล้าง
    // ★ ผ่อน guard: ต้องเคยเห็น SPAWN (มี sub) หรืออยู่ใกล้ตัวเรามาก (≤12 ช่อง — NPC มักนิ่ง ไม่ใช่อันตราย)
    //   กัน ghost entity ไกลๆ แต่ยอมรับมอนใกล้ที่อาจยังไม่ได้ SPAWN
    if (m.sub == null) {
      if (player.x == null) return false;
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d > 12) return false;                           // ghost ไกล → ข้าม (รอ SPAWN)
    }
    if (matchList(m, CFG.targetBlacklist)) return false;
    if (CFG.targetWhitelist.length && !matchList(m, CFG.targetWhitelist)) return false;
    // anti-KS: ข้ามมอนที่คนอื่นตีอยู่ — ★ ยกเว้นถ้าเรา claim แล้ว (mirror world.js:1855 !e._claimedByMe)
    if (CFG.antiKS && !m._claimedByMe && m._lastEngagedByOtherAt && now - m._lastEngagedByOtherAt < CFG.antiKSCooldownMs) return false;
    // avoid players: ข้ามมอนที่อยู่ใกล้ผู้เล่นคนอื่น — ★ ยกเว้นถ้าเรา claim (mirror world.js:1851 !e._claimedByMe)
    if (CFG.avoidOtherPlayers && !m._claimedByMe) {
      for (const e of entities.values()) {
        // ★ ต้องมี name ด้วย (mirror world.js:1777) — กัน ghost entity kind=0 ที่ไม่มีชื่อ
        if (e.kind === 0 && e.alive && e.id !== playerId && e.x != null && e.name && !isStaleId(e.id, now)) {
          if (Math.hypot(e.x - m.x, e.y - m.y) <= CFG.playerProximityRadius) return false;
        }
      }
    }
    return true;
  }
  function getMonsters(now) {
    const out = [];
    for (const m of entities.values()) {
      if (isTargetable(m, now || nowMs())) out.push(m);
    }
    return out;
  }
  function countMonsters(radius) {
    if (player.x == null) return 0;
    const now = nowMs();
    let n = 0;
    for (const m of entities.values()) {
      if (m.kind !== 1 || !m.alive || m.x == null) continue;
      if (isStaleId(m.id, now)) continue;   // ★ skip stale player IDs (mirror world.js:1904)
      if (Math.hypot(m.x - player.x, m.y - player.y) <= radius) n++;
    }
    return n;
  }
  // นับมอนที่ aggro เรา (MONSTER_SKILL dstId=player) ที่ยังมีอยู่จริง — สำหรับ UI/แสดงผล
  function getAggroCount(radius) {
    const now = nowMs();
    let n = 0;
    for (const [id, t] of monsterAggro) {
      if (now - t > (CFG.aggroKeepAliveMs || 10000)) { monsterAggro.delete(id); continue; }
      const m = entities.get(id);
      if (!m || !m.alive || m.x == null) { monsterAggro.delete(id); continue; }
      if (isStaleId(id, now)) { monsterAggro.delete(id); continue; }
      if (player.x != null && radius && Math.hypot(m.x - player.x, m.y - player.y) > radius) continue;
      n++;
    }
    return n;
  }
  // ★ getThreatCount = max(aggro, nearby) — สำหรับ flee logic (mirror world.js:1018-1044)
  function getThreatCount(radius) {
    return Math.max(getAggroCount(radius), radius ? countMonsters(radius) : 0);
  }
  function getMobAttackerCount(radius) {
    const now = nowMs();
    let n = 0;
    for (const [id, t] of mobAttackers) {
      if (now - t >= CFG.fleeMobWindowMs) { mobAttackers.delete(id); continue; }   // หมดอายุ → ลบ
      if (isStaleId(id, now)) { mobAttackers.delete(id); continue; }              // stale player ID → ลบ
      const m = entities.get(id);
      if (!m || !m.alive || m.x == null) { mobAttackers.delete(id); continue; }   // entity หาย → ลบ
      // ถ้าระบุ radius → นับเฉพาะในรัศมี (เหมือน aggro)
      if (radius && player.x != null && Math.hypot(m.x - player.x, m.y - player.y) > radius) continue;
      n++;
    }
    return n;
  }
  // คำนวณ HP% (default 1.0 ถ้าไม่รู้)
  function monsterHpPct(m) { return (m.hpMax && m.hpMax > 0 && m.hp != null) ? m.hp / m.hpMax : 1.0; }
  // เลือกมอนใกล้สุด ในรัศมีที่กำหนด (default = maxAcquireDistance)
  function findNearestMonster(now, radius) {
    if (player.x == null) return null;
    const cap = (radius != null) ? radius : CFG.maxAcquireDistance;
    let best = null, bestD = Infinity;
    for (const m of getMonsters(now)) {
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d > cap) continue;   // ★ เกินรัศมีที่กำหนด → ข้าม
      if (d < bestD) { bestD = d; best = m; }
    }
    return best ? { m: best, dist: bestD } : null;
  }
  // เลือกมอน HP% ต่ำสุด (tiebreak = ระยะ) ในรัศมีที่กำหนด
  function findLowestHpMonster(now, radius) {
    if (player.x == null) return null;
    const cap = (radius != null) ? radius : CFG.maxAcquireDistance;
    let best = null, bestHp = 2, bestD = Infinity;
    for (const m of getMonsters(now)) {
      const hp = monsterHpPct(m);
      const d = Math.hypot(m.x - player.x, m.y - player.y);
      if (d > cap) continue;   // ★ เกินรัศมีที่กำหนด → ข้าม
      if (hp < bestHp || (hp === bestHp && d < bestD)) { bestHp = hp; bestD = d; best = m; }
    }
    return best ? { m: best, dist: bestD, hpPct: bestHp } : null;
  }

  // ---------- combat encoders ----------
  // ATTACK OUT: [0b][target_id:4]
  let lastAttackSentAt = 0;        // ★ timestamp ที่เราส่ง ATTACK ล่าสุด
  let lastAttackSentTarget = null; // ★ targetId ที่เราส่ง ATTACK ใส่
  function sendAttack(targetId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5);
    b[0] = 0x0b;
    b[1] = targetId & 0xff; b[2] = (targetId >> 8) & 0xff;
    b[3] = (targetId >> 16) & 0xff; b[4] = (targetId >>> 24) & 0xff;
    activeWS.send(b);
    lastAttackSentAt = nowMs();    // ★ track เพื่อ heuristic anti-KS ใน 0x17
    lastAttackSentTarget = targetId;
    return true;
  }
  // ★ SKILL OUT (mirror protocol.js:223-248):
  //   targeted (sub=01): [1d][01][targetId:4][skillId:1][level:1]  — Bash, Charge Attack
  //   AoE/self (sub=05): [1d][05][skillId:2 LE][level:1]           — Magnum Break, Two-Hand Quicken
  // ★ SKILL OUT (mirror protocol.js:223-248 + capture Arrow Shower):
  //   targeted (sub=01): [1d][01][targetId:4][skillId:1][level:1]  — Bash, Charge Arrow
  //   ground (sub=04):   [1d][04][x:2][y:2][skillId:1][level:1]    — Arrow Shower (เลือกพื้นที่)
  //   AoE/self (sub=05): [1d][05][skillId:2 LE][level:1]           — Magnum Break, Quicken
  function sendSkill(skillId, level, targetId, groundX, groundY) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (targetId != null) {
      // ★ targeted: [1d][01][targetId:4][skillId:1][level:1]
      const b8 = new Uint8Array(8);
      b8[0] = 0x1d; b8[1] = 0x01;
      b8[2] = targetId & 0xff; b8[3] = (targetId >> 8) & 0xff;
      b8[4] = (targetId >> 16) & 0xff; b8[5] = (targetId >>> 24) & 0xff;
      b8[6] = skillId & 0xff;
      b8[7] = level & 0xff;
      activeWS.send(b8);
    } else if (groundX != null && groundY != null) {
      // ★ ground-targeted: [1d][04][x:2 LE][y:2 LE][skillId:1][level:1]
      const b = new Uint8Array(8);
      b[0] = 0x1d; b[1] = 0x04;
      b[2] = groundX & 0xff; b[3] = (groundX >> 8) & 0xff;
      b[4] = groundY & 0xff; b[5] = (groundY >> 8) & 0xff;
      b[6] = skillId & 0xff;
      b[7] = level & 0xff;
      activeWS.send(b);
    } else {
      // ★ AoE/self-cast: [1d][05][skillId:2 LE][level:1]
      const b = new Uint8Array(5);
      b[0] = 0x1d; b[1] = 0x05;
      b[2] = skillId & 0xff; b[3] = (skillId >> 8) & 0xff;
      b[4] = level & 0xff;
      activeWS.send(b);
    }
    return true;
  }
  // ★ Auto-Skill tracking (mirror bot.js:48-56)
  const lastSkillUse = new Map();        // skillId → timestamp (cooldown)
  const skillUsesOnTarget = new Map();   // skillId → Map<targetId, count> (maxUsesPerTarget)
  // persist skill times ข้าม session
  const SKILL_TIMES_KEY = 'roAssistSkillTimes_v1';
  function loadSkillTimes() {
    try {
      const raw = localStorage.getItem(SKILL_TIMES_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const [id, ts] of Object.entries(obj)) lastSkillUse.set(Number(id), Number(ts) || 0);
      log('✨ โหลดเวลา skill ล่าสุด:', lastSkillUse.size, 'รายการ');
    } catch (e) {}
  }
  function saveSkillTimes() {
    try {
      const obj = {};
      for (const [id, ts] of lastSkillUse) obj[id] = ts;
      localStorage.setItem(SKILL_TIMES_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  let skillSaveTimer = null;
  function saveSkillTimesDebounced() {
    if (skillSaveTimer) clearTimeout(skillSaveTimer);
    skillSaveTimer = setTimeout(saveSkillTimes, 1000);
  }
  // MOVE OUT (click-move): [07][x:i16][y:i16] (signed)
  function sendMove(x, y) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5);
    b[0] = 0x07;
    writeI16LE(b, 1, Math.round(x));
    writeI16LE(b, 3, Math.round(y));
    navBotMoving = true;   // ★ flag: บอทสั่งเอง → handleOut ข้ามไม่บันทึก trail
    activeWS.send(b);
    return true;
  }
  // วาร์ปสุ่มในแมปปัจจุบัน (x=y=-999)
  function sendRandomWarp() {
    if (!currentMap) { log('⚠️ วาร์ปหนี: ยังไม่รู้ชื่อแมป'); return false; }
    return sendTeleport(currentMap, -999, -999);
  }
  // SIT/STAND OUT: [0e][state:1] (1=นั่ง, 0=ยืน) — format ยืนยันจากบอทหลัก protocol.js:381
  function sendSit() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x0e, 0x01]));
    return true;
  }
  function sendStand() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x0e, 0x00]));
    return true;
  }
  // ★ RESPAWN OUT: [29][00] — respawn กลับจุด save หลังตาย (2 bytes)
  //   format ยืนยันจากบอทหลัก protocol.js:356-360 (enc.respawn() = Buffer.from([0x29, 0x00]))
  function sendRespawn() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x29, 0x00]));
    return true;
  }
  // ★ CHAT OUT: [2c][msg_len:2 LE][msg UTF-8][chat_type:1]
  //   chatType: 0=nearby, 1=shout, 2=whisper (mirror protocol.js:362-369 enc.chat)
  function sendChat(message, chatType) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    if (!message) return false;
    const msgBytes = new TextEncoder().encode(message);
    if (msgBytes.length > 200) return false;   // cap 200 (mirror bot_server.js:1740)
    const b = new Uint8Array(1 + 2 + msgBytes.length + 1);
    b[0] = 0x2c;
    b[1] = msgBytes.length & 0xff; b[2] = (msgBytes.length >> 8) & 0xff;
    b.set(msgBytes, 3);
    b[3 + msgBytes.length] = chatType || 0;
    activeWS.send(b);
    return true;
  }
  // SELL encoders (mirror protocol.js:367,386,394)
  function sendNpcTalk(npcId) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5); b[0] = 0x4c;
    b[1] = npcId & 0xff; b[2] = (npcId >> 8) & 0xff; b[3] = (npcId >> 16) & 0xff; b[4] = (npcId >>> 24) & 0xff;
    activeWS.send(b); return true;
  }
  function sendNpcSelect(idx) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(5); b[0] = 0x4f;
    b[1] = idx & 0xff; b[2] = (idx >> 8) & 0xff; b[3] = (idx >> 16) & 0xff; b[4] = (idx >>> 24) & 0xff;
    activeWS.send(b); return true;
  }
  // [57][count:4][itemId:4][count:4] × N
  function sendSellItems(items) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(1 + 4 + items.length * 8);
    let p = 0; b[p++] = 0x57;
    b[p++] = items.length & 0xff; b[p++] = (items.length >> 8) & 0xff; b[p++] = (items.length >> 16) & 0xff; b[p++] = (items.length >>> 24) & 0xff;
    for (const it of items) {
      const id = it.itemId, c = it.count;
      b[p++] = id & 0xff; b[p++] = (id >> 8) & 0xff; b[p++] = (id >> 16) & 0xff; b[p++] = (id >>> 24) & 0xff;
      b[p++] = c & 0xff; b[p++] = (c >> 8) & 0xff; b[p++] = (c >> 16) & 0xff; b[p++] = (c >>> 24) & 0xff;
    }
    activeWS.send(b); return true;
  }
  // ============== STORAGE encoders (mirror protocol.js:371-415) ==============
  // [4e] NPC_NEXT — ไปหน้า dialog ถัดไป (Kafra มีหน้า intro ก่อนเมนู)
  function sendNpcNext() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x4e]));
    return true;
  }
  // [56][01][invId:4][amount:4] — ย้ายของจาก inventory → storage
  //   invId = itemId (stackable) หรือ slotId (equipment)
  //   หลักฐาน: 56 01 f4020000 08000000 → invId=756(Rough Oridecon) amount=8
  function sendStorageMove(invId, amount) {
    if (!activeWS || activeWS.readyState !== 1) return false;
    const b = new Uint8Array(10); let p = 0;
    b[p++] = 0x56; b[p++] = 0x01;
    b[p++] = invId & 0xff; b[p++] = (invId >> 8) & 0xff; b[p++] = (invId >> 16) & 0xff; b[p++] = (invId >>> 24) & 0xff;
    b[p++] = amount & 0xff; b[p++] = (amount >> 8) & 0xff; b[p++] = (amount >> 16) & 0xff; b[p++] = (amount >>> 24) & 0xff;
    activeWS.send(b); return true;
  }
  // [56][00] — ปิดหน้าต่าง storage
  function sendStorageClose() {
    if (!activeWS || activeWS.readyState !== 1) return false;
    activeWS.send(new Uint8Array([0x56, 0x00]));
    return true;
  }
  function clearCombatThreat() { monsterAggro.clear(); mobAttackers.clear(); }

  // ---------- combat state machine ----------
  // abandon target + (ถ้าเป็น stuck/ล้มเหลว) ตั้ง cooldown กันเลือกตัวเดิมซ้ำทันที
  //   cooldownMs: 0 = ไม่ตั้ง (เช่น ฆ่าได้/defensive ที่เป็นการเปลี่ยนเป้าปกติ)
  //   ★ เดินหลีก 1 ครั้ง เฉพาะตอน stuck=true (กันยืนนิ่งหลังตีไม่ติด/server เงียบ)
  //     กรณี stuck=false (ฆ่าได้/defensive/ไกลเกิน) ไม่เดิน เพราะมีเหตุผลอื่นหรือมีของตกต้องเก็บ
  function abandonTarget(reason, stuck, cooldownMs = 0) {
    if (target) {
      log('🚫 abandon target', target.id, '(' + reason + ')');
      if (cooldownMs > 0) abandonCooldown.set(target.id, nowMs() + cooldownMs);
      // ★ เคลียร์ claim (mirror bot.js:3914-3916) — กันมอนที่ abandon ดึงกลับมาวนลูป
      const e = entities.get(target.id);
      if (e && e._claimedByMe) e._claimedByMe = false;
      if (stuck) {
        stuckAbandonHistory.push(nowMs());
        stuckAbandonHistory = stuckAbandonHistory.filter(t => nowMs() - t < 60000);
        stuckAbandonCount = stuckAbandonHistory.length;
        // ★ เดินหลีกเฉพาะตอน stuck (กันยืนนิ่งหลังตีไม่ติด)
        if (player.x != null && player.y != null) {
          const angle = Math.random() * Math.PI * 2;
          const step = 5 + Math.random() * 7;   // 5-12 ช่อง
          const tx = Math.round(player.x + Math.cos(angle) * step);
          const ty = Math.round(player.y + Math.sin(angle) * step);
          if (sendMove(tx, ty)) log('🚶 เดินหลีกหลัง abandon @(', tx, ty + ')');
        }
      }
    }
    target = null;
    stuckWalkCount = 0;
  }
  function doFlee(reason) {
    const now = nowMs();
    if (now - lastFleeAt < CFG.fleeCooldownMs) return false;
    log('🏃 วาร์ปหนี:', reason);
    if (sendRandomWarp()) {
      lastFleeAt = now;
      clearCombatThreat();
      abandonTarget('flee', false);
      return true;
    }
    return false;
  }
  function acquireTarget(now) {
    // ★ cooldown: กันสลับ target บ่อยเกินไป (สลับได้ทุก 1.5s)
    if (now - lastTargetSwitchAt < 1500) return null;
    // whitelist ว่าง = ตีทุกมอน kind=1 (ตามความหมายของ whitelist); ตั้งค่า = ตีเฉพาะที่ match
    const mobCount = getMobAttackerCount();
    const useLowestHp = CFG.targetLowestHpFirst && mobCount >= 2;
    // ★ progressive search — ค้นจากรัศมีเล็กก่อน ถ้าเจอใช้เลย (mirror bot.js:3957-3963)
    //   ทำให้เลือกมอนใกล้ก่อนเสมอ แม้จะตั้ง maxAcquireDistance ไว้สูง
    const radii = (Array.isArray(CFG.searchRadii) && CFG.searchRadii.length > 0)
      ? [...CFG.searchRadii].sort((a, b) => a - b)
      : [CFG.maxAcquireDistance];
    let found = null;
    let usedRadius = 0;
    for (const r of radii) {
      found = useLowestHp ? findLowestHpMonster(now, r) : findNearestMonster(now, r);
      if (found) { usedRadius = r; break; }   // ★ เจอแล้วใช้เลย ไม่ขยายรัศมี
    }
    if (!found) return null;
    if (useLowestHp) {
      log('🎯 เลือกเป้า HP ต่ำสุด (รุม', mobCount, 'ตัว):', found.m.name, (found.hpPct * 100).toFixed(0) + '%', '@', found.dist.toFixed(1), '(r≤' + usedRadius + ')');
    } else {
      log('🎯 เลือกเป้าใกล้สุด:', found.m.name, '@', found.dist.toFixed(1), '(r≤' + usedRadius + ')');
    }
    const m = found.m;
    target = {
      id: m.id, x: m.x, y: m.y, acquiredAt: now, engageAt: 0,
      lastAttackAt: 0, lastAttackResultAt: 0, pendingAttacks: 0, firstAttackAt: 0,
      stuckCount: 0, warpCount: 0, lastDist: null,
    };
    lastTargetSwitchAt = now;
    skillUsesOnTarget.clear();   // ★ reset per-target skill uses (mirror bot.js:4083)
    return target;
  }
  // เดินไปหามอน — เดินเส้นตรงไปทางมอน + stuck detection ดูระยะลดลง
  let lastWalkToTargetAt = 0;
  let lastDistToTarget = null;
  let noProgressTicks = 0;
  const abandonCooldown = new Map();   // entityId → timestamp ที่ abandon (กันเลือกตัวเดิมซ้ำเลย)
  function walkToTarget(now, m) {
    if (player.x == null) return false;
    const dist = Math.hypot(m.x - player.x, m.y - player.y);
    // stuck detection: ดูว่าระยะลดลงไหม (แม่นกว่าดูพิกัดคงที่)
    if (lastDistToTarget != null) {
      if (dist < lastDistToTarget - 0.5) {
        noProgressTicks = 0;             // ใกล้ขึ้น → ไม่ stuck
      } else {
        noProgressTicks++;               // ไม่ใกล้ขึ้น → นับ stuck
      }
    }
    lastDistToTarget = dist;

    // ★ stuck จริงๆ (ระยะไม่ลด ≥10 tick ≈ 8s+) → return 'STUCK' ให้ caller ตัดสินใจ (warpToMonster/abandon)
    //   ไม่ abandon เองที่นี่ เพื่อให้ caller ควบคุม (เช่น warpToMonster อาจช่วยได้)
    if (noProgressTicks >= 10) {
      log('🚧 stuck: ไม่เข้าใกล้ ' + noProgressTicks + ' tick @ dist ' + dist.toFixed(1));
      return 'STUCK';
    }

    if (now - lastWalkToTargetAt < 800) return false;
    lastWalkToTargetAt = now;
    // เดินเส้นตรงไปทางมอน (step = min(ระยะที่เหลือ, walkStepDistance) — สั่งทีละ ≤20 ช่อง)
    let angle = Math.atan2(m.y - player.y, m.x - player.x);
    // ถ้า stuck (ระยะไม่ลด) → เปลี่ยนทิศตั้งฉากบ้างเพื่อหาทางอ้อม
    if (noProgressTicks >= 3) angle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
    else angle += (Math.random() * 2 - 1) * (Math.PI / 12);   // ±15° jitter เล็กน้อย
    const step = Math.min(dist, CFG.walkStepDistance);
    const tx = player.x + Math.cos(angle) * step;
    const ty = player.y + Math.sin(angle) * step;
    if (sendMove(tx, ty)) { log('🚶 เดินไปหา', m.name || m.id.toString(16), '@(', Math.round(tx), Math.round(ty) + ') dist=' + dist.toFixed(1) + ' step=' + Math.round(step) + ' stuck=' + noProgressTicks); return 'WALKING'; }
    return false;
  }

  let combatCooldownUntil = 0;   // ★ หยุด combat ชั่วคราวจนกว่าจะถึงเวลานี้ (post-combat delay)
  const combatLoop = setInterval(() => {
    if (!CFG.combatEnabled) return;
    const now = nowMs();
    // ★★ sync player position จาก entities map — fallback สำคัญ!
    //   หลังล็อกอิน server อาจไม่ส่ง pos ของเราโดยตรง → player.x/y เป็น null → bot ยืนนิ่ง
    //   แต่ SPAWN สร้าง entity ของเราไว้ใน map แล้ว → ดึง pos จากนั้น
    if (player.x == null && playerId != null) {
      const me = entities.get(playerId);
      if (me && me.x != null) { player.x = me.x; player.y = me.y; }
    }
    // ★★★ AUTO-RESPAWN — priority สูงสุด: ถ้าตาย → respawn กลับจุด save (mirror bot.js:1404-1406)
    if (isDead) {
      if (CFG.autoRespawnEnabled && activeWS && activeWS.readyState === 1) {
        if (now - lastRespawnAt >= CFG.autoRespawnDelayMs) {
          if (sendRespawn()) {
            lastRespawnAt = now;
            target = null; monsterAggro.clear(); mobAttackers.clear();
            postRespawnRest = true;   // ★ บังคับนั่งพักหลัง respawn
            log('💀 ตาย! → respawn กลับจุด save');
            logImportant('flee', '💀 ตาย → respawn กลับจุด save');
          }
        }
      }
      return;
    }
    if (!activeWS || activeWS.readyState !== 1) return;
    // ★ POST-RESPAWN REST — หลัง respawn บังคับนั่งพักจนเลือดเต็ม (restUntilPercent)
    //   เหมือน auto-rest ปกติ แต่ trigger จาก flag postRespawnRest ไม่ใช่ HP%
    if (postRespawnRest && CFG.restEnabled && hp.cur != null) {
      const pct = hpPct();
      if (!isResting && pct != null && pct < CFG.restUntilPercent) {
        if (sendSit()) {
          isResting = true;
          restUntil = now + CFG.restMaxSec * 1000;
          log('🪑 [post-respawn] นั่งพักจนเลือดเต็ม: HP', pct.toFixed(0) + '% → ' + CFG.restUntilPercent + '%');
        }
        return;
      }
      if (isResting) {
        if (pct != null && pct >= CFG.restUntilPercent || now >= restUntil) {
          if (sendStand()) { log('🪑 [post-respawn] ลุกยืน: HP', pct.toFixed(0) + '% → กลับฟาร์ม'); }
          isResting = false;
          postRespawnRest = false;   // ★ เคลียร์ flag — กลับสู่ฟาร์มปกติ
          combatCooldownUntil = now + CFG.postCombatDelayMs;
        }
        return;   // ยังนั่งอยู่ → หยุดทุกอย่าง
      }
    }
    // ★ farm map guard: ถ้าตั้ง farmMap ไว้ และตอนนี้ไม่ได้อยู่แมปฟาร์ม → ไม่ฟาร์ม
    //   + retry วาร์ปกลับทุก 5s (กันติดแมปผิดถ้าวาร์ปครั้งแรกไม่สำเร็จ)
    //   ★★ ยกเว้น sellNpcMap/kafraMap เฉพาะตอนกำลังขาย/ฝากอยู่ (state ≠ IDLE)
    //      ถ้า abort แล้ว (state = IDLE) ต้องวาร์ปกลับฟาร์ม ไม่งั้นติดในเมือง
    const inSellRoutine = sellState !== 'IDLE';
    const inStorageRoutine = storageState !== 'IDLE';
    if (CFG.farmMap && currentMap && currentMap !== CFG.farmMap
        && !(inSellRoutine && currentMap === CFG.sellNpcMap)
        && !(inStorageRoutine && currentMap === CFG.kafraMap)) {
      const now2 = nowMs();
      if (now2 - (lastFarmWarpBackAt || 0) > 5000) {
        log('🌀 ยังอยู่แมปผิด (' + currentMap + ') → วาร์ปกลับอีกครั้ง');
        sendTeleport(CFG.farmMap, CFG.farmMapX, CFG.farmMapY);
        lastFarmWarpBackAt = now2;
      }
      return;
    }
    const pct = hpPct();
    const mobCount = getMobAttackerCount();

    // === -1. AUTO-REST (priority สูงสุด — ก่อน flee) ===
    //   ถ้า HP ต่ำ + ไม่โดนรุม → นั่งพัก; ถ้ากำลังนั่งอยู่ → จัดการลุก/นั่งต่อ
    if (CFG.restEnabled && pct != null && hp.cur != null) {
      if (!isResting && pct < CFG.restHpPercent && mobCount === 0) {
        // เริ่มนั่งพัก
        if (sendSit()) {
          isResting = true;
          restUntil = now + CFG.restMaxSec * 1000;
          log('🪑 นั่งพัก: HP', pct.toFixed(0) + '% < ' + CFG.restHpPercent + '% (นานสุด ' + CFG.restMaxSec + 's หรือจนถึง ' + CFG.restUntilPercent + '%)');
        }
        return;
      }
      if (isResting) {
        // โดนรุมระหว่างนั่ง → ลุกทันทีเพื่อตีตอบ (ไม่ return — ให้ flee/defensive ทำงานต่อ)
        if (mobCount > 0) {
          if (sendStand()) { log('⚠️ โดนรุมระหว่างนั่ง → ลุกทันที'); }
          isResting = false;
        }
        // ฟื้นถึง restUntilPercent หรือหมดเวลา → ลุก
        else if (pct >= CFG.restUntilPercent || now >= restUntil) {
          if (sendStand()) { log('🪑 ลุกยืน: HP', pct.toFixed(0) + '% (≥ ' + CFG.restUntilPercent + '%)'); }
          isResting = false;
          combatCooldownUntil = now + CFG.postCombatDelayMs;   // พักเล็กน้อยก่อนเริ่ม
        }
        else { return; }   // ยังนั่งอยู่ → หยุดทุกอย่าง
      }
    }

    // === 0. post-combat cooldown — รอหลังสู้เสร็จ/เก็บของเสร็จ ก่อนทำอย่างอื่น ===
    //   ยกเว้น flee (ต้องทำทันทีเสมอเพื่อความปลอดภัย)
    const inCooldown = now < combatCooldownUntil;
    // ★ flee from specific monsters — เจอมอนอันตรายในระยะ → วาร์ปหนีทันที (mirror bot.js:3241-3281)
    if (CFG.fleeMonsters && CFG.fleeMonsters.length > 0 && player.x != null) {
      const fleeR = CFG.fleeMonsterRadius || 20;
      for (const e of entities.values()) {
        if (!e.alive || e.kind !== 1 || e.x == null) continue;
        if (isStaleId(e.id, now)) continue;
        const name = (e.name || '').toLowerCase();
        const subId = e.sub != null ? String(e.sub) : null;
        const isDanger = CFG.fleeMonsters.some(n => {
          const ns = String(n).toLowerCase();
          if (name && name === ns) return true;
          if (subId && subId === ns) return true;
          return false;
        });
        if (isDanger) {
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d <= fleeR) {
            log('🚨 เจอ', e.name || e.id.toString(16), 'ในระยะ', d.toFixed(1), 'ช่อง → วาร์ปหนี!');
            logImportant('flee', '🚨 หนีมอน! เจอ ' + (e.name || e.id.toString(16)) + ' ในระยะ ' + d.toFixed(0) + ' ช่อง');
            if (sendRandomWarp()) {
              target = null; monsterAggro.clear(); mobAttackers.clear();
              lastFarmWarpBackAt = now;
            }
            return;
          }
        }
      }
    }
    if (CFG.fleeOnMobCount > 0 && getMobAttackerCount(CFG.fleeOnProximityRadius) >= CFG.fleeOnMobCount) { doFlee('รุม ' + getMobAttackerCount(CFG.fleeOnProximityRadius) + ' ตัว'); return; }
    if (CFG.fleeOnAggroCount > 0 && getThreatCount(CFG.fleeOnProximityRadius) >= CFG.fleeOnAggroCount) { doFlee('aggro ' + getThreatCount(CFG.fleeOnProximityRadius) + ' ตัว'); return; }
    if (CFG.fleeOnProximityCount > 0 && countMonsters(CFG.fleeOnProximityRadius) >= CFG.fleeOnProximityCount) { doFlee('มอนรอบ ' + countMonsters(CFG.fleeOnProximityRadius) + ' ตัว'); return; }
    if (inCooldown && mobCount === 0) return;   // อยู่ใน cooldown + ไม่โดนรุม → รอ

    // === 1b. ★ ถ้ามีของรอเก็บ → หยุด combat ชั่วคราว ให้ loot ทำงานก่อน ===
    //   เหตุผล: ฆ่ามอนได้ → เก็บของก่อน แล้วค่อยไปตีตัวใหม่ (เหมือนบอทหลัก _lootBlockingFarm)
    //   ยกเว้น: ถ้ากำลังโดนรุม (mobAttackers ≥1) → ยังตีต่อเพื่อป้องกันตัวเอง
    if (CFG.lootEnabled && queue.size > 0 && getMobAttackerCount() === 0) {
      return;   // มีของรอเก็บ + ไม่โดนรุม → รอ lootLoop เก็บก่อน
    }

    // === 1c. ★ warp guard — หลังวาร์ป player.x/y ค้างจนกว่า server จะส่ง MOVE_UPDATE ใหม่
    //   ถ้าคำนวณ dist ตอนนี้จะได้ค่าผิด (dist 0.0 หลอก) → ตีไม่ได้ → pending ขึ้น
    //   แก้: รอจนกว่า player pos จะเปลี่ยนจากก่อนวาร์ป (หรือหมดเวลา 3s)
    if (now < warpGuardUntil && lastWarpPlayerPos) {
      if (player.x === lastWarpPlayerPos.x && player.y === lastWarpPlayerPos.y) {
        return;   // pos ยังไม่เปลี่ยน → รอ (dist จะผิดถ้าคำนวณตอนนี้)
      }
      // pos เปลี่ยนแล้ว → เคลียร์ guard
      warpGuardUntil = 0;
      lastWarpPlayerPos = null;
    }
    // ★★ หลังหมดเวลา warp guard (3s) — ถ้าตำแหน่งยังเดิม → null ทิ้ง กันใช้ค่าเก่าไปตลอด
    //   ถ้าใช้ค่าเก่า → bot จะคำนวณ dist ผิด → ไม่เจอมอน → วาร์ปสุ่มซ้ำๆ → ตำแหน่งค้างตลอด
    if (now >= warpGuardUntil && lastWarpPlayerPos && player.x === lastWarpPlayerPos.x && player.y === lastWarpPlayerPos.y) {
      log('⚠️ ตำแหน่งค้างหลังวาร์ป 3s → รอ server ส่ง pos ใหม่');
      player.x = null; player.y = null;
      lastWarpPlayerPos = null;
      return;
    }

    // === 1b. Defensive retarget === ถ้าโดนมอนตี (ที่ไม่ใช่ target ปัจจุบัน) → สลับมาตีตัวนั้น
    //   สำคัญ: ถ้ามอน aggro เรา ต้องสู้กลับ ไม่ใช่เดินหาตัวอื่น
    //   ★★ sticky target guard: ถ้ากำลังตีอยู่ + server ตอบกลับ < 5s → ไม่สลับ (กันสลับไปมา)
    if (player.x != null && !(target && target.lastAttackResultAt && now - target.lastAttackResultAt < 5000)) {
      let attacker = null, attackerDist = Infinity;
      for (const [aid, at] of mobAttackers) {
        if (now - at > CFG.fleeMobWindowMs) { mobAttackers.delete(aid); continue; }
        if (target && aid === target.id) continue;   // ตัวที่กำลังตีอยู่แล้ว → ข้าม
        const am = entities.get(aid);
        if (!am || !am.alive || am.x == null) continue;
        if (!isTargetable(am, now)) continue;         // ตัวที่ตีเราต้อง targetable ด้วย
        const d = Math.hypot(am.x - player.x, am.y - player.y);
        if (d < attackerDist) { attackerDist = d; attacker = am; }
      }
      if (attacker) {
        if (target) abandonTarget('defensive → ตีตัวที่รุม', false);
        target = { id: attacker.id, x: attacker.x, y: attacker.y, acquiredAt: now, engageAt: 0, lastAttackAt: 0, lastAttackResultAt: 0, pendingAttacks: 0, firstAttackAt: 0, stuckCount: 0, warpCount: 0 };
        lastTargetSwitchAt = now;
        log('🛡️ สลับเป้า: ตีตัวที่กำลังตีเรา', attacker.name || attacker.id.toString(16));
        return;
      }
    }

    // === 2. Target validation / abandon ===
    if (target) {
      const m = entities.get(target.id);
      if (!m || !m.alive) { abandonTarget('ตาย/หาย', false); target = null; }
      else {
        target.x = m.x; target.y = m.y;
        // ★ ถ้ากำลังเข้าใกล้ขึ้น (dist ลด) → อย่า abandon (กำลังทำงานถูกต้อง)
        const curDist = (player.x != null) ? Math.hypot(m.x - player.x, m.y - player.y) : Infinity;
        if (target._lastDist != null && curDist < target._lastDist - 0.5) {
          target.pendingAttacks = 0;   // เข้าใกล้ขึ้น → reset pending (ไม่ใช่ stuck)
        }
        target._lastDist = curDist;
        // abandon เฉพาะเคสจริง: engage นานเกิน หรือ pending สูง (server เงียบ)
        const engageAge = target.engageAt ? (now - target.engageAt) / 1000 : 0;
        const acquireAge = (now - target.acquiredAt) / 1000;
        // ★ มอนยัง "กำลังสู้กับเรา" → ยกเลิก abandon จาก pending/server เงียบ
        //   สัญญาณ 3 อย่าง (อย่างน้อย 1 อย่างล่าสุด):
        //   1. monsterAggro (0x18) — มอนเลือกเราเป็นเป้า
        //   2. mobAttackers — มอนตีเรา
        //   3. _lastDamageAt — เราสร้าง damage ให้มอนได้จริง (สำคัญสำหรับมอนนิ่ง เช่น ไข่/เห็ด ที่ไม่ตีกลับ)
        const targetAggro = monsterAggro.get(target.id);
        const targetHitUs = mobAttackers.get(target.id);
        const targetDamaged = m._lastDamageAt;   // ★ เราตีมอนแล้วโดน (HP ลด)
        const lastCombatSignal = Math.max(targetAggro || 0, targetHitUs || 0, targetDamaged || 0);
        const isTargetStillEngaged = lastCombatSignal && (now - lastCombatSignal < CFG.aggroKeepAliveMs);
        // ★ มอน "ตีช้า" (mushroom/plant/เจาะไม่เข้า) → ใช้ maxEngageSecSlow (ยาวกว่า) กัน abandon ก่อนฆ่าทัน
        const isSlowMonster = m.sub != null && Array.isArray(CFG.slowMonsterSubIds) && CFG.slowMonsterSubIds.includes(m.sub);
        const engageLimit = isSlowMonster ? (CFG.maxEngageSecSlow || 180) : CFG.maxEngageSec;
        if (target.engageAt && engageAge > engageLimit && !isTargetStillEngaged) {
          abandonTarget('engage นาน ' + engageAge.toFixed(0) + 's' + (isSlowMonster ? ' (slow)' : ''), true, 10000); target = null;
        }
        else if (!target.engageAt && acquireAge > engageLimit && !isTargetStillEngaged) {
          abandonTarget('ไม่ได้ตี ' + acquireAge.toFixed(0) + 's', true, 10000); target = null;
        }
        // ★ pending ≥ attackPendingMax abandon ถ้า server ไม่ตอบนานเกินไป — แต่ถ้ามอนยัง aggro เรา ข้าม (ยังสู้อยู่)
        else if (target.pendingAttacks >= CFG.attackPendingMax && target.firstAttackAt && (now - target.firstAttackAt > CFG.attackAbandonMs) && !isTargetStillEngaged) {
          abandonTarget('pending ' + target.pendingAttacks + ' (server เงียบ)', true, 10000); target = null;
        }
      }
      // stuck warp escalation
      if (!target && CFG.stuckWarpOnAbandon > 0 && stuckAbandonCount >= CFG.stuckWarpOnAbandon) {
        log('🌀 stuck abandon', stuckAbandonCount, 'ครั้ง → วาร์ปสุ่ม');
        sendRandomWarp(); stuckAbandonCount = 0; stuckAbandonHistory = [];
      }
    }

    // === 2.8 Auto-Skill (ใช้สกิลตามเงื่อนไข — ก่อน attack) ===
    //   mirror bot.js _maybeSkill:3440-3538 — ทีละสกิลต่อ tick
    //   mode: targeted (Bash/Charge), AoE (Magnum), self-cast (Quicken)
    if (CFG.skillEnabled && CFG.skills && CFG.skills.length && target) {
      const mobCount = getMobAttackerCount();
      const curSP = sp.cur;
      const curSPmax = sp.max;
      const disabled = Array.isArray(CFG.disabledSkillIds) ? CFG.disabledSkillIds : [];
      for (const skill of CFG.skills) {
        if (!skill || skill.skillId == null) continue;
        if (disabled.includes(skill.skillId)) continue;
        const lastUse = lastSkillUse.get(skill.skillId) || 0;
        // ★ timer mode (intervalMin > 0) — self-cast buff
        const intervalMin = Number(skill.intervalMin) || 0;
        if (intervalMin > 0) {
          if (lastUse > 0 && (now - lastUse) < intervalMin * 60 * 1000) continue;
        } else {
          const cooldown = skill.cooldownMs ?? 2000;
          if (now - lastUse < cooldown) continue;
        }
        // ★ SP gate
        const spMin = skill.spMin ?? 0;
        if (spMin > 0 && curSP != null && curSP < spMin) continue;
        // ★ mob count gate (AoE skill)
        const mobMin = skill.mobCountMin ?? 0;
        if (mobCount < mobMin) continue;
        // ★ targeted/ground skill: ต้องมี target + ในระยะ + ไม่เกิน maxUses
        //   selfCast=true ข้ามเงื่อนไขนี้ทั้งหมด
        if ((skill.targeted || skill.ground) && !skill.selfCast) {
          const m = entities.get(target.id);
          if (!m || m.x == null || player.x == null) continue;
          const dist = Math.hypot(m.x - player.x, m.y - player.y);
          const minDist = skill.minDistance ?? 0;
          const maxDist = skill.maxDistance ?? 0;
          if (maxDist > 0 && dist > maxDist) continue;
          if (minDist > 0 && dist < minDist) continue;
          const maxUses = skill.maxUsesPerTarget ?? 1;
          const targetUses = skillUsesOnTarget.get(skill.skillId) || new Map();
          const used = targetUses.get(target.id) || 0;
          if (used >= maxUses) continue;
        }
        // ★ ผ่านเงื่อนไข → ใช้สกิล!
        const skillTarget = (skill.targeted && !skill.selfCast && !skill.ground) ? target.id : null;
        // ★ ground-targeted (Arrow Shower): ส่งพิกัดของมอนเป้าหมาย
        let groundX = null, groundY = null;
        if (skill.ground && target) {
          const tm = entities.get(target.id);
          if (tm && tm.x != null) { groundX = Math.round(tm.x); groundY = Math.round(tm.y); }
        }
        if (sendSkill(skill.skillId, skill.level || 1, skillTarget, groundX, groundY)) {
          lastSkillUse.set(skill.skillId, now);
          saveSkillTimesDebounced();
          if (skill.targeted && !skill.selfCast) {
            const tu = skillUsesOnTarget.get(skill.skillId) || new Map();
            tu.set(target.id, (tu.get(target.id) || 0) + 1);
            skillUsesOnTarget.set(skill.skillId, tu);
          }
          const spInfo = curSP != null ? (curSPmax ? ` ${curSP}/${curSPmax}` : ` ${curSP}`) : ' ?';
          const modeTag = skill.selfCast ? ' (self)' : (skill.targeted ? '' : ' (AoE)');
          log('✨ ใช้สกิล', skill.name || ('id=' + skill.skillId), modeTag, '(sp' + spInfo + ' mob=' + mobCount + ')');
          break;   // ทีละสกิลต่อ tick
        }
      }
    }

    // === 3. Attack ===
    //   ★ server ทำ walk-and-attack เอง: ส่ง ATTACK ในระยะ maxAcquireDistance → server เดินตัวละครเข้าไปตี
    //     dist > maxAcquireDistance → บอทเดินเข้าไปเอง (MOVE) จนถึง ≤maxAcquireDistance แล้วค่อยส่ง ATTACK
    if (target) {
      const m = entities.get(target.id);
      if (m && player.x != null && m.x != null && m.y != null) {
        const dist = Math.hypot(m.x - player.x, m.y - player.y);
        target.lastDist = dist;
        // ในระยะ acquire → ส่ง ATTACK ตรงๆ (server เดินเข้าไปตีเอง)
        if (dist <= CFG.maxAcquireDistance) {
          // (ลบ fallback เดินเข้า — server walk-and-attack ทำงานจริง แค่ reset ไม่ทำงานชั่วคราว)
          // ★ ถ้า pending สูง + server เงียบนาน + เปิด warpToMonster → วาร์ปไปหามอน (แทน abandon)
          if (CFG.warpToMonster && target.pendingAttacks >= 4 && target.firstAttackAt && (now - target.firstAttackAt > 8000)
              && (warpToMonsterCount.get(target.id) || 0) < CFG.warpToMonsterMaxPerEntity
              && now - (target._lastWarpAt || 0) > CFG.warpToMonsterCooldownMs) {
            const wc = warpToMonsterCount.get(target.id) || 0;
            if (sendTeleport(currentMap, m.x, m.y)) {
              target._lastWarpAt = now; warpToMonsterCount.set(target.id, wc + 1);
              target.pendingAttacks = 0; target.firstAttackAt = 0;   // reset หลังวาร์ป
              log('🌀 วาร์ปไปหา', m.name || target.id.toString(16), '@(', m.x, m.y + ')', '(pending สูง warp', wc + 1 + ')');
            }
            return;
          }
          if (now - target.lastAttackAt > CFG.attackReIssueMs || target.lastAttackAt === 0) {
            if (sendAttack(target.id)) {
              target.lastAttackAt = now; target.pendingAttacks++;
              if (!target.firstAttackAt) { target.firstAttackAt = now; }   // ★ จดเวลาส่งครั้งแรก
              if (!target.engageAt) { target.engageAt = now; }
              log('⚔️ ตี', m.name || m.id.toString(16), target.id.toString(16), '@ dist', dist.toFixed(1), '(pending', target.pendingAttacks + ')');
            }
          }
          return;
        }
        // ★ dist > maxChaseDistance → abandon ทันที (มอนไกลเกินไป ไม่สมควรไล่ตาม)
        if (dist > CFG.maxChaseDistance) {
          log('📏 abandon: มอนไกล', dist.toFixed(0), 'ช่อง (เกิน maxChase ' + CFG.maxChaseDistance + ')');
          abandonTarget('ไกลเกิน ' + CFG.maxChaseDistance, false, 10000);
          target = null;
          return;
        }
        // dist > maxAcquireDistance → เดินเข้าไปเองจนถึงระยะ acquire
        //   สั่งเดินทีละ walkStepDistance ช่อง (≤20) ถ้าติดกำแพงนาน → warpToMonster/abandon
        const stuck = walkToTarget(now, m);
        if (stuck === 'STUCK') {
          if (CFG.warpToMonster && (warpToMonsterCount.get(target.id) || 0) < CFG.warpToMonsterMaxPerEntity) {
            const wc = warpToMonsterCount.get(target.id) || 0;
            if (now - (target._lastWarpAt || 0) > CFG.warpToMonsterCooldownMs) {
              if (sendTeleport(currentMap, m.x, m.y)) {
                target._lastWarpAt = now; warpToMonsterCount.set(target.id, wc + 1);
                log('🌀 วาร์ปไปหา', m.name || target.id.toString(16), '@(', m.x, m.y + ')', '(warp', wc + 1 + ')');
              }
              return;
            }
          }
          // ไม่เปิด warpToMonster หรือ warp ครบแล้ว → abandon + cooldown กันเลือกตัวเดิม
          abandonTarget('ติดกำแพง (stuck)', true, 15000);
          target = null;
        }
        return;
      }
    }

    // === 4. Acquire new target ===
    if (!target) {
      const t = acquireTarget(now);
      if (t) { target = t; noMonsterSince = 0; return; }
      // ไม่เจอมอน
      if (!noMonsterSince) noMonsterSince = now;
      const noMonSec = (now - noMonsterSince) / 1000;
      // warp-find — มี cooldown กัน spam (วาร์ป fail ก็ต้องรอ ไม่ยิงทุก tick)
      // ★★ ห้ามวาร์ปถ้า player.x == null (ตำแหน่งค้าง/ไม่รู้ตำแหน่ง → วาร์ปไปก็ไม่รู้ว่าได้ผลไหม)
      if (CFG.warpFindEnabled && noMonSec >= CFG.noMonsterWarpSec && now - lastWarpFindAt > 3000 && player.x != null) {
        lastWarpFindAt = now;
        if (currentMap) {
          log('🌀 ไม่เจอมอน', noMonSec.toFixed(0) + 's → วาร์ปสุ่ม');
          if (sendRandomWarp()) noMonsterSince = now;   // สำเร็จ → reset (เริ่มนับใหม่ในแมปใหม่)
          // fail → ไม่ reset noMonsterSince แต่ lastWarpFindAt คุม cooldown แล้ว ไม่ spam
        } else {
          log('⚠️ warpFind: ยังไม่รู้ชื่อแมป — รอ SELECT_CHAR/MAP_NAME');
        }
        return;
      }
      // wander — สุ่มเดิน ≤ walkStepDistance ช่องจากตำแหน่งปัจจุบัน
      //   ★ ถ้าเปิด navWanderUseNav และมีข้อมูลแมป → ใช้ waypoint graph (เดินต่อเนื่อง stateful)
      //   ★ navWander เป็น stateful: track target + arrival → เดินต่อทันทีไม่รอ cooldown
      //     ใช้ cooldown สั้น 1s แทน wanderCooldownMs (3s) เพื่อความต่อเนื่อง
      const navCooldown = (CFG.navWanderUseNav && navHasData()) ? 1000 : CFG.wanderCooldownMs;
      if (CFG.wanderEnabled && now - lastWanderAt > navCooldown && player.x != null) {
        lastWanderAt = now;
        let moved = false;
        if (CFG.navWanderUseNav) {
          // ★ เลือก mode: patrol (เดินตามลำดับ route) หรือ graph (wander สุ่ม)
          const wp = CFG.navWanderMode === 'patrol' ? navPatrol() : navWander();
          if (wp) {
            if (sendMove(wp.x, wp.y)) {
              // ★ log เฉพาะตอน target เปลี่ยน (กัน spam — move command ซ้ำปกติ 1 วิต่อครั้ง)
              const tag = Math.round(wp.x) + ',' + Math.round(wp.y);
              if (tag !== lastNavLogTag) {
                lastNavLogTag = tag;
                log(CFG.navWanderMode === 'patrol' ? '🔄 patrol @(' : '🗺️ nav wander @(', wp.x, wp.y + ')');
              }
              moved = true;
            }
          }
        }
        if (!moved) {
          // fallback: สุ่มเดิน ≤ walkStepDistance ช่อง
          const angle = Math.random() * Math.PI * 2;
          const step = 3 + Math.random() * Math.min(CFG.wanderMaxStep, CFG.walkStepDistance) - 3;
          const tx = player.x + Math.cos(angle) * step;
          const ty = player.y + Math.sin(angle) * step;
          if (sendMove(tx, ty)) log('🚶 สุ่มเดิน @(', Math.round(tx), Math.round(ty) + ') | จาก player(', player.x.toFixed(0), player.y.toFixed(0) + ') step=' + Math.round(step));
        }
      }
    }
  }, CFG.combatTickMs);

  // ============================================================
  //  NAVIGATION — บันทึกเส้นทางเดิน + สร้าง waypoint graph
  //    Trail (ตามเวลา) → merge nodes (ใกล้กัน) + edges (เชื่อมต่อกัน)
  //    localStorage per-map (roAssistNav_<map>) + export/import + sync GitHub
  // ============================================================
  // ★ flag แยก: บอทสั่งเดิน (sendMove) vs ผู้เล่นคลิกเอง — บันทึกเฉพาะผู้เล่น
  let navBotMoving = false;
  const NAV_KEY_PREFIX = 'roAssistNav_';
  // cache ของแต่ละแมปที่โหลดแล้ว: mapName → { nodes: [{x,y}], edges: [[i,j],...] }
  const navCache = new Map();
  // trail buffer สำหรับแมปปัจจุบัน (ตามเวลา) — rebuild graph เมื่อ save
  let navTrail = [];   // [{x, y, t}]
  // load nav data ของแมปจาก localStorage (cache ไว้)
  function navLoadMap(mapName) {
    if (!mapName) return null;
    if (navCache.has(mapName)) return navCache.get(mapName);
    try {
      const raw = localStorage.getItem(NAV_KEY_PREFIX + mapName);
      const data = raw ? JSON.parse(raw) : { nodes: [], edges: [], trail: [] };
      // ★ migrate: ข้อมูลเก่าอาจไม่มี route → rebuild จาก trail
      if (data.trail && data.trail.length && !data.route) navRebuildGraph(data);
      navCache.set(mapName, data);
      return data;
    } catch (e) { const d = { nodes: [], edges: [], trail: [] }; navCache.set(mapName, d); return d; }
  }
  function navSaveMap(mapName) {
    if (!mapName) return;
    const data = navCache.get(mapName);
    if (!data) return;
    try { localStorage.setItem(NAV_KEY_PREFIX + mapName, JSON.stringify(data)); } catch (e) {}
  }
  let navSaveTimer = null;
  function navSaveDebounced(mapName) {
    if (navSaveTimer) clearTimeout(navSaveTimer);
    navSaveTimer = setTimeout(() => navSaveMap(mapName), 1500);
  }
  // ★ rebuild graph จาก trail — merge nodes ใกล้กัน + สร้าง edges ตามลำดับเวลา
  function navRebuildGraph(data) {
    const r = CFG.navMergeRadius || 3;
    const r2 = r * r;
    const nodes = [];   // [{x, y}]
    const nodeMap = []; // trail index → node index
    // ★ pass 1: assign trail points ไปยัง node (merge ถ้าใกล้ node เดิม)
    for (let i = 0; i < data.trail.length; i++) {
      const p = data.trail[i];
      let found = -1;
      for (let j = 0; j < nodes.length; j++) {
        const dx = nodes[j].x - p.x, dy = nodes[j].y - p.y;
        if (dx * dx + dy * dy <= r2) { found = j; break; }
      }
      if (found < 0) { found = nodes.length; nodes.push({ x: p.x, y: p.y }); }
      nodeMap[i] = found;
    }
    // ★ pass 2: edges จาก trail ติดกัน (ข้าม node ตัวเอง) + dedup
    const edgeSet = new Set();
    const edges = [];
    for (let i = 1; i < nodeMap.length; i++) {
      const a = nodeMap[i - 1], b = nodeMap[i];
      if (a === b) continue;
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push([a, b]);
    }
    data.nodes = nodes;
    data.edges = edges;
    // ★ build route: ลำดับ node ตามที่เดินจริง (compact nodeMap — เอาซ้ำติดกันออก)
    //   ใช้สำหรับ patrol mode (เดินตามลำดับ → ครบแล้วย้อนกลับ)
    const route = [];
    let lastNode = -1;
    for (let i = 0; i < nodeMap.length; i++) {
      if (nodeMap[i] !== lastNode) { route.push(nodeMap[i]); lastNode = nodeMap[i]; }
    }
    data.route = route;
  }
  // ★ บันทึกการคลิกเดินของผู้เล่น → trail
  function navRecordMove(x, y) {
    if (!CFG.navRecording || !currentMap) return;
    const data = navLoadMap(currentMap);
    if (!data) return;
    const now = nowMs();
    const last = data.trail[data.trail.length - 1];
    // ★ dedup: ข้ามถี่เกิน (เดินที่เดิม)
    if (last) {
      const dx = last.x - x, dy = last.y - y;
      if (dx * dx + dy * dy < 1) return;   // ขยับ < 1 ช่อง → ข้าม
    }
    data.trail.push({ x, y, t: now });
    // ★ จำกัดขนาด trail (กัน localStorage เต็ม) — เก็บสูงสุด 2000 จุด/แมป
    if (data.trail.length > 2000) data.trail = data.trail.slice(-2000);
    navRebuildGraph(data);
    navSaveDebounced(currentMap);
  }
  // ★ Navigation: หา node ที่ใกล้ (x,y) ที่สุด
  function navFindNearestNode(data, x, y) {
    if (!data || !data.nodes || !data.nodes.length) return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < data.nodes.length; i++) {
      const dx = data.nodes[i].x - x, dy = data.nodes[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  // ★ Build adjacency list จาก edges
  function navAdjacency(data) {
    const adj = data.nodes.map(() => []);
    for (const [a, b] of data.edges) { adj[a].push(b); adj[b].push(a); }
    return adj;
  }
  // ★ BFS pathfinding: shortest path from node A → node B
  //   return [nodeIndex, ...] หรือ null ถ้าไม่ถึง
  function navFindPath(data, fromNode, toNode) {
    if (fromNode < 0 || toNode < 0 || fromNode >= data.nodes.length || toNode >= data.nodes.length) return null;
    if (fromNode === toNode) return [fromNode];
    const adj = navAdjacency(data);
    const visited = new Set([fromNode]);
    const queue = [[fromNode]];
    while (queue.length) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      for (const next of adj[cur]) {
        if (visited.has(next)) continue;
        visited.add(next);
        const newPath = [...path, next];
        if (next === toNode) return newPath;
        queue.push(newPath);
      }
    }
    return null;
  }
  // ★ navigateTo(x, y): หา path จากตำแหน่งปัจจุบัน → (x,y) แล้วคืนจุดถัดไปที่ควรคลิกเดิน
  //   return {x, y} ของ waypoint ถัดไป หรือ null ถ้าไม่มี path / ไม่มีข้อมูลแมป
  function navNavigateTo(targetX, targetY) {
    if (!currentMap || player.x == null) return null;
    const data = navLoadMap(currentMap);
    if (!data || !data.nodes.length) return null;
    const startNode = navFindNearestNode(data, player.x, player.y);
    const endNode = navFindNearestNode(data, targetX, targetY);
    const path = navFindPath(data, startNode, endNode);
    if (!path || path.length < 2) return null;
    // ★ คืน node ถัดไป (path[1]) — bot จะคลิกเดินไปที่นั่น
    return { x: data.nodes[path[1]].x, y: data.nodes[path[1]].y };
  }
  // ★ PATROL MODE — เดินตามลำดับ route (ลำดับที่บันทึก) ครบแล้วย้อนกลับ
  //   ง่าย + เป็นธรรมชาติที่สุด เพราะเดินตามเส้นทางที่มนุษย์เคยเดินจริง
  //   state: patrolIdx = index ใน route ปัจจุบัน, patrolDir = 1 (ไป) | -1 (กลับ)
  let patrolIdx = -1;       // index ใน route ของ node ที่กำลังเดินไป
  let patrolDir = 1;        // ทิศทาง: 1 = ไปข้างหน้า, -1 = ย้อนกลับ
  let patrolTargetAt = 0;   // timestamp ที่ตั้ง target (timeout)
  function navPatrol() {
    if (!currentMap || player.x == null) return null;
    const data = navLoadMap(currentMap);
    if (!data || !data.route || data.route.length < 2) return null;
    const now = nowMs();
    const ARRIVAL_RADIUS = (CFG.navMergeRadius || 3);
    const MAX_STEP = 18;
    const TARGET_TIMEOUT_MS = 10000;

    // ★ เริ่มต้น: หา index ใน route ที่ใกล้ player สุด
    if (patrolIdx < 0) {
      let bestDist = Infinity;
      for (let i = 0; i < data.route.length; i++) {
        const n = data.nodes[data.route[i]];
        const dx = n.x - player.x, dy = n.y - player.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; patrolIdx = i; }
      }
      patrolTargetAt = now;
    }

    // ★ หา target node ปัจจุบัน
    const targetNodeIdx = data.route[patrolIdx];
    if (targetNodeIdx == null) { patrolIdx = -1; return null; }
    const tx = data.nodes[targetNodeIdx].x, ty = data.nodes[targetNodeIdx].y;
    const dx = tx - player.x, dy = ty - player.y;
    const dist2 = dx * dx + dy * dy;

    // ★ arrival check: ถึงแล้ว → เลื่อนไป node ถัดไปใน route
    if (dist2 <= ARRIVAL_RADIUS * ARRIVAL_RADIUS) {
      patrolIdx += patrolDir;
      // ★ ครบ route → ย้อนกลับ (ping-pong ไม่วนกลับจุดเริ่มต้น เพราะเสียเวลา)
      if (patrolIdx >= data.route.length) { patrolIdx = data.route.length - 2; patrolDir = -1; }
      else if (patrolIdx < 0) { patrolIdx = 1; patrolDir = 1; }
      // กัน index ออกนอก (route สั้น)
      if (patrolIdx < 0) patrolIdx = 0;
      if (patrolIdx >= data.route.length) patrolIdx = data.route.length - 1;
      patrolTargetAt = now;
      const nextNodeIdx = data.route[patrolIdx];
      return { x: data.nodes[nextNodeIdx].x, y: data.nodes[nextNodeIdx].y };
    }

    // ★ target timeout: ถ้าเกิน 10 วิ ยังไม่ถึง → ข้ามไป node ถัดไป
    if (now - patrolTargetAt > TARGET_TIMEOUT_MS) {
      patrolIdx += patrolDir;
      if (patrolIdx >= data.route.length) { patrolIdx = data.route.length - 2; patrolDir = -1; }
      else if (patrolIdx < 0) { patrolIdx = 1; patrolDir = 1; }
      if (patrolIdx < 0) patrolIdx = 0;
      if (patrolIdx >= data.route.length) patrolIdx = data.route.length - 1;
      patrolTargetAt = now;
      const nextNodeIdx = data.route[patrolIdx];
      log('🗺️ patrol timeout → ข้ามไป node', patrolIdx);
      return { x: data.nodes[nextNodeIdx].x, y: data.nodes[nextNodeIdx].y };
    }

    // ★ ยังอยู่ระหว่างทาง → คืน target ปัจจุบัน (cap ระยะ ≤ MAX_STEP)
    if (dist2 > MAX_STEP * MAX_STEP) {
      // ไกลเกิน → หา node ถัดไปที่อยู่ใกล้ player บน route
      //   ง่ายสุด: หา index ใน route ที่ใกล้ player สุด แล้วเริ่มจากตรงนั้น
      let bestI = patrolIdx, bestD = dist2;
      for (let i = 0; i < data.route.length; i++) {
        const n = data.nodes[data.route[i]];
        const ddx = n.x - player.x, ddy = n.y - player.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestD) { bestD = d; bestI = i; }
      }
      patrolIdx = bestI;
      patrolTargetAt = now;
      const nn = data.nodes[data.route[patrolIdx]];
      return { x: nn.x, y: nn.y };
    }
    return { x: tx, y: ty };
  }
  function navPatrolReset() { patrolIdx = -1; patrolDir = 1; patrolTargetAt = 0; }

  // ★ wander แบบใช้ nav — stateful: track current target + arrival → เดินต่อเนื่อง
  //   ★ หลีกเลี่ยง ping-pong: track node ที่เพิ่งมาจาก (prevNode) → ไม่สุ่มกลับ
  //     ถ้าเหลือทางเดียว (dead-end 2 node) → ขยายหา node ที่ไกลขึ้นผ่าน BFS
  let navWanderTarget = null;     // {x, y} เป้าหมายปัจจุบัน (null = ต้องเลือกใหม่)
  let navWanderNodeIdx = -1;      // index ของ node ที่กำลังเดินไป
  let navWanderPrevNode = -1;     // ★ index ของ node ที่เพิ่งจากมา (กันย้อนกลับ)
  let navWanderStuckSince = 0;    // timestamp ที่เริ่ม stuck (ไม่ถึง target)
  let navWanderLastPos = null;    // {x,y,t} ตำแหน่งก่อนหน้า (เช็ค stuck)
  let navWanderTargetAt = 0;      // ★ timestamp ที่ตั้ง target (timeout ถ้าไม่ถึง)
  // ★ helper: เลือก neighbor ถัดไป หลีกเลี่ยง prevNode — ถ้าเหลือแค่ prevNode ให้ BFS หา node ไกลขึ้น
  function navPickNextNode(data, curIdx) {
    const adj = navAdjacency(data);
    const neighbors = (adj[curIdx] || []).filter(n => n !== curIdx && n !== navWanderPrevNode);
    if (neighbors.length) {
      // ★ สุ่ม แต่ถ้ามีหลายทาง → เบนไปทางที่ไกลจาก prevNode (น้ำหนักมากกว่า)
      //   เพื่อให้เดินออกไกลแทนวนในจุดเดิม
      const px = data.nodes[navWanderPrevNode] || data.nodes[curIdx];
      // เลือกแบบสุ่มจาก neighbors ทั้งหมด (เท่ากัน) — ping-pong กันด้วย prevNode filter แล้ว
      return neighbors[Math.floor(Math.random() * neighbors.length)];
    }
    // ★ dead-end (มีแค่ prevNode ทางเดียว) → BFS หา node ที่ไกลสุดในรัศมี 3-5 hop
    //   เพื่อหลุดจากการวน แทนการย้อนกลับ
    const visited = new Set([curIdx]);
    let frontier = [curIdx];
    const dist = new Map([[curIdx, 0]]);
    let farthest = -1, farthestDist = 0;
    for (let hop = 0; hop < 5 && frontier.length; hop++) {
      const next = [];
      for (const n of frontier) {
        for (const m of adj[n] || []) {
          if (visited.has(m)) continue;
          visited.add(m);
          dist.set(m, hop + 1);
          if (hop + 1 > farthestDist) { farthestDist = hop + 1; farthest = m; }
          next.push(m);
        }
      }
      frontier = next;
    }
    return farthest >= 0 ? farthest : null;
  }
  function navWander() {
    if (!currentMap || player.x == null) return null;
    const data = navLoadMap(currentMap);
    if (!data || data.nodes.length < 2) return null;
    const now = nowMs();
    const ARRIVAL_RADIUS = CFG.navMergeRadius || 3;
    const MAX_STEP = 18;
    const TARGET_TIMEOUT_MS = 8000;   // ★ ทิ้ง target ถ้าไม่ถึงใน 8 วิ (ติดกำแพง)

    // ★ target timeout: ถ้ามี target และเกิน 8 วิยังไม่ถึง → ทิ้ง เลือกใหม่
    //   (กันค้างที่ target เดิม เพราะติดกำแพง/สิ่งกีดขวาง)
    if (navWanderTarget && navWanderTargetAt && (now - navWanderTargetAt > TARGET_TIMEOUT_MS)) {
      const tdx = navWanderTarget.x - player.x, tdy = navWanderTarget.y - player.y;
      if (tdx * tdx + tdy * tdy > ARRIVAL_RADIUS * ARRIVAL_RADIUS) {
        // ยังไม่ถึง + เกินเวลา → ทิ้ง target + ล้าง prevNode (กันติดต่อ)
        navWanderTarget = null; navWanderPrevNode = -1;
      }
    }

    // ★ เช็ค arrival: ถ้ามี target และอยู่ใกล้แล้ว → เลือก neighbor ถัดไปทันที
    if (navWanderTarget) {
      const dx = navWanderTarget.x - player.x, dy = navWanderTarget.y - player.y;
      if (dx * dx + dy * dy <= ARRIVAL_RADIUS * ARRIVAL_RADIUS) {
        // ★ ถึงแล้ว — prevNode = node ที่เพิ่งจาก (curNode เดิม), curNode = target ที่ถึง
        navWanderPrevNode = navWanderNodeIdx >= 0 ? navFindNearestNode(data, player.x, player.y) : navWanderPrevNode;
        const curIdx = navWanderNodeIdx >= 0 ? navWanderNodeIdx : navFindNearestNode(data, player.x, player.y);
        const next = navPickNextNode(data, curIdx);
        if (next != null) {
          navWanderNodeIdx = next;
          const nx = data.nodes[next].x, ny = data.nodes[next].y;
          const sdx = nx - player.x, sdy = ny - player.y;
          if (sdx * sdx + sdy * sdy > MAX_STEP * MAX_STEP) {
            navWanderTarget = navNavigateTo(nx, ny) || { x: nx, y: ny };
          } else {
            navWanderTarget = { x: nx, y: ny };
          }
          navWanderTargetAt = now;   // ★ ตั้ง timeout ใหม่
          return navWanderTarget;
        }
        navWanderTarget = null;
      }
    }

    // ★ stuck detection: ตำแหน่งไม่ขยับ > 5s → reset
    if (navWanderLastPos) {
      const pdx = player.x - navWanderLastPos.x, pdy = player.y - navWanderLastPos.y;
      if (pdx * pdx + pdy * pdy < 4) {
        if (!navWanderStuckSince) navWanderStuckSince = now;
        else if (now - navWanderStuckSince > 5000) {
          navWanderTarget = null; navWanderPrevNode = -1; navWanderStuckSince = 0;
        }
      } else { navWanderStuckSince = 0; }
    }
    navWanderLastPos = { x: player.x, y: player.y, t: now };

    // ★ เลือก target ใหม่ (ไม่มี target หรือ reset)
    if (!navWanderTarget) {
      const curIdx = navFindNearestNode(data, player.x, player.y);
      const next = navPickNextNode(data, curIdx);
      if (next != null) {
        navWanderNodeIdx = next;
        const nx = data.nodes[next].x, ny = data.nodes[next].y;
        const sdx = nx - player.x, sdy = ny - player.y;
        if (sdx * sdx + sdy * sdy > MAX_STEP * MAX_STEP) {
          navWanderTarget = navNavigateTo(nx, ny) || { x: nx, y: ny };
        } else {
          navWanderTarget = { x: nx, y: ny };
        }
      } else {
        // ★ ไม่ได้อยู่ใกล้ node ไหน → เดินไป node ใกล้สุด (≤ MAX_STEP)
        if (curIdx >= 0) {
          const nx = data.nodes[curIdx].x, ny = data.nodes[curIdx].y;
          const sdx = nx - player.x, sdy = ny - player.y;
          if (sdx * sdx + sdy * sdy <= MAX_STEP * MAX_STEP) {
            navWanderNodeIdx = curIdx;
            navWanderTarget = { x: nx, y: ny };
          }
        }
      }
      navWanderTargetAt = now;   // ★ ตั้ง timeout ใหม่
      return navWanderTarget;
    }
    return navWanderTarget;
  }
  // ★ reset wander state (เรียกตอนเปลี่ยนแมป/วาร์ป)
  function navWanderReset() {
    navWanderTarget = null;
    navWanderNodeIdx = -1;
    navWanderPrevNode = -1;
    navWanderStuckSince = 0;
    navWanderLastPos = null;
    navWanderTargetAt = 0;
  }
  // ★ เช็คว่าแมปปัจจุบันมีข้อมูล nav หรือไม่ (ใช้ใน combatLoop เพื่อเลือก cooldown)
  function navHasData() {
    if (!currentMap) return false;
    const data = navCache.get(currentMap);
    if (!data || !data.nodes || data.nodes.length < 2) return false;
    if (CFG.navWanderMode === 'patrol') return !!(data.route && data.route.length >= 2);
    return true;   // graph mode ใช้แค่ nodes
  }
  // ★ export ข้อมูล nav ทั้งหมด (สำหรับ download/backup)
  function navExportAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(NAV_KEY_PREFIX)) {
        try { out[key.slice(NAV_KEY_PREFIX.length)] = JSON.parse(localStorage.getItem(key)); } catch (e) {}
      }
    }
    return out;
  }
  // ★ import ข้อมูล nav (merge — ถ้ามีแมปซ้ำ = ทับ)
  function navImportAll(data) {
    if (!data || typeof data !== 'object') return 0;
    let count = 0;
    for (const [mapName, navData] of Object.entries(data)) {
      if (!mapName || !navData || !Array.isArray(navData.nodes)) continue;
      localStorage.setItem(NAV_KEY_PREFIX + mapName, JSON.stringify(navData));
      navCache.set(mapName, navData);
      count++;
    }
    return count;
  }
  // ★ clear nav ของแมปที่ระบุ (หรือทั้งหมดถ้าไม่ระบุ)
  function navClear(mapName) {
    if (mapName) {
      localStorage.removeItem(NAV_KEY_PREFIX + mapName);
      navCache.delete(mapName);
      log('🗺️ ล้างข้อมูล nav แมป', mapName);
    } else {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(NAV_KEY_PREFIX)) keys.push(key);
      }
      keys.forEach(k => localStorage.removeItem(k));
      navCache.clear();
      log('🗺️ ล้างข้อมูล nav ทั้งหมด (' + keys.length + ' แมป)');
    }
  }

  // ---------- patch WebSocket ----------
  function attach(ws) {
    if (ws.__loot) return; ws.__loot = true;
    // ★★ กัน relay WS แทนที่ game WS — เช็ค URL ว่าตรงกับ monitorServerUrl ไหม
    //   ถ้าใช่ → ไม่ตั้ง activeWS ไม่ hook (relay เป็น text JSON ไม่ใช่ binary game protocol)
    //   ★★ อย่าใช้ includes('rayrag') — เพราะเกมเชื่อมที่ gamesea01.rayrag.com!
    const relayUrl = CFG.monitorServerUrl || '';
    let wsUrl = '';
    try { wsUrl = ws.url || ''; } catch (_) {}
    // ★ เช็คแบบตรงไปตรงมา: ตัด scheme ออกแล้วเทียบ host
    if (relayUrl && wsUrl) {
      const relayHost = relayUrl.replace(/^wss?:\/\//, '').split('/')[0];
      const wsHost = wsUrl.replace(/^wss?:\/\//, '').split('/')[0];
      if (relayHost && wsHost && relayHost === wsHost) {
        log('🌐 ข้าม attach relay WebSocket (ไม่ใช่เกม):', wsUrl.slice(0, 60));
        return;
      }
    }
    activeWS = ws; log('🔌 ต่อ WebSocket แล้ว');
    try { gameServerUrl = ws.url || ''; } catch (_) {}   // ★ เก็บ URL เซิร์ฟเวอร์เกม
    const origSend = ws.send.bind(ws);
    ws.send = function (data) {
      try { const u = syncU8(data); if (u) handleOut(u); } catch (e) {}
      return origSend(data);
    };
    ws.addEventListener('message', async (e) => {
      try { const u = await toU8(e.data); if (u) handleIn(u); } catch (err) {}
    });
  }
  const NativeWS = window.WebSocket;
  window.WebSocket = function (...a) { const ws = new NativeWS(...a); attach(ws); return ws; };
  window.WebSocket.prototype = NativeWS.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => window.WebSocket[k] = NativeWS[k]);

  // ============================================================
  //  API ควบคุมจาก console — พิมพ์ ASSIST.<method>()
  // ============================================================
  window.ASSIST = {
    // ---------- สถานะ ----------
    status() {
      const pct = hpPct();
      console.table([{
        version: VERSION + (latestVersion && cmpVer(latestVersion, VERSION) > 0 ? ` → ${latestVersion} ⬆` : ''),
        combat: CFG.combatEnabled ? 'ON ⚔️' : 'off',
        loot: CFG.lootEnabled ? 'ON' : 'off',
        heal: CFG.healEnabled ? 'ON' : 'off',
        dead: isDead ? '☠️ YES' : 'no',
        HP: hp.cur != null ? `${hp.cur}/${hp.max} (${pct != null ? pct.toFixed(0) : '?'}%)` : '?',
        map: currentMap || '?',
        farmMap: CFG.farmMap || '(any)',
        entities: entities.size,
        target: target ? target.id.toString(16) : '-',
        healAt: CFG.healAtPercent + '%',
        healItems: CFG.healItems.map(nameOf).join(', '),
        healMode: CFG.healMode,
        lootMode: CFG.filter.mode,
        lootQueue: queue.size,
        player_id: playerId ? playerId.toString(16) : '?',
      }]);
      const now = Date.now();
      const healStatus = CFG.healItems.map(id => ({
        id,
        name: nameOf(id),
        available: heal.isAvailable(id, now),
        retryInMs: heal.isAvailable(id, now) ? 0 : (heal.exhaustedUntil.get(id) - now),
      }));
      return {
        hp: { ...hp }, hpPct: pct, isDead,
        heal: { enabled: CFG.healEnabled, mode: CFG.healMode, threshold: CFG.healAtPercent + '%', items: healStatus },
        loot: { ...CFG.filter, queue: [...queue.values()].map(it => ({ item: nameOf(it.itemId), ...it })) },
      };
    },
    help() {
      console.log(`%c ASSIST — คำสั่ง `, 'background:#4caf50;color:#fff;padding:2px 6px;border-radius:3px');
      console.log(`%c Auto-Heal `, 'color:#e91e63;font-weight:bold');
      console.log('  ASSIST.healOn() / ASSIST.healOff()');
      console.log('  ASSIST.setHealAt(50)              // เลือดต่ำกว่า 50% → ใช้ยา');
      console.log('  ASSIST.setHealItems(501,502,503)  // เซ็ตรายการ item id');
      console.log('  ASSIST.addHealItem(503)           // เพิ่ม item');
      console.log('  ASSIST.setHealMode("order")       // "order"=ใช้ตัวเดิมจนหมดแล้วข้าม, "random"=สุ่ม');
      console.log('  ASSIST.setHealDelay(800)          // ดีเลย์ ms');
      console.log('  ASSIST.setHealExhausted(3000)     // item หมด→รอ N ms แล้วลองใหม่ (default 3000)');
      console.log('  ASSIST.clearHealExhausted()       // บังคับลองใช้ item ทุกตัวใหม่ (ล้าง mark หมด)');
      console.log('  ASSIST.setHealToFull(true)        // true=ใช้ยาจนเต็ม, false=พ้น threshold หยุด');
      console.log(`%c Auto-Buff `, 'color:#9b59b6;font-weight:bold');
      console.log('  ASSIST.buffOn() / ASSIST.buffOff()');
      console.log('  ASSIST.addBuffItem(656, 30)        // Awakening Potion ทุก 30 นาที');
      console.log('  ASSIST.setBuffItems([{itemId:656,intervalMin:30}])');
      console.log('  ASSIST.removeBuffItem(656)         ASSIST.buffNow()');
      console.log('  ASSIST.getBuffCountdowns()         // ดู countdown แต่ละตัว');
      console.log(`%c Auto-Loot `, 'color:#2196f3;font-weight:bold');
      console.log('  ASSIST.lootOn() / ASSIST.lootOff()');
      console.log('  ASSIST.setLootMode("all")         // "all" | "only" | "except"');
      console.log('  ASSIST.addLootOnly(909,512)       ASSIST.addLootExcept(909)');
      console.log('  ASSIST.clearLootOnly()            ASSIST.clearLootExcept()');
      console.log('  ASSIST.setLootDelay(500)         // รอ 500ms หลังของตกแล้วค่อยเก็บ (0=ทันที)');
      console.log(`%c อื่นๆ `, 'color:#9c27b0;font-weight:bold');
      console.log(`%c Navigation `, 'color:#26a69a;font-weight:bold');
      console.log('  ASSIST.navRecordOn() / navRecordOff()   // บันทึกเส้นทางเดิน');
      console.log('  ASSIST.navGetAllStats()                  // ดูข้อมูลทุกแมป');
      console.log('  ASSIST.navExport() / navImport(json)     // export/import ไฟล์');
      console.log('  ASSIST.name(935,"Feather")        // ตั้งชื่อ item');
      console.log('  ASSIST.status()  ASSIST.config()  ASSIST.stopAll()');
    },

    // ---------- Auto-Heal ----------
    healOn() {
      if (!CFG.healItems.length) {
        console.warn('⚠️ ยังไม่มี item heal — ตั้งก่อนด้วย ASSIST.setHealItems(...) ไม่งั้นจะไม่ทำงาน');
      }
      CFG.healEnabled = true; log('💉 Auto-Heal: ON');
    },
    healOff() { CFG.healEnabled = false; log('💉 Auto-Heal: OFF'); },
    setHealAt(pct) {
      if (typeof pct !== 'number' || pct < 1 || pct > 100) { console.warn('ต้องเป็นเลข 1-100'); return; }
      CFG.healAtPercent = pct;
      log('💉 threshold =', pct + '%');
    },
    setHealItems(...ids) {
      CFG.healItems = ids.filter(x => typeof x === 'number');
      heal.clearExhausted();
      // ★ ตั้ง item = เจตนาเปิดใช้ → เปิด auto-heal ให้อัตโนมัติ (default ปิดอยู่)
      CFG.healEnabled = true;
      log('💉 healItems =', CFG.healItems.map(nameOf).join(', '), '→ auto-heal ON');
    },
    addHealItem(...ids) {
      for (const id of ids) if (!CFG.healItems.includes(id)) CFG.healItems.push(id);
      log('💉 healItems =', CFG.healItems.map(nameOf).join(', '));
    },
    setHealMode(mode) {
      if (!['order', 'random'].includes(mode)) { console.warn('โหมดต้องเป็น order/random'); return; }
      CFG.healMode = mode; log('💉 healMode =', mode);
    },
    setHealDelay(ms) {
      if (typeof ms !== 'number' || ms < 0) { console.warn('ต้องเป็นเลข ≥ 0'); return; }
      CFG.healDelayMs = ms; log('💉 delay =', ms + 'ms');
    },
    // ตั้งระยะเวลาที่ item ที่ "หมด" จะรอก่อนลองใหม่ (ms) — default 3000
    setHealExhausted(ms) {
      if (typeof ms !== 'number' || ms < 0) { console.warn('ต้องเป็นเลข ≥ 0'); return; }
      CFG.healExhaustedMs = ms; log('💉 item หมด → รอ', ms + 'ms แล้วลองใหม่');
    },
    // ล้าง mark "หมด" ทั้งหมดทันที (บังคับลองใช้ item ทุกตัวอีกครั้ง)
    clearHealExhausted() {
      heal.clearExhausted();
      log('💉 ล้าง mark "หมด" ทั้งหมด → ลองใช้ item ทุกตัวใหม่');
    },
    setHealToFull(on) { CFG.healAtMax = !!on; log('💉 ใช้ยาจนเต็ม =', CFG.healAtMax); },

    // ---------- Auto-Buff ----------
    //  buffItems: [{itemId, intervalMin}] — intervalMin = ทุกกี่นาทีจะใช้ซ้ำ
    //  เก็บเวลาใช้ล่าสุดข้าม session (localStorage) กัน buff หายเมื่อ refresh
    buffOn()  { CFG.buffEnabled = true;  log('✨ Auto-Buff: ON'); },
    buffOff() { CFG.buffEnabled = false; log('✨ Auto-Buff: OFF'); },
    // ★ setBuffItems([{itemId:656, intervalMin:30}, ...]) — แทนที่ทั้งรายการ
    setBuffItems(items) {
      CFG.buffItems = (items || []).filter(x => x && x.itemId && x.intervalMin > 0)
        .map(x => ({ itemId: Number(x.itemId), intervalMin: Number(x.intervalMin) }));
      CFG.buffEnabled = true;
      log('✨ buffItems =', CFG.buffItems.map(x => nameOf(x.itemId) + '(ทุก' + x.intervalMin + 'นาที)').join(', '));
    },
    // ★ addBuffItem(itemId, intervalMin) — เพิ่ม 1 รายการ (ถ้ามี itemId อยู่แล้ว = update interval)
    addBuffItem(itemId, intervalMin) {
      itemId = Number(itemId); intervalMin = Number(intervalMin);
      if (!itemId || intervalMin <= 0) { log('⚠️ itemId และ intervalMin ต้อง > 0'); return; }
      const existing = CFG.buffItems.find(x => x.itemId === itemId);
      if (existing) { existing.intervalMin = intervalMin; log('✨ แก้', nameOf(itemId), '→ ทุก', intervalMin + 'นาที'); }
      else { CFG.buffItems.push({ itemId, intervalMin }); log('✨ เพิ่ม', nameOf(itemId), 'ทุก', intervalMin + 'นาที'); }
    },
    removeBuffItem(itemId) {
      itemId = Number(itemId);
      CFG.buffItems = CFG.buffItems.filter(x => x.itemId !== itemId);
      lastBuffUse.delete(itemId);
      saveBuffTimesDebounced();
      log('✨ ลบ buff', nameOf(itemId));
    },
    // ★ ใช้ buff ทั้งหมดทันที (reset countdown) — เผื่ออยากใช้เลยไม่รอ
    buffNow() {
      if (!CFG.buffItems.length) { log('⚠️ ยังไม่ได้ตั้ง buffItems'); return; }
      if (!activeWS || activeWS.readyState !== 1) { log('⚠️ ยังไม่ได้เชื่อมต่อ'); return; }
      const now = nowMs();
      let used = 0;
      for (const item of CFG.buffItems) {
        if (sendUseItem(item.itemId)) { lastBuffUse.set(item.itemId, now); used++; }
      }
      saveBuffTimesDebounced();
      log('✨ ใช้ buff ทั้งหมด', used, 'รายการทันที');
    },
    // ★ ดู countdown ของแต่ละ buff (สำหรับ UI + debug)
    getBuffCountdowns() {
      const now = nowMs();
      return CFG.buffItems.map(item => {
        const last = lastBuffUse.get(item.itemId) || 0;
        const intervalMs = item.intervalMin * 60 * 1000;
        const nextUseAt = last + intervalMs;
        return {
          itemId: item.itemId,
          name: itemDisplayName(item.itemId),
          intervalMin: item.intervalMin,
          lastUsed: last,
          nextUseAt,
          remainingMs: Math.max(0, nextUseAt - now),
        };
      });
    },
    clearBuffTimes() { lastBuffUse.clear(); saveBuffTimes(); log('✨ ล้างเวลา buff ทั้งหมด → จะใช้ใหม่ทันที'); },

    // ---------- Auto-Skill ----------
    skillOn()  { CFG.skillEnabled = true;  log('✨ Auto-Skill: ON'); },
    skillOff() { CFG.skillEnabled = false; log('✨ Auto-Skill: OFF'); },
    // ★ setSkills([{skillId:3, level:10, targeted:true, maxUsesPerTarget:2, maxDistance:2, spMin:15, cooldownMs:2000}, ...])
    setSkills(skills) {
      CFG.skills = (skills || []).filter(s => s && s.skillId != null).map(s => ({
        name: s.name || ('skill_' + s.skillId),
        skillId: Number(s.skillId),
        level: Number(s.level) || 1,
        targeted: !!s.targeted,
        selfCast: !!s.selfCast,
        intervalMin: Number(s.intervalMin) || 0,
        mobCountMin: Number(s.mobCountMin) || 0,
        maxUsesPerTarget: Number(s.maxUsesPerTarget) || 1,
        maxDistance: Number(s.maxDistance) || 0,
        minDistance: Number(s.minDistance) || 0,
        spMin: Number(s.spMin) || 0,
        cooldownMs: Number(s.cooldownMs) || 2000,
      }));
      log('✨ skills =', CFG.skills.length, 'รายการ');
    },
    addSkill(skill) {
      if (!skill || skill.skillId == null) { log('⚠️ ต้องมี skillId'); return; }
      const existing = CFG.skills.find(s => s.skillId === skill.skillId);
      if (existing) { Object.assign(existing, skill); log('✨ แก้ skill', skill.skillId); }
      else { CFG.skills.push(skill); log('✨ เพิ่ม skill', skill.skillId); }
    },
    removeSkill(skillId) {
      CFG.skills = CFG.skills.filter(s => s.skillId !== skillId);
      log('✨ ลบ skill', skillId);
    },
    skillNow() {
      if (!CFG.skills.length) { log('⚠️ ยังไม่ได้ตั้ง skills'); return; }
      const now = nowMs();
      for (const s of CFG.skills) {
        const tid = (s.targeted && !s.selfCast && !s.ground && target) ? target.id : null;
        let gx = null, gy = null;
        if (s.ground && target) {
          const tm = entities.get(target.id);
          if (tm && tm.x != null) { gx = Math.round(tm.x); gy = Math.round(tm.y); }
        }
        sendSkill(s.skillId, s.level || 1, tid, gx, gy);
        lastSkillUse.set(s.skillId, now);
      }
      saveSkillTimesDebounced();
      log('✨ ใช้ skill ทั้งหมด', CFG.skills.length, 'รายการทันที');
    },
    clearSkillTimes() { lastSkillUse.clear(); saveSkillTimes(); log('✨ ล้างเวลา skill ทั้งหมด'); },
    getSkillCooldowns() {
      const now = nowMs();
      return CFG.skills.map(s => {
        const last = lastSkillUse.get(s.skillId) || 0;
        const cd = (s.intervalMin > 0) ? s.intervalMin * 60 * 1000 : (s.cooldownMs || 2000);
        return { skillId: s.skillId, name: s.name, lastUsed: last, nextUseAt: last + cd, remainingMs: Math.max(0, last + cd - now) };
      });
    },
    restOn()  { CFG.restEnabled = true;  log('🪑 Auto-Rest: ON (HP < ' + CFG.restHpPercent + '% → นั่งพัก)'); },
    restOff() { CFG.restEnabled = false; if (isResting) { sendStand(); isResting = false; } log('🪑 Auto-Rest: OFF'); },
    setRestHp(pct) { CFG.restHpPercent = pct; log('🪑 นั่งพักตอน HP <', pct + '%'); },
    setRestUntil(pct) { CFG.restUntilPercent = pct; log('🪑 ลุกยืนตอน HP ≥', pct + '%'); },
    setRestMaxSec(sec) { CFG.restMaxSec = sec; log('🪑 นั่งนานสุด', sec + 's'); },
    isResting() { return isResting; },

    // ---------- Auto-Sell ----------
    sellOn()  { CFG.sellEnabled = true;  log('💰 Auto-Sell: ON'); },
    sellOff() { CFG.sellEnabled = false; log('💰 Auto-Sell: OFF'); },
    setSellNpc(name, map) { CFG.sellNpcName = name; if (map) CFG.sellNpcMap = map; log('💰 NPC:', name, '@', CFG.sellNpcMap); },
    setSellNpcPos(x, y) { CFG.sellNpcX = Math.round(Number(x)); CFG.sellNpcY = Math.round(Number(y)); log('💰 พิกัดวาร์ป NPC:', CFG.sellNpcX, CFG.sellNpcY); },
    useCurrentPosAsSellWarp() { if (player.x != null && player.y != null) { CFG.sellNpcX = Math.round(player.x); CFG.sellNpcY = Math.round(player.y); log('💰 ใช้พิกัดปัจจุบันเป็นจุดวาร์ป:', CFG.sellNpcMap, '@(', CFG.sellNpcX, CFG.sellNpcY + ')'); } else { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); } },
    setSellInterval(min) { CFG.sellIntervalMin = min; log('💰 ขายทุก', min, 'นาที (0=off)'); },
    toggleSellOnFull(on) { CFG.sellOnFull = !!on; log('💰 ขายตอนเต็ม =', CFG.sellOnFull); },
    setSellItems(...ids) { CFG.sellItemIds = ids; log('💰 ขาย item:', ids.map(nameOf).join(', ')); },
    addSellItem(id) { if (!CFG.sellItemIds.includes(id)) CFG.sellItemIds.push(id); log('💰 เพิ่มขาย:', nameOf(id)); },
    removeSellItem(id) { CFG.sellItemIds = CFG.sellItemIds.filter(x => x !== id); log('💰 เลิกขาย:', nameOf(id)); },
    sellNow() { if (sellState === 'IDLE' && currentMap && player.x != null) { sellReturnTo = { map: currentMap, x: Math.round(player.x), y: Math.round(player.y) }; sendTeleport(CFG.sellNpcMap, CFG.sellNpcX, CFG.sellNpcY); setSellState('WARP_TO_NPC'); log('💰 ขายทันที! → วาร์ป', CFG.sellNpcMap, '@(', CFG.sellNpcX, CFG.sellNpcY + ')'); } else { log('⚠️ ไม่สามารถขายได้ตอนนี้ (state:', sellState + ')'); } },
    getInventory() { return [...inventory.entries()].map(([id, c]) => ({ id, name: itemDisplayName(id), count: c, action: getItemAction(Number(id)) })).sort((a, b) => b.count - a.count); },

    // ---------- Auto-Storage (ฝากเข้า Kafra) ----------
    storageOn()  { CFG.storageEnabled = true;  log('🏦 Auto-Storage: ON'); },
    storageOff() { CFG.storageEnabled = false; log('🏦 Auto-Storage: OFF'); },
    setKafra(name, map) { CFG.kafraName = name; if (map) CFG.kafraMap = map; log('🏦 Kafra:', name, '@', CFG.kafraMap); },
    setKafraPos(x, y) { CFG.kafraMapX = Math.round(Number(x)); CFG.kafraMapY = Math.round(Number(y)); log('🏦 พิกัดวาร์ป Kafra:', CFG.kafraMapX, CFG.kafraMapY); },
    useCurrentPosAsKafra() { if (player.x != null && player.y != null) { CFG.kafraMapX = Math.round(player.x); CFG.kafraMapY = Math.round(player.y); if (currentMap) CFG.kafraMap = currentMap; log('🏦 ใช้พิกัดปัจจุบันเป็นจุดวาร์ป Kafra:', CFG.kafraMap, '@(', CFG.kafraMapX, CFG.kafraMapY + ')'); } else { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); } },
    toggleDepositOnFull(on) { CFG.depositOnFull = !!on; log('🏦 ฝากตอนเต็ม =', CFG.depositOnFull); },
    toggleDepositAfterSell(on) { CFG.depositAfterSell = !!on; log('🏦 ฝากหลังขาย =', CFG.depositAfterSell); },
    // ★ Warp-to-Boss toggles (สำหรับ remote command)
    warpToBossOn()     { CFG.warpToBoss = true;     saveConfigDebounced(); log('👑 วาร์ปไปสู้ Boss: เปิด'); },
    warpToBossOff()    { CFG.warpToBoss = false;    saveConfigDebounced(); log('👑 วาร์ปไปสู้ Boss: ปิด'); },
    warpToMiniBossOn() { CFG.warpToMiniBoss = true; saveConfigDebounced(); log('👹 วาร์ปไปสู้ Mini Boss: เปิด'); },
    warpToMiniBossOff(){ CFG.warpToMiniBoss = false;saveConfigDebounced(); log('👹 วาร์ปไปสู้ Mini Boss: ปิด'); },
    setDepositItems(...ids) { CFG.depositItemIds = ids; log('🏦 ฝาก item:', ids.map(nameOf).join(', ')); },
    addDepositItem(id) { if (!CFG.depositItemIds.includes(id)) CFG.depositItemIds.push(id); log('🏦 เพิ่มฝาก:', nameOf(id)); },
    removeDepositItem(id) { CFG.depositItemIds = CFG.depositItemIds.filter(x => x !== id); log('🏦 เลิกฝาก:', nameOf(id)); },
    depositNow() {
      if (storageState !== 'IDLE') { log('⚠️ กำลังฝากอยู่แล้ว (state:', storageState + ')'); return; }
      if (!CFG.depositItemIds.length) { log('⚠️ ยังไม่ได้เลือก item ที่จะฝาก'); return; }
      if (!currentMap || player.x == null) { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); return; }
      let hasDeposit = false;
      for (const id of CFG.depositItemIds) { if ((inventory.get(id) || 0) > 0) { hasDeposit = true; break; } }
      if (!hasDeposit) { log('⚠️ ไม่มีของที่จะฝากใน inventory'); return; }
      startStorage('กดฝากเดี๋ยวนี้', null);
    },

    // ---------- Farm Map ----------
    //  setFarmMap(name, x, y): ตั้งแมปฟาร์ม + พิกัด (x/y optional, default -999=random)
    //  useCurrentPosAsFarm(): ดึงพิกัดตัวละครปัจจุบันเป็นจุดวาร์ปของแมปฟาร์ม
    //  warpToFarm(): วาร์ปไปแมปฟาร์มทันที (manual — เผื่อผู้เล่นควบคุมเองแล้วอยากกลับ)
    //  toggleWarpBack(on): เปิด/ปิด auto warp-back เมื่อออกจากแมปฟาร์ม
    setFarmMap(name, x, y) {
      CFG.farmMap = String(name || '');
      CFG.farmMapX = (x != null) ? Math.round(Number(x)) : -999;
      CFG.farmMapY = (y != null) ? Math.round(Number(y)) : -999;
      log('🗺️ แมปฟาร์ม:', CFG.farmMap || '(ยกเลิก)', '@(', CFG.farmMapX, CFG.farmMapY + ')');
    },
    useCurrentPosAsFarm() {
      if (player.x != null && player.y != null) {
        CFG.farmMapX = Math.round(player.x); CFG.farmMapY = Math.round(player.y);
        if (currentMap) CFG.farmMap = currentMap;
        log('🗺️ ใช้พิกัดปัจจุบันเป็นแมปฟาร์ม:', CFG.farmMap, '@(', CFG.farmMapX, CFG.farmMapY + ')');
      } else { log('⚠️ ยังไม่รู้พิกัดตัวละคร'); }
    },
    warpToFarm() {
      if (!CFG.farmMap) { log('⚠️ ยังไม่ได้ตั้งแมปฟาร์ม (ASSIST.setFarmMap หรือกด "ใช้พิกัดตัวละคร")'); return; }
      if (!activeWS || activeWS.readyState !== 1) { log('⚠️ ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์'); return; }
      sendTeleport(CFG.farmMap, CFG.farmMapX, CFG.farmMapY);
      log('🌀 วาร์ปไปแมปฟาร์ม:', CFG.farmMap, '@(', CFG.farmMapX, CFG.farmMapY + ')');
    },
    toggleWarpBack(on) { CFG.warpBackToFarm = !!on; log('🗺️ วาร์ปกลับแมปฟาร์มอัตโนมัติ =', CFG.warpBackToFarm); },
    openMonitor() { openMonitor(); },
    getSellState() { return { state: sellState, full: inventoryFull, returnTo: sellReturnTo }; },

    // ---------- Navigation (บันทึกเส้นทางเดิน + waypoint graph) ----------
    navRecordOn()  { CFG.navRecording = true;  log('🗺️ บันทึกเส้นทาง: ON — เดินเก็บข้อมูลในแมปที่ต้องการ'); },
    navRecordOff() { CFG.navRecording = false; log('🗺️ บันทึกเส้นทาง: OFF'); },
    navSetMergeRadius(r) { CFG.navMergeRadius = Math.max(1, Number(r) || 3); log('🗺️ รัศมีรวมจุด =', CFG.navMergeRadius, 'ช่อง'); },
    navToggleWander(on) { CFG.navWanderUseNav = !!on; log('🗺️ wander ใช้ nav =', CFG.navWanderUseNav); },
    navGetStats(mapName) {
      const data = navLoadMap(mapName || currentMap);
      if (!data) return { maps: 0 };
      return { map: mapName || currentMap, nodes: (data.nodes||[]).length, edges: (data.edges||[]).length, trail: (data.trail||[]).length };
    },
    navGetAllStats() {
      const maps = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(NAV_KEY_PREFIX)) {
          try {
            const d = JSON.parse(localStorage.getItem(key));
            maps[key.slice(NAV_KEY_PREFIX.length)] = { nodes: (d.nodes||[]).length, edges: (d.edges||[]).length, trail: (d.trail||[]).length };
          } catch (e) {}
        }
      }
      return maps;
    },
    navNavigateTo(x, y) { return navNavigateTo(x, y); },   // ทดสอบ path
    navClearMap(mapName) { navClear(mapName); },
    navClearAll() { navClear(); },
    navExport() {
      const data = navExportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ro-nav-data.json'; a.click();
      URL.revokeObjectURL(url);
      log('🗺️ export nav data:', Object.keys(data).length, 'แมป');
    },
    navImport(json) {
      try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const count = navImportAll(data);
        log('🗺️ import nav data:', count, 'แมป');
        return count;
      } catch (e) { log('⚠️ import nav ล้มเหลว:', e.message); return 0; }
    },

    // ---------- Auto-Loot ----------
    lootOn()  { CFG.lootEnabled = true;  log('📦 Auto-Loot: ON'); },
    lootOff() { CFG.lootEnabled = false; log('📦 Auto-Loot: OFF'); },
    setLootMode(mode) {
      if (!['all', 'only', 'except'].includes(mode)) { console.warn('โหมดต้องเป็น all/only/except'); return; }
      CFG.filter.mode = mode; log('📦 loot mode =', mode);
    },
    // ---------- Warp-to-Loot (ฟีเจอร์รุนแรง) ----------
    warpLootOn() {
      CFG.warpLootEnabled = true;
      if (!currentMap) console.warn('⚠️ ยังไม่รู้ชื่อแมป — warp จะทำงานหลังเข้าแมป');
      log('🌀 Warp-to-Loot: ON (เก็บไม่ได้ครบ', CFG.maxAttempts, 'ครั้ง → วาร์ปไปเก็บ)');
    },
    warpLootOff() {
      CFG.warpLootEnabled = false;
      warpQueue.clear();
      log('🌀 Warp-to-Loot: OFF');
    },
    warpLootQueue() {
      return [...warpQueue.values()].map(w => ({ item: nameOf(w.itemId), x: w.x, y: w.y, offsetIdx: w.offsetIdx }));
    },
    addLootOnly(...ids) {
      for (const id of ids) if (!CFG.filter.onlyItems.includes(id)) CFG.filter.onlyItems.push(id);
      log('📦 onlyItems =', CFG.filter.onlyItems);
    },
    addLootExcept(...ids) {
      for (const id of ids) if (!CFG.filter.exceptItems.includes(id)) CFG.filter.exceptItems.push(id);
      log('📦 exceptItems =', CFG.filter.exceptItems);
    },
    clearLootOnly()   { CFG.filter.onlyItems = [];   log('📦 ล้าง onlyItems'); },
    clearLootExcept() { CFG.filter.exceptItems = []; log('📦 ล้าง exceptItems'); },
    // ตั้งดีเลย์ก่อนเริ่มเก็บ (ms หลังของตก) — 0 = เก็บทันที
    setLootDelay(ms) {
      if (typeof ms !== 'number' || ms < 0) { console.warn('ต้องเป็นเลข ≥ 0'); return; }
      CFG.lootDelayAfterDropMs = ms;
      log('📦 ดีเลย์ก่อนเก็บ =', ms + 'ms' + (ms ? ' (รอหลังของตก)' : ' (เก็บทันที)'));
    },

    // ---------- Auto-Combat ----------
    combatOn() {
      CFG.combatEnabled = true;
      if (!CFG.targetWhitelist.length && !CFG.targetBlacklist.length) console.warn('⚠️ whitelist + blacklist ว่าง = ตีทุกมอน (รวม MVP/มอนแรง) — ควรตั้ง whitelist หรือ blacklist กันตาย');
      log('⚔️ Auto-Combat: ON');
    },
    combatOff() { CFG.combatEnabled = false; target = null; log('⚔️ Auto-Combat: OFF'); },
    setTargetWhitelist(...namesOrIds) {
      CFG.targetWhitelist = namesOrIds;
      log('⚔️ whitelist =', namesOrIds.join(', ') || '(ว่าง = ตีทุกมอน)');
    },
    addTargetWhitelist(...x) { for (const e of x) if (!CFG.targetWhitelist.includes(e)) CFG.targetWhitelist.push(e); log('⚔️ whitelist =', CFG.targetWhitelist.join(', ')); },
    clearTargetWhitelist() { CFG.targetWhitelist = []; log('⚔️ ล้าง whitelist = ตีทุกมอน'); },
    setTargetBlacklist(...namesOrIds) { CFG.targetBlacklist = namesOrIds; log('⚔️ blacklist =', namesOrIds.join(', ')); },
    addTargetBlacklist(...x) { for (const e of x) if (!CFG.targetBlacklist.includes(e)) CFG.targetBlacklist.push(e); log('⚔️ blacklist =', CFG.targetBlacklist.join(', ')); },
    clearTargetBlacklist() { CFG.targetBlacklist = []; log('⚔️ ล้าง blacklist'); },
    setFleeMob(n) { CFG.fleeOnMobCount = n; log('🏃 flee รุม', n, 'ตัว' + (n ? '' : ' (off)')); },
    setFleeAggro(n) { CFG.fleeOnAggroCount = n; log('🏃 flee aggro', n, 'ตัว' + (n ? '' : ' (off)')); },
    setFleeProximity(n, radius) { CFG.fleeOnProximityCount = n; if (radius != null) CFG.fleeOnProximityRadius = radius; log('🏃 flee มอนรอบ', n, 'ตัวในระยะ', CFG.fleeOnProximityRadius); },
    setRanged(range) { CFG.rangedAttackRange = range; log('🏹 ranged range =', range, range ? '' : '(ใช้ attackRange)'); },
    setAttackRange(r) { CFG.attackRange = r; log('⚔️ attackRange =', r); },
    // ★ ปรับ re-issue/abandon timing (pending spam)
    setAttackReissue(ms) { CFG.attackReIssueMs = ms; log('⚔️ re-issue attack ทุก', ms + 'ms'); },
    setAttackAbandon(ms) { CFG.attackAbandonMs = ms; log('⚔️ abandon ถ้า server เงียบ', ms + 'ms'); },
    setPostCombatDelay(ms) { CFG.postCombatDelayMs = ms; log('⚔️ รอ', ms + 'ms หลังสู้เสร็จ/เก็บของเสร็จ'); },
    // toggle helpers สำหรับ UI
    toggleAntiKS(on) { CFG.antiKS = !!on; log('⚔️ antiKS =', CFG.antiKS); },
    toggleAvoidPlayers(on) { CFG.avoidOtherPlayers = !!on; log('⚔️ avoidOtherPlayers =', CFG.avoidOtherPlayers); },
    toggleLowestHpFirst(on) { CFG.targetLowestHpFirst = !!on; log('⚔️ targetLowestHpFirst =', CFG.targetLowestHpFirst); },
    toggleWander(on) { CFG.wanderEnabled = !!on; log('⚔️ wander =', CFG.wanderEnabled); },
    toggleWarpFind(on) { CFG.warpFindEnabled = !!on; log('⚔️ warpFind =', CFG.warpFindEnabled); },
    toggleWarpToMonster(on) { CFG.warpToMonster = !!on; log('⚔️ warpToMonster =', CFG.warpToMonster); },
    // debug
    getEntities() {
      const now = nowMs();
      return [...entities.values()].filter(e => e.kind === 1 && e.alive).slice(0, 30).map(e => ({
        id: e.id.toString(16), name: e.name || '?', sub: e.sub, x: e.x, y: e.y,
        hp: e.hp != null && e.hpMax ? (e.hp + '/' + e.hpMax + ' ' + monsterHpPct(e).toFixed(0) + '%') : '?',
        engaged: e._lastEngagedByOtherAt && (now - e._lastEngagedByOtherAt) < 5000,
      }));
    },
    getTarget() { return target ? { id: target.id.toString(16), pending: target.pendingAttacks, engageSec: target.engageAt ? ((nowMs()-target.engageAt)/1000).toFixed(0) : 0 } : null; },
    getAggro() { return { mobAttackers: getMobAttackerCount(CFG.fleeOnProximityRadius), aggro: getAggroCount(CFG.fleeOnProximityRadius), threat: getThreatCount(CFG.fleeOnProximityRadius), monstersNearby: countMonsters(CFG.fleeOnProximityRadius) }; },
    // ★ debug: ดู entities ทั้งหมดเพื่อหาสาเหตุ acquire ไม่ติด
    debugEntities() {
      const now = nowMs();
      let spawnCount = 0, ghostCount = 0, monsterCount = 0, targetableCount = 0;
      const sample = [];
      for (const e of entities.values()) {
        if (e.sub != null) spawnCount++; else ghostCount++;
        if (e.kind === 1 && e.alive) {
          monsterCount++;
          if (sample.length < 8) sample.push({ id: e.id.toString(16), name: e.name, sub: e.sub, x: e.x, y: e.y, hp: e.hp, hpMax: e.hpMax, targetable: isTargetable(e, now) });
          if (isTargetable(e, now)) targetableCount++;
        }
      }
      console.log('entities total:', entities.size, '| fromSPAWN:', spawnCount, '| ghost:', ghostCount, '| monsters:', monsterCount, '| targetable:', targetableCount);
      // ★ debug playerId vs entity: ดูว่า player entity มีพิกัดตรงกับ player.x/y ไหม
      const playerEntity = playerId ? entities.get(playerId) : null;
      console.log('playerId:', playerId ? playerId.toString(16) : 'NULL', '| player.x/y:', player.x, player.y,
        '| playerEntity:', playerEntity ? `{x:${playerEntity.x}, y:${playerEntity.y}, kind:${playerEntity.kind}, name:${playerEntity.name}}` : 'NOT IN ENTITIES');
      // ★ debug target ปัจจุบัน (แม้อยู่นอก 8 ตัวแรก)
      if (target) {
        const tm = entities.get(target.id);
        console.log('TARGET:', target.id.toString(16), '| pending:', target.pendingAttacks, '| firstAttackAt:', target.firstAttackAt ? ((now-target.firstAttackAt)/1000).toFixed(1)+'s' : 'none',
          '| inEntities:', !!tm, tm ? `{name:${tm.name}, hp:${tm.hp}/${tm.hpMax}, _lastDamageAt:${tm._lastDamageAt ? ((now-tm._lastDamageAt)/1000).toFixed(1)+'s ago' : 'NEVER'}}` : '');
      }
      console.table(sample);
      return { total: entities.size, spawnCount, ghostCount, monsterCount, targetableCount, sample, player: { ...player }, playerId: playerId ? playerId.toString(16) : null };
    },

    // ---------- ทั่วไป ----------
    name(id, label) { CFG.itemNames[id] = label; log('🏷️', id, '=', label); },
    config() { return CFG; },
    // ---------- สถิติ + log (สำหรับ panel) ----------
    getStats() {
      const elapsed = Math.max(1, Date.now() - stats.startTime);
      const elapsedMin = elapsed / 60000;
      const now = Date.now();
      // ★ rolling window cleanup + calc (mirror world.js:1699-1721, bot.js:4439-4443)
      const dpsWindow = stats.dealtWindow.filter(d => d.t >= now - 10000);
      const atkWindow = stats.attackWindow.filter(a => a.t >= now - 10000);
      const goldWin = stats.goldWindow.filter(g => g.t >= now - 300000);
      // trim old entries (กัน array โตไม่หยุด)
      if (stats.dealtWindow.length > 500) stats.dealtWindow = dpsWindow;
      if (stats.attackWindow.length > 500) stats.attackWindow = atkWindow;
      if (stats.goldWindow.length > 500) stats.goldWindow = goldWin;
      return {
        ...stats,
        itemsByCount: [...stats.itemsByCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => ({ id, name: nameOf(id), count: n })),
        elapsedMs: elapsed,
        expPerMin: elapsedMin > 0 ? Math.round(stats.expGained / elapsedMin) : 0,
        killsPerMin: elapsedMin > 0 ? +(stats.kills / elapsedMin).toFixed(1) : 0,
        dps: dpsWindow.length > 0 ? Math.round(dpsWindow.reduce((s, d) => s + d.damage, 0) / 10) : 0,
        aspd: atkWindow.length > 0 ? +((atkWindow.length / 10)).toFixed(1) : 0,
        goldRatePerHour: goldWin.length > 0 ? Math.round(goldWin.reduce((s, g) => s + g.gold, 0) / 5 * 60) : 0,
      };
    },
    resetStats() { resetStats(); log('📊 รีเซ็ตสถิติแล้ว'); },
    getLogs() { return logBuf.slice(); },
    clearLogs() { logBuf.length = 0; log('🧹 ล้าง log'); },
    getImportantLogs() { return importantLogBuf.slice(); },
    clearImportantLogs() { importantLogBuf.length = 0; log('🧹 ล้าง log สำคัญ'); },
    stopAll() {
      clearInterval(healLoop); clearInterval(lootLoop); clearInterval(warpLoop); clearInterval(combatLoop); clearInterval(sellLoop); clearInterval(storageLoop); clearInterval(buffLoop); clearInterval(consoleClearLoop);
      if (typeof uiLoop !== 'undefined') clearInterval(uiLoop);
      log('⏹ หยุดระบบทั้งหมดแล้ว');
    },
    // ---------- version + update ----------
    version() { return { current: VERSION, latest: latestVersion, updateAvailable: latestVersion ? cmpVer(latestVersion, VERSION) > 0 : false }; },
    checkVersion() { return checkVersion(); },
    update() { return doUpdate(); },
    saveConfig() { saveConfig(); log('💾 บันทึกการตั้งค่าลงเครื่องแล้ว'); },

    // ---------- Full export/import (ย้ายเครื่อง) ----------
    //  รวม: config + buff times + skill times + nav data
    exportAll() {
      const data = { _version: VERSION, _exportedAt: new Date().toISOString() };
      const cfg = {};
      for (const k of PERSIST_KEYS) if (k in CFG) cfg[k] = CFG[k];
      // ★ sort item ID arrays ตามเลขไอดี (เวลา export จะได้มองง่าย)
      const sortNum = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => a - b) : arr;
      if (cfg.healItems) cfg.healItems = sortNum(cfg.healItems);
      if (cfg.sellItemIds) cfg.sellItemIds = sortNum(cfg.sellItemIds);
      if (cfg.depositItemIds) cfg.depositItemIds = sortNum(cfg.depositItemIds);
      if (cfg.buffItems && Array.isArray(cfg.buffItems)) cfg.buffItems = [...cfg.buffItems].sort((a, b) => a.itemId - b.itemId);
      data.config = cfg;
      const buff = {};
      for (const [id, ts] of lastBuffUse) buff[id] = ts;
      data.buffTimes = buff;
      const skill = {};
      for (const [id, ts] of lastSkillUse) skill[id] = ts;
      data.skillTimes = skill;
      data.nav = navExportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ro-assist-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      URL.revokeObjectURL(url);
      log('📤 export ข้อมูลทั้งหมด: config + buff + skill + nav');
    },
    importAll(json) {
      try {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        if (!data || typeof data !== 'object') throw new Error('รูปแบบผิด');
        let count = 0;
        if (data.config) {
          for (const k of PERSIST_KEYS) if (k in data.config) { CFG[k] = data.config[k]; count++; }
          saveConfig();
        }
        if (data.buffTimes) {
          lastBuffUse.clear();
          for (const [id, ts] of Object.entries(data.buffTimes)) lastBuffUse.set(Number(id), Number(ts) || 0);
          saveBuffTimes();
        }
        if (data.skillTimes) {
          lastSkillUse.clear();
          for (const [id, ts] of Object.entries(data.skillTimes)) lastSkillUse.set(Number(id), Number(ts) || 0);
          saveSkillTimes();
        }
        if (data.nav) { count += navImportAll(data.nav); }
        log('📥 import ข้อมูลสำเร็จ: ' + count + ' รายการ');
      } catch (e) { log('⚠️ import ล้มเหลว:', e.message); }
    },
  };

  // ============================================================
  //  UI — mini-bar + popup panel (ฝังในหน้าเกม)
  // ============================================================
  let uiLoop;          // render interval (clear ใน stopAll)
  // ★ editing input tracking (module-level — ใช้ได้ทั้ง buildUI + renderUI)
  //   Unity แย่ง focus ทุกเฟรม → document.activeElement ไม่เชื่อถือได้
  //   track ด้วย focusin/focusout แทน
  const editingInputs = new WeakSet();
  const isEditing = (el) => el && editingInputs.has(el);
  // ============================================================
  //  ITEM-LIST POPUP — จัดการรายการ item (only/except) แบบ visual
  //    listType: 'only' | 'except' (สำหรับ loot filter)
  // ============================================================
  // ★ source ของรายการที่จะแสดงในช่องค้นหา = itemDB ทั้งหมด + inventory ปัจจุบัน
  function itemDBEntries() {
    const entries = [];
    // ★ inventory ปัจจุบัน แสดงก่อน (ใช้บ่อยที่สุด)
    for (const [id, count] of inventory.entries()) {
      if (count > 0) entries.push({ id: Number(id), name: itemDisplayName(id), count, src: 'inv' });
    }
    // ★ itemDB ทั้งหมด (ถ้าโหลดแล้ว)
    if (itemDB.loaded) {
      for (const id of Object.keys(itemDB.names)) {
        const numId = Number(id);
        if (!inventory.has(numId)) entries.push({ id: numId, name: itemDB.names[id], src: 'db' });
      }
    }
    return entries;
  }
  // ============================================================
  //  SKILL PRESETS — ฐานข้อมูลสกิลสำเร็จรูป (เลือกใช้ได้เลย)
  //    แต่ละสกิลมีค่า default ที่ทดสอบแล้ว — ผู้ใช้ปรับแต่งเพิ่มเติมได้หลังเพิ่ม
  //    skillId จาก packet capture: targeted=1 byte, AoE/self=2 bytes LE
  // ============================================================
  // ★ SKILL_PRESETS — เฉพาะสกิลที่ทดลองแล้ว (verify จาก packet capture)
  //    ถ้ายังไม่ได้ทดลอง = ไม่ใส่ (กันค่าผิด)
  const SKILL_PRESETS = [
    // ---- Swordsman/Knight (จากบอทหลัก config + packet capture) ----
    { name: 'Bash', skillId: 3, level: 10, targeted: true, maxUsesPerTarget: 1, maxDistance: 2, spMin: 15, cooldownMs: 72, job: 'Swordsman/Knight', desc: 'ตีแรง + สตัน' },
    { name: 'Magnum Break', skillId: 6, level: 10, mobCountMin: 2, maxUsesPerTarget: 1, spMin: 30, cooldownMs: 90, job: 'Knight', desc: 'AoE รอบตัว' },
    { name: 'Provoke', skillId: 7, level: 10, targeted: true, maxUsesPerTarget: 1, maxDistance: 10, spMin: 5, cooldownMs: 3, job: 'Swordsman', desc: 'ลด def มอน' },
    { name: 'Endure', skillId: 4, level: 10, selfCast: true, intervalMin: 3, spMin: 10, cooldownMs: 1, job: 'Swordsman', desc: 'บัพ ไม่กระตุก' },
    { name: 'Twohand Quicken', skillId: 30, level: 10, selfCast: true, intervalMin: 3, spMin: 50, cooldownMs: 1, job: 'Knight', desc: 'บัพ ASPD ดาบสองมือ' },
    { name: 'Bowling Bash', skillId: 32, level: 10, targeted: true, mobCountMin: 2, maxUsesPerTarget: 1, maxDistance: 2, spMin: 22, cooldownMs: 84, job: 'Knight Lord', desc: 'ตีกระแทก' },
    { name: 'Charge Attack', skillId: 40, level: 1, targeted: true, maxUsesPerTarget: 1, maxDistance: 10, minDistance: 5, spMin: 30, cooldownMs: 114, job: 'Knight', desc: 'พุ่งเข้าหามอน' },
    // ---- Archer/Hunter (ทดลองครบ) ----
    { name: 'Double Strafe', skillId: 24, level: 10, targeted: true, maxUsesPerTarget: 2, maxDistance: 15, spMin: 20, cooldownMs: 60000, job: 'Archer/Hunter', desc: 'ยิง 2 ลูก' },
    { name: 'Improve Concentration', skillId: 27, level: 10, selfCast: true, intervalMin: 4.3, spMin: 70, cooldownMs: 1, job: 'Archer/Hunter', desc: 'บัพ DEX+AGI' },
    { name: 'Charge Arrow', skillId: 25, level: 1, targeted: true, maxUsesPerTarget: 1, maxDistance: 10, spMin: 20, cooldownMs: 60000, job: 'Archer/Hunter', desc: 'ดันมอนออกไกล' },
    { name: 'Arrow Shower', skillId: 26, level: 5, ground: true, maxUsesPerTarget: 1, maxDistance: 10, mobCountMin: 2, spMin: 20, cooldownMs: 60000, job: 'Hunter', desc: 'AoE ธนู (เลือกพื้นที่)' },
  ];
  function skillPresetGroups() {
    const groups = {};
    for (const s of SKILL_PRESETS) { (groups[s.job] = groups[s.job] || []).push(s); }
    return groups;
  }
  function openItemListPopup(listType) {
    // ★ สร้าง popup ใหม่ทุกครั้ง (กัน closure/listener ค้างจากครั้งก่อน)
    const old = document.getElementById('__assist_itempopup');
    if (old) old.remove();
    const popup = document.createElement('div');
    popup.id = '__assist_itempopup';
    document.body.appendChild(popup);

    const getList = () => listType === 'only' ? CFG.filter.onlyItems : CFG.filter.exceptItems;
    const setList = (arr) => {
      if (listType === 'only') CFG.filter.onlyItems = arr; else CFG.filter.exceptItems = arr;
      saveConfigDebounced();
    };
    const titleTxt = listType === 'only' ? 'เก็บเฉพาะ (only)' : 'ยกเว้น (except)';

    function render(search) {
      const current = getList();
      const s = (search || '').trim().toLowerCase();
      const all = itemDBEntries();
      // ★ แบ่ง 2 ส่วน: (1) ในรายการแล้ว (2) ค้นหาเพิ่ม
      const inList = current.map(id => {
        const e = all.find(x => x.id === id) || { id, name: nameOf(id) };
        return e;
      });
      const searchable = all.filter(e => !current.includes(e.id));
      let searchRes = searchable;
      if (s) {
        searchRes = searchable.filter(e =>
          e.name.toLowerCase().includes(s) || String(e.id).includes(s));
      }
      searchRes = searchRes.slice(0, 200);   // limit กัน lag

      const renderItem = (e, inCurrent) => {
        const icon = `<img src="${itemIconUrl(e.id)}" onerror="this.style.visibility='hidden'">`;
        const price = itemPrice(e.id);
        const priceStr = price ? `<span class="price">${(price).toLocaleString()}z</span>` : '';
        const countStr = e.count ? ` <span style="color:#27ae60">×${e.count}</span>` : '';
        const btn = inCurrent
          ? `<button class="rmbtn" data-rm="${e.id}">✕ ลบ</button>`
          : `<button class="addbtn" data-add="${e.id}">+ เพิ่ม</button>`;
        return `<div class="itemrow">${icon}<span class="nm">${e.name}${countStr}</span>${priceStr}<span class="id">${e.id}</span>${btn}</div>`;
      };

      let html = '';
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35">📋 ในรายการ (${inList.length})</div>`;
      html += inList.length ? inList.map(e => renderItem(e, true)).join('')
        : `<div class="empty">(ยังว่าง — ค้นหาแล้วกด + เพิ่ม ด้านล่าง)</div>`;
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35;margin-top:6px">🔍 ทั้งหมด${s ? ` (${searchRes.length}${searchable.length>200?'+':''})` : ''}</div>`;
      html += searchRes.length ? searchRes.map(e => renderItem(e, false)).join('')
        : `<div class="empty">${s ? 'ไม่พบ — ลองคำอื่น หรือ id เลข' : 'พิมพ์เพื่อค้นหา...'}</div>`;
      return html;
    }

    popup.innerHTML = `
      <div class="modal">
        <div class="hdr">
          <span class="ttl">📦 จัดการรายการ — ${titleTxt}</span>
          <span class="x" id="__assist_itempopup_x">✕</span>
        </div>
        <div class="searchbar">
          <input type="text" id="__assist_itempopup_search" placeholder="ค้นหาชื่อหรือ id..." autocomplete="off" style="flex:1">
          <input type="text" id="__assist_itempopup_addid" placeholder="id" autocomplete="off" style="width:54px;flex:0 0 auto">
          <button id="__assist_itempopup_addbtn" style="flex:0 0 auto;padding:5px 10px">+ id</button>
        </div>
        <div class="body" id="__assist_itempopup_body"></div>
      </div>`;
    const bodyEl = popup.querySelector('#__assist_itempopup_body');
    const searchInput = popup.querySelector('#__assist_itempopup_search');
    const addIdInput = popup.querySelector('#__assist_itempopup_addid');
    let searchVal = '';
    const refresh = () => { bodyEl.innerHTML = render(searchVal); wireButtons(); };
    // ★ เพิ่ม id แบบ manual (รองรับหลาย id คั่นจุลภาค) — สำหรับ item ที่ไม่อยู่ใน DB
    const addManualIds = () => {
      const ids = addIdInput.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
      if (!ids.length) return;
      const cur = getList();
      let added = 0;
      for (const id of ids) if (!cur.includes(id)) { cur.push(id); added++; }
      setList(cur);
      if (added) { log('📦 เพิ่ม id', ids.join(','), 'เข้า', listType); addIdInput.value = ''; refresh(); }
    };
    popup.querySelector('#__assist_itempopup_addbtn').addEventListener('click', addManualIds);
    addIdInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addManualIds(); } });
    function wireButtons() {
      bodyEl.querySelectorAll('[data-add]').forEach(b => {
        b.onclick = () => {
          const id = parseInt(b.getAttribute('data-add'), 10);
          const cur = getList();
          if (!cur.includes(id)) { setList([...cur, id]); log('📦 เพิ่ม', nameOf(id), 'เข้า', listType); }
          refresh();
        };
      });
      bodyEl.querySelectorAll('[data-rm]').forEach(b => {
        b.onclick = () => {
          const id = parseInt(b.getAttribute('data-rm'), 10);
          setList(getList().filter(x => x !== id));
          log('📦 ลบ', nameOf(id), 'ออกจาก', listType);
          refresh();
        };
      });
    }
    const closePopup = () => { popup.classList.remove('open'); setTimeout(() => popup.remove(), 200); };
    searchInput.addEventListener('input', () => { searchVal = searchInput.value; refresh(); });
    popup.querySelector('#__assist_itempopup_x').addEventListener('click', closePopup);
    popup.addEventListener('click', (ev) => { if (ev.target === popup) closePopup(); });
    // ★ คลิก input ใน popup → focus ทันที (กัน Unity ขโมย focus เหมือน main panel)
    popup.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => { try { e.target.focus(); } catch (_) {} }, 0);
      }
    }, true);
    refresh();
    searchInput.focus();
    popup.classList.add('open');
  }

  // ============================================================
  //  SKILL POPUP — จัดการรายการ skill (เพิ่ม/แก้/ลบ)
  // ============================================================
  function openSkillPopup() {
    const old = document.getElementById('__assist_skillpopup');
    if (old) old.remove();
    const popup = document.createElement('div');
    popup.id = '__assist_skillpopup';
    document.body.appendChild(popup);

    let editingSkillIdx = -1;   // index ของ skill ที่กำลังแก้ (-1 = ไม่มี)
    function render() {
      const skills = CFG.skills || [];
      let html = '';
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35">🔮 skill list (${skills.length})</div>`;
      html += skills.length ? skills.map((s, i) => {
        const mode = s.selfCast ? 'self' : (s.targeted ? 'target' : 'AoE');
        const modeColor = s.selfCast ? '#27ae60' : (s.targeted ? '#e67e22' : '#8e44ad');
        const spStr = s.spMin ? ` SP≥${s.spMin}` : '';
        const cdStr = s.intervalMin > 0 ? ` ทุก${s.intervalMin}นาที` : (s.cooldownMs ? ` cd${(s.cooldownMs/1000).toFixed(0)}s` : '');
        const distStr = s.maxDistance ? ` ≤${s.maxDistance}ช่อง` : '';
        let row = `<div style="padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.04)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="flex:1;font-size:11px;color:#e8e8e8">${s.name || 'skill_'+s.skillId} <span style="color:#5f6368">(#${s.skillId} Lv${s.level})</span></span>
            <span style="font-size:10px;color:${modeColor};background:${modeColor}22;padding:1px 6px;border-radius:3px">${mode}</span>
            <span style="font-size:10px;color:#9aa0a6">${spStr}${cdStr}${distStr}</span>
            <button data-editskill="${i}" style="background:#2a3441;border:1px solid #3a3f4b;border-radius:4px;color:#8ab4f8;cursor:pointer;font-size:11px;padding:3px 8px">✎</button>
            <button class="rmbtn" data-rmskill="${i}" style="background:#4a2020;border:1px solid #6a3030;border-radius:4px;color:#e8e8e8;cursor:pointer;font-size:11px;padding:3px 8px">✕</button>
          </div>`;
        // ★ ฟอร์มแก้ไข (แสดงเมื่อกด ✎)
        if (editingSkillIdx === i) {
          const modeVal = s.selfCast ? 'self' : (s.ground ? 'ground' : (s.targeted ? 'targeted' : 'aoe'));
          const fld = (label, inner, title) => `<label style="display:flex;flex-direction:column;gap:1px;font-size:9px;color:#9aa0a6" title="${title}">${label}${inner}</label>`;
          const inp = (key, val, w) => `<input data-edit="${key}" type="number" value="${val}" style="width:${w};background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`;
          row += `<div style="padding:8px;background:rgba(0,0,0,.2);border-radius:4px;margin-top:4px">
            <div style="display:flex;gap:6px;margin-bottom:6px">
              ${fld('ชื่อ', `<input data-edit="name" value="${s.name||''}" placeholder="ชื่อสกิล" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'ชื่อสกิล (แสดงใน log)')}
              ${fld('skillId', inp('skillId', s.skillId, '60px'), 'เลข ID ของสกิล (จาก packet capture)')}
              ${fld('เลเวล', inp('level', s.level, '45px'), 'เลเวลสกิลที่จะส่ง (1-10)')}
            </div>
            <div style="margin-bottom:6px">
              ${fld('โหมดการใช้งาน', `<select data-edit="mode" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">
                <option value="targeted"${modeVal==='targeted'?' selected':''}>targeted — เลือกเป้า (Bash, Double Strafe)</option>
                <option value="ground"${modeVal==='ground'?' selected':''}>ground — เลือกพื้นที่ (Arrow Shower)</option>
                <option value="aoe"${modeVal==='aoe'?' selected':''}>AoE — รอบตัว (Magnum Break)</option>
                <option value="self"${modeVal==='self'?' selected':''}>self-cast — ใช้กับตัวเอง (Quicken, Blessing)</option>
              </select>`, 'targeted=ต้องมีมอนเป้าหมาย, AoE=ใช้รอบตัว, self=ใช้กับตัวเอง')}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${fld('SP ขั้นต่ำ', inp('spMin', s.spMin||0, '55px'), 'SP ต้องมากกว่าหรือเท่ากับค่านี้ถึงจะใช้')}
              ${fld('Cooldown (วินาที)', `<input data-edit="cooldownSec" type="text" inputmode="decimal" value="${((s.cooldownMs||2000)/1000).toFixed(1)}" style="width:60px;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'ระยะเวลารอก่อนใช้ซ้ำ (วินาที) เช่น 2 = 2 วินาที')}
              ${fld('ระยะสูงสุด', inp('maxDistance', s.maxDistance||0, '55px'), 'ต้องอยู่ใกล้ไม่เกินกี่ช่อง (0=ไม่จำกัด)')}
              ${fld('ครั้ง/มอน', inp('maxUsesPerTarget', s.maxUsesPerTarget||1, '55px'), 'ใช้สกิลนี้ได้กี่ครั้งต่อมอน 1 ตัว')}
              ${fld('มอนขั้นต่ำ', inp('mobCountMin', s.mobCountMin||0, '55px'), 'ใช้เมื่อมอนรุมมากกว่าหรือเท่ากับ N ตัว')}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px">
              ${fld('ระยะเวลา (นาที) — self', `<input data-edit="intervalMin" type="number" step="0.5" value="${s.intervalMin||0}" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'สำหรับ self-cast: ร่ายใหม่ทุก N นาที (0=ใช้ cooldownMs แทน)')}
              ${fld('ระยะต่ำสุด (ช่อง)', `<input data-edit="minDistance" type="number" value="${s.minDistance||0}" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:4px;color:#e8e8e8;padding:4px 6px;font-size:10px;font-family:inherit">`, 'ต้องอยู่ไกลอย่างน้อย N ช่อง (เช่น Charge Attack)')}
            </div>
            <div style="display:flex;gap:4px">
              <button data-saveedit="${i}" style="flex:1;background:#1b5e20;border:1px solid #2e7d32;border-radius:4px;color:#a5d6a7;cursor:pointer;font-size:10px;padding:5px;font-family:inherit">✓ บันทึก</button>
              <button data-canceledit style="flex:1;background:#4a2020;border:1px solid #6a3030;border-radius:4px;color:#ef9a9a;cursor:pointer;font-size:10px;padding:5px;font-family:inherit">ยกเลิก</button>
            </div>
          </div>`;
        }
        row += `</div>`;
        return row;
      }).join('') : `<div class="empty">(ยังว่าง — เพิ่มด้านล่าง)</div>`;

      // ★ preset dropdown — เลือกสกิลสำเร็จรูปจาก database
      const groups = skillPresetGroups();
      const presetOpts = Object.entries(groups).map(([job, skills]) => {
        const skillOpts = skills.map((s, i) => {
          const idx = SKILL_PRESETS.indexOf(s);
          const mode = s.selfCast ? 'self' : (s.targeted ? 'target' : 'AoE');
          return `<option value="${idx}">${s.name} (Lv${s.level}, ${mode}) — ${s.desc || ''}</option>`;
        }).join('');
        return `<optgroup label="${job}">${skillOpts}</optgroup>`;
      }).join('');
      html += `<div style="padding:6px 8px;color:#27ae60;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35;margin-top:6px">⚡ เลือกจาก preset (แนะนำ)</div>`;
      html += `<div style="padding:8px">
        <select id="__assist_skill_preset" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit;margin-bottom:6px">
          <option value="">— เลือกสกิลที่จะเพิ่ม —</option>
          ${presetOpts}
        </select>
        <button id="__assist_skill_presetbtn" style="width:100%;background:#1b5e20;border:1px solid #2e7d32;border-radius:5px;color:#a5d6a7;cursor:pointer;font-size:11px;padding:6px;font-family:inherit;margin-bottom:4px">+ เพิ่มจาก preset</button>
      </div>`;
      html += `<div style="padding:6px 8px;color:#8ab4f8;font-size:11px;font-weight:600;border-bottom:1px solid #2a2d35;margin-top:6px">➕ เพิ่ม skill ใหม่ (กำหนดเอง)</div>`;
      html += `<div style="padding:8px">
        <input id="__assist_skill_name" placeholder="ชื่อ (เช่น Bash)" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit;margin-bottom:4px">
        <div style="display:flex;gap:4px;margin-bottom:4px">
          <input id="__assist_skill_id" type="number" placeholder="skillId" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_lvl" type="number" placeholder="Lv" value="1" style="width:50px;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <select id="__assist_skill_mode" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit;margin-bottom:4px">
          <option value="targeted">targeted (Bash/Double Strafe — เลือกเป้า)</option>
          <option value="ground">ground (Arrow Shower — เลือกพื้นที่)</option>
          <option value="aoe">AoE (Magnum Break — รอบตัว)</option>
          <option value="self">self-cast (Quicken — บัพตัวเอง)</option>
        </select>
        <div style="display:flex;gap:4px;margin-bottom:4px">
          <input id="__assist_skill_sp" type="number" placeholder="spMin" value="0" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_cd" type="number" placeholder="cd ms" value="2000" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <input id="__assist_skill_maxdist" type="number" placeholder="maxDist" value="2" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_maxuse" type="number" placeholder="maxUse/target" value="1" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_mobmin" type="number" placeholder="mobMin" value="0" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <input id="__assist_skill_interval" type="number" placeholder="intervalMin (self)" value="0" step="0.5" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
          <input id="__assist_skill_mindist" type="number" placeholder="minDist" value="0" style="flex:1;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:inherit">
        </div>
        <button id="__assist_skill_addbtn" style="width:100%;background:#1b5e20;border:1px solid #2e7d32;border-radius:5px;color:#a5d6a7;cursor:pointer;font-size:11px;padding:6px;font-family:inherit">+ เพิ่ม skill</button>
      </div>`;
      return html;
    }

    popup.innerHTML = `
      <div class="modal" style="background:rgba(20,22,28,.98);border:1px solid #3a3f4b;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.7);width:420px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;color:#e8e8e8;font-family:'Segoe UI',system-ui,sans-serif;font-size:12px">
        <div class="hdr" style="padding:10px 14px;background:#15171c;border-bottom:1px solid #3a3f4b;display:flex;justify-content:space-between;align-items:center">
          <span style="color:#8ab4f8;font-weight:600;font-size:13px">🔮 จัดการ skill list</span>
          <span id="__assist_skillpopup_x" style="cursor:pointer;color:#9aa0a6;font-size:18px;line-height:1">✕</span>
        </div>
        <div id="__assist_skillpopup_body" style="overflow-y:auto;flex:1;padding:6px 8px"></div>
      </div>`;
    const bodyEl = popup.querySelector('#__assist_skillpopup_body');
    const refresh = () => { bodyEl.innerHTML = render(); wireButtons(); };
    function wireButtons() {
      bodyEl.querySelectorAll('[data-rmskill]').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-rmskill'), 10);
          CFG.skills.splice(i, 1);
          saveConfigDebounced();
          editingSkillIdx = -1;
          refresh();
        };
      });
      // ★ แก้ไข skill — ขยายฟอร์ม
      bodyEl.querySelectorAll('[data-editskill]').forEach(b => {
        b.onclick = () => {
          editingSkillIdx = parseInt(b.getAttribute('data-editskill'), 10);
          refresh();
        };
      });
      // ★ บันทึกการแก้ไข
      bodyEl.querySelectorAll('[data-saveedit]').forEach(b => {
        b.onclick = () => {
          const i = parseInt(b.getAttribute('data-saveedit'), 10);
          const s = CFG.skills[i];
          if (!s) return;
          const getVal = (key) => {
            const el = bodyEl.querySelector(`[data-edit="${key}"]`);
            return el ? el.value : '';
          };
          s.name = getVal('name').trim() || s.name;
          s.skillId = parseInt(getVal('skillId'), 10) || s.skillId;
          s.level = parseInt(getVal('level'), 10) || 1;
          const mode = getVal('mode');
          s.targeted = mode === 'targeted';
          s.ground = mode === 'ground';
          s.selfCast = mode === 'self';
          s.spMin = parseInt(getVal('spMin'), 10) || 0;
          const cdSec = parseFloat(getVal('cooldownSec'));
          s.cooldownMs = isNaN(cdSec) ? (s.cooldownMs || 2000) : Math.round(cdSec * 1000);
          s.maxDistance = parseInt(getVal('maxDistance'), 10) || 0;
          s.maxUsesPerTarget = parseInt(getVal('maxUsesPerTarget'), 10) || 1;
          s.mobCountMin = parseInt(getVal('mobCountMin'), 10) || 0;
          s.intervalMin = parseFloat(getVal('intervalMin')) || 0;
          s.minDistance = parseInt(getVal('minDistance'), 10) || 0;
          saveConfigDebounced();
          editingSkillIdx = -1;
          log('✎ แก้ไข skill', s.name);
          refresh();
        };
      });
      // ★ ยกเลิกการแก้ไข
      bodyEl.querySelectorAll('[data-canceledit]').forEach(b => {
        b.onclick = () => { editingSkillIdx = -1; refresh(); };
      });
      const addBtn = bodyEl.querySelector('#__assist_skill_addbtn');
      // ★ preset button — เพิ่มจาก database สำเร็จรูป
      const presetBtn = bodyEl.querySelector('#__assist_skill_presetbtn');
      if (presetBtn) {
        presetBtn.onclick = () => {
          const sel = bodyEl.querySelector('#__assist_skill_preset');
          const idx = parseInt(sel.value, 10);
          if (isNaN(idx) || !SKILL_PRESETS[idx]) return;
          const p = SKILL_PRESETS[idx];
          ASSIST.addSkill({
            name: p.name, skillId: p.skillId, level: p.level,
            targeted: !!p.targeted, selfCast: !!p.selfCast,
            intervalMin: p.intervalMin || 0, mobCountMin: p.mobCountMin || 0,
            maxUsesPerTarget: p.maxUsesPerTarget || 1, maxDistance: p.maxDistance || 0,
            minDistance: p.minDistance || 0, spMin: p.spMin || 0, cooldownMs: p.cooldownMs || 2000,
          });
          saveConfigDebounced();
          log('⚡ เพิ่ม preset:', p.name, '(#' + p.skillId + ')');
          refresh();
        };
      }
      if (addBtn) {
        addBtn.onclick = () => {
          const name = bodyEl.querySelector('#__assist_skill_name').value.trim() || undefined;
          const skillId = parseInt(bodyEl.querySelector('#__assist_skill_id').value, 10);
          const level = parseInt(bodyEl.querySelector('#__assist_skill_lvl').value, 10) || 1;
          const mode = bodyEl.querySelector('#__assist_skill_mode').value;
          const spMin = parseInt(bodyEl.querySelector('#__assist_skill_sp').value, 10) || 0;
          const cooldownMs = parseInt(bodyEl.querySelector('#__assist_skill_cd').value, 10) || 2000;
          const maxDistance = parseInt(bodyEl.querySelector('#__assist_skill_maxdist').value, 10) || 0;
          const maxUsesPerTarget = parseInt(bodyEl.querySelector('#__assist_skill_maxuse').value, 10) || 1;
          const mobCountMin = parseInt(bodyEl.querySelector('#__assist_skill_mobmin').value, 10) || 0;
          const intervalMin = parseFloat(bodyEl.querySelector('#__assist_skill_interval').value) || 0;
          const minDistance = parseInt(bodyEl.querySelector('#__assist_skill_mindist').value, 10) || 0;
          if (isNaN(skillId)) { return; }
          ASSIST.addSkill({
            name, skillId, level,
            targeted: mode === 'targeted',
            ground: mode === 'ground',
            selfCast: mode === 'self',
            intervalMin, mobCountMin, maxUsesPerTarget, maxDistance, minDistance, spMin, cooldownMs,
          });
          saveConfigDebounced();
          refresh();
        };
      }
    }
    const closePopup = () => { popup.classList.remove('open'); setTimeout(() => popup.remove(), 200); };
    popup.querySelector('#__assist_skillpopup_x').addEventListener('click', closePopup);
    popup.addEventListener('click', (ev) => { if (ev.target === popup) closePopup(); });
    // ★ focus tracking (เหมือน item popup)
    popup.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => { try { e.target.focus(); } catch (_) {} }, 0);
      }
    }, true);
    refresh();
    popup.classList.add('open');
  }

  function buildUI() {
    if (document.getElementById('__assist_root')) return;   // สร้างแล้ว

    // ---------- CSS ----------
    const css = `
      #__assist_root, #__assist_root * { box-sizing: border-box; margin: 0; padding: 0; }
      #__assist_root {
        position: fixed; top: 10px; right: 10px; z-index: 2147483647;
        font-family: 'Segoe UI', 'Segoe UI Emoji', system-ui, 'Apple Color Emoji', sans-serif; font-size: 12px;
        color: #e8e8e8; user-select: none;
      }
      /* mini-bar */
      #__assist_bar {
        background: rgba(20,22,28,.92); border: 1px solid #3a3f4b; border-radius: 8px;
        padding: 5px 8px; display: flex; align-items: center; gap: 4px;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.4); transition: opacity .15s;
        max-width: 900px; flex-wrap: wrap; justify-content: flex-end;
      }
      #__assist_bar:hover { opacity: .85; }
      #__assist_bar .hpbar { width: 60px; height: 8px; background: #2a2d35; border-radius: 4px; overflow: hidden; }
      #__assist_bar .hpfill { height: 100%; background: linear-gradient(90deg,#e53935,#ef5350); transition: width .3s; }
      #__assist_bar .hpfill.warn { background: linear-gradient(90deg,#fb8c00,#ffa726); }
      #__assist_bar .hpfill.good { background: linear-gradient(90deg,#43a047,#66bb6a); }
      #__assist_bar .pill { font-size: 9px; padding: 1px 5px; border-radius: 8px; font-weight: 600; white-space: nowrap; }
      #__assist_bar .pill.on  { background: #1b5e20; color: #a5d6a7; }
      #__assist_bar .pill.off { background: #4a2020; color: #ef9a9a; }
      #__assist_bar .expand { color: #8ab4f8; font-weight: 700; }
      /* popup */
      #__assist_popup {
        display: none; margin-top: 6px; width: 440px; max-height: 70vh;
        background: rgba(20,22,28,.97); border: 1px solid #3a3f4b; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.6); overflow: hidden; flex-direction: column;
      }
      #__assist_popup.open { display: flex; }
      #__assist_tabs { display: flex; background: #15171c; border-bottom: 1px solid #3a3f4b; }
      #__assist_tabs .tab {
        flex: 1; padding: 8px 4px; text-align: center; cursor: pointer; font-size: 11px;
        color: #9aa0a6; border-bottom: 2px solid transparent;
      }
      #__assist_tabs .tab:hover { background: rgba(255,255,255,.04); }
      #__assist_tabs .tab.active { color: #8ab4f8; border-bottom-color: #8ab4f8; }
      .__assist_page { display: none; padding: 10px; overflow-y: auto; }
      .__assist_page.active { display: block; }
      .__assist_page .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
      .__assist_page .row .k { color: #9aa0a6; }
      .__assist_page .row .v { color: #e8e8e8; font-weight: 600; }
      .__assist_page h4 { margin: 8px 0 4px; color: #8ab4f8; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      .__assist_page .field { margin: 6px 0; }
      .__assist_page .field label { display: block; color: #9aa0a6; font-size: 10px; margin-bottom: 2px; }
      .__assist_page .field input, .__assist_page .field select {
        width: 100%; background: #15171c; border: 1px solid #3a3f4b; border-radius: 5px;
        color: #e8e8e8; padding: 5px 7px; font-size: 12px; font-family: inherit;
      }
      .__assist_page .field input:focus, .__assist_page .field select:focus { outline: none; border-color: #8ab4f8; }
      .__assist_page .btns { display: flex; gap: 6px; margin-top: 8px; }
      .__assist_page button {
        flex: 1; background: #2a3441; border: 1px solid #3a3f4b; border-radius: 5px;
        color: #e8e8e8; padding: 6px; cursor: pointer; font-size: 11px; font-family: inherit;
      }
      .__assist_page button:hover { background: #34465a; }
      .__assist_page button.on  { background: #1b5e20; border-color: #2e7d32; }
      .__assist_page button.off { background: #4a2020; border-color: #6a3030; }
      .__assist_page button.danger { background: #4a2020; }
      .__assist_page .logbox {
        background: #0f1115; border: 1px solid #2a2d35; border-radius: 5px; padding: 6px;
        height: 240px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 10.5px; line-height: 1.5;
      }
      .__assist_page .logline { color: #b0b0b0; padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,.03); white-space: pre-wrap; word-break: break-word; }
      .__assist_page .logline .ts { color: #5f6368; }
      /* ===== sub-tabs (ใน config page) ===== */
      .__assist_subtabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid #3a3f4b; margin-bottom: 8px; padding-bottom: 0; }
      .__assist_subtabs .subtab { padding: 7px 12px; font-size: 11px; cursor: pointer; color: #9aa0a6; border-bottom: 2px solid transparent; border-radius: 3px 3px 0 0; white-space: nowrap; }
      .__assist_subtabs .subtab:hover { background: rgba(255,255,255,.04); color: #cdd3de; }
      .__assist_subtabs .subtab.active { color: #8ab4f8; border-bottom-color: #8ab4f8; }
      .__assist_subpage { display: none; }
      .__assist_subpage.active { display: block; }
      .__assist_dead { animation: __assist_blink 1s infinite; }
      @keyframes __assist_blink { 50% { opacity: .4; } }
      /* ===== item-list popup + skill popup (รวม CSS) ===== */
      #__assist_itempopup, #__assist_skillpopup {
        position: fixed; inset: 0; z-index: 2147483648;
        background: rgba(0,0,0,.5); display: none; align-items: center; justify-content: center;
      }
      #__assist_itempopup.open, #__assist_skillpopup.open { display: flex; }
      #__assist_itempopup .modal, #__assist_skillpopup .modal {
        background: rgba(20,22,28,.98); border: 1px solid #3a3f4b; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,.7); width: 480px; max-width: 92vw; max-height: 80vh;
        display: flex; flex-direction: column; overflow: hidden; color: #e8e8e8;
        font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px;
      }
      #__assist_itempopup .modal .hdr {
        padding: 10px 14px; background: #15171c; border-bottom: 1px solid #3a3f4b;
        display: flex; justify-content: space-between; align-items: center;
      }
      #__assist_itempopup .modal .hdr .ttl { color: #8ab4f8; font-weight: 600; font-size: 13px; }
      #__assist_itempopup .modal .hdr .x { cursor: pointer; color: #9aa0a6; font-size: 18px; line-height: 1; padding: 0 4px; }
      #__assist_itempopup .modal .hdr .x:hover { color: #ef5350; }
      #__assist_itempopup .modal .searchbar { padding: 8px 14px; border-bottom: 1px solid #2a2d35; display: flex; gap: 8px; }
      #__assist_itempopup .modal .searchbar input {
        flex: 1; background: #15171c; border: 1px solid #3a3f4b; border-radius: 5px;
        color: #e8e8e8; padding: 5px 8px; font-size: 12px; font-family: inherit;
      }
      #__assist_itempopup .modal .searchbar input:focus { outline: none; border-color: #8ab4f8; }
      #__assist_itempopup .modal .body { overflow-y: auto; flex: 1; padding: 6px 8px; }
      #__assist_itempopup .itemrow {
        display: flex; align-items: center; gap: 8px; padding: 5px 6px;
        border-bottom: 1px solid rgba(255,255,255,.04); border-radius: 4px;
      }
      #__assist_itempopup .itemrow:hover { background: rgba(255,255,255,.04); }
      #__assist_itempopup .itemrow img { width: 22px; height: 22px; flex-shrink: 0; }
      #__assist_itempopup .itemrow .nm { flex: 1; font-size: 11px; color: #e8e8e8; }
      #__assist_itempopup .itemrow .id { font-size: 10px; color: #5f6368; font-family: 'Consolas', monospace; }
      #__assist_itempopup .itemrow .price { font-size: 10px; color: #f1c40f; }
      #__assist_itempopup .itemrow .addbtn, #__assist_itempopup .itemrow .rmbtn {
        background: #2a3441; border: 1px solid #3a3f4b; border-radius: 4px; color: #e8e8e8;
        cursor: pointer; font-size: 11px; padding: 3px 10px; font-family: inherit; flex-shrink: 0;
      }
      #__assist_itempopup .itemrow .addbtn:hover { background: #1b5e20; border-color: #2e7d32; }
      #__assist_itempopup .itemrow .rmbtn { background: #4a2020; border-color: #6a3030; }
      #__assist_itempopup .itemrow .rmbtn:hover { background: #6a3030; }
      #__assist_itempopup .empty { padding: 20px; text-align: center; color: #5f6368; font-size: 11px; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // ---------- DOM ----------
    const root = document.createElement('div');
    root.id = '__assist_root';
    root.innerHTML = `
      <div id="__assist_bar">
        <span class="hptext">HP ?</span>
        <div class="hpbar"><div class="hpfill" style="width:0%"></div></div>
        <span class="pill off" data-loot>📦 Loot</span>
        <span class="pill off" data-heal>💉 Heal</span>
        <span class="pill off" data-rest>🪑 Rest</span>
        <span class="pill off" data-combat>⚔️ Combat</span>
        <span class="pill off" data-skill>🔮 Skill</span>
        <span class="pill off" data-buff>✨ Buff</span>
        <span class="pill off" data-sell>💰 Sell</span>
        <span class="pill off" data-storage>🏦 Kafra</span>
        <span class="pill" data-teleport style="background:#4a2c6a;color:#d1b3ff">🌀</span>
        <span class="pill" data-monitor style="background:#1a237e;color:#90caf9">🖥️</span>
        <span class="pill" data-remote style="background:#1a3a1a;color:#81c784;display:none">🌐</span>
        <span class="pill" data-feedback style="background:#4a3a1a;color:#ffd54f" title="แจ้งปัญหา/ข้อเสนอแนะ">💬</span>
        <span class="pill" data-chatroom style="background:#1a3a4a;color:#4fc3f7;position:relative" title="ห้องแชท">🗨️<span id="__assist_chatbadge" style="position:absolute;top:-4px;right:-4px;background:#e74c3c;color:#fff;font-size:8px;border-radius:50%;width:14px;height:14px;display:none;align-items:center;justify-content:center;font-weight:bold"></span></span>
        <span class="expand">⚙</span>
      </div>
      <div id="__assist_popup">
        <div id="__assist_tabs">
          <div class="tab active" data-page="stats">📊 สถิติ</div>
          <div class="tab" data-page="config">⚙️ ตั้งค่า</div>
          <div class="tab" data-page="alert">🔔 สำคัญ</div>
          <div class="tab" data-page="log">📋 Log</div>
        </div>
        <div class="__assist_page active" data-page="stats">
          <div class="row" style="border-bottom:2px solid #3a3f4b;">
            <span class="k">RO Assist</span>
            <span class="v" data-version>v?</span>
            <button id="__assist_updatebtn" style="display:none;background:#e67e22;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:inherit;margin-left:6px;">⬆ อัปเดต</button>
          </div>
          <div class="row"><span class="k">HP</span><span class="v" data-hp>?</span></div>
          <div class="row"><span class="k">ตำแหน่ง</span><span class="v" data-pos>?</span></div>
          <div class="row"><span class="k">🗺️ แมป / ฟาร์ม</span><span class="v" data-farmmap>?</span></div>
          <div class="row"><span class="k">player_id</span><span class="v" data-pid>?</span></div>
          <div class="row"><span class="k">สถานะ</span><span class="v" data-state>?</span></div>
          <div class="row"><span class="k">🌐 Remote Monitor</span><span class="v" data-relay style="color:#9aa0a6">?</span></div>
          <h4>การฟาร์ม</h4>
          <div class="row"><span class="k">ฆ่าได้</span><span class="v" data-kills>0</span></div>
          <div class="row"><span class="k">เก็บของได้</span><span class="v" data-looted>0</span></div>
          <div class="row"><span class="k">💰 ยอด zeny (session)</span><span class="v" data-zeny style="color:#f1c40f">0z</span></div>
          <div class="row"><span class="k">EXP รวม</span><span class="v" data-exp>0</span></div>
          <div class="row"><span class="k">EXP/นาที</span><span class="v" data-expmin>0</span></div>
          <div class="row"><span class="k">⚔️ Damage/วิ (10วิ)</span><span class="v" data-dps style="color:#e67e22">0</span></div>
          <div class="row"><span class="k">⚡ โจมตี/วิ (ASPD)</span><span class="v" data-aspd style="color:#3498db">0</span></div>
          <div class="row"><span class="k">💰 Zeny/ชม. (5นาที)</span><span class="v" data-goldrate style="color:#f1c40f">0z</span></div>
          <div class="row"><span class="k">เวลาทำงาน</span><span class="v" data-elapsed>0s</span></div>
          <div class="row"><span class="k">ตาย</span><span class="v" data-deaths>0</span></div>
          <h4>Combat</h4>
          <div class="row"><span class="k">เป้าหมาย</span><span class="v" data-combat-target>(none)</span></div>
          <div class="row"><span class="k">มอน (ตี/aggro/รอบ)</span><span class="v" data-combat-aggro>0 / 0 / 0</span></div>
          <div class="row"><span class="k">🎒 Inventory</span><span class="v" data-inventory>?</span></div>
          <div class="row"><span class="k">💰 Sell</span><span class="v" data-sellstate>OFF</span></div>
          <div class="row"><span class="k">🏦 Storage</span><span class="v" data-storagestate>OFF</span></div>
          <h4>ของที่เก็บได้ (ล่าสุด)</h4>
          <div data-items style="font-size:11px;color:#9aa0a6">(ยังไม่มี)</div>
          <div class="btns"><button class="primary" id="__assist_sellnow2">💰 ไปขายของ</button><button class="danger" id="__assist_clearinv">ล้างรายการของ</button><button class="danger" id="__assist_resetstats">รีเซ็ตสถิติ</button></div>
        </div>
        <div class="__assist_page" data-page="config">
          <div class="__assist_subtabs">
            <div class="subtab" data-sub="farm">🗺️ Farm</div>
            <div class="subtab" data-sub="combat">⚔️ Combat</div>
            <div class="subtab active" data-sub="loot">📦 Loot</div>
            <div class="subtab" data-sub="skill">🔮 Skill</div>
            <div class="subtab" data-sub="buff">✨ Buff</div>
            <div class="subtab" data-sub="heal">💉 Heal</div>
            <div class="subtab" data-sub="flee">🏃 Flee</div>
            <div class="subtab" data-sub="rest">🪑 Rest</div>
            <div class="subtab" data-sub="sell">💰 Sell</div>
            <div class="subtab" data-sub="storage">🏦 Storage</div>
            <div class="subtab" data-sub="misc">⚙️ อื่นๆ</div>
            <div class="subtab" data-sub="telegram">📨 Telegram</div>
          </div>
          <!-- 🗺️ Farm -->
          <div class="__assist_subpage" data-sub="farm">
            <div class="btns">
              <button id="__assist_warptofarm" class="primary">🌀 วาร์ปไปแมปฟาร์ม</button>
              <button id="__assist_t_warpback" class="on">วาร์ปกลับอัตโนมัติ</button>
            </div>
            <div class="field"><label>ชื่อแมปฟาร์ม</label><input type="text" id="__assist_farmmap" placeholder="เช่น cmd_fild01 (ว่าง=ปิด)"></div>
            <div class="field"><label>พิกัดวาร์ป X</label><input type="number" id="__assist_farmx" placeholder="-999"><label style="margin-left:8px">Y</label><input type="number" id="__assist_farmy" placeholder="-999"><button id="__assist_usefarmpos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="btns"><button id="__assist_applyfarm">ใช้ค่า farm map</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ วิธีใช้: ยืนในแมปฟาร์ม → กด 'ใช้พิกัดตัวละคร' → ใช้ค่า farm map<br>★ ว่างช่องชื่อแมป = ปิดฟีเจอร์</div>
          </div>
          <!-- ⚔️ Combat -->
          <div class="__assist_subpage" data-sub="combat">
            <div class="btns"><button id="__assist_combatbtn" class="off">Combat: ?</button></div>
            <div class="field"><label>มอนที่จะตี — whitelist (ชื่อหรือ sprite id, คั่นจุลภาค) — ว่าง = ตีทุกมอน</label><input type="text" id="__assist_whitelist" placeholder="เช่น Poring,Lunatic หรือ 4000,1010"></div>
            <div class="field"><label>มอนที่จะไม่ตี — blacklist</label><input type="text" id="__assist_blacklist" placeholder="เช่น MVP,Boss"></div>
            <div class="btns"><button id="__assist_applywhitelist">ตั้ง whitelist</button><button id="__assist_applyblacklist">ตั้ง blacklist</button></div>
            <div class="field"><label>ระยะโจมตี (ช่อง) — นักธนูตั้ง >2 เพื่อตีไกล</label><input type="number" id="__assist_attackrange" min="0" max="15"></div>
            <div class="btns">
              <button id="__assist_t_antiks" class="on">antiKS</button>
              <button id="__assist_t_avoidp" class="on">avoidPlayers</button>
              <button id="__assist_t_lowhp" class="on">lowestHP</button>
            </div>
            <div class="btns">
              <button id="__assist_t_wander" class="on">เดินหามอน</button>
              <button id="__assist_t_warpfind" class="off">วาร์ปหามอน</button>
              <button id="__assist_t_warptomon" class="off">วาร์ปไปหามอนที่ตี</button>
            </div>
            <div class="field"><label>stuck abandon N ครั้งใน 60s → วาร์ปสุ่ม (0=ปิด)</label><input type="number" id="__assist_stuckwarp" min="0" max="20"></div>
            <div class="btns">
              <button id="__assist_t_warptoboss" class="off">👑 วาร์ปไปสู้ Boss</button>
              <button id="__assist_t_warptominiboss" class="off">👹 วาร์ปไปสู้ Mini Boss</button>
            </div>
            <div class="btns"><button id="__assist_applycombat">ใช้ค่า combat</button></div>
          </div>
          <!-- 📦 Loot -->
          <div class="__assist_subpage active" data-sub="loot">
            <div class="btns">
              <button id="__assist_lootbtn" class="on">Loot: ?</button>
            </div>
            <div class="field"><label>โหมด loot</label><select id="__assist_lootmode"><option value="all">all (เก็บหมด)</option><option value="only">only (เก็บเฉพาะ)</option><option value="except">except (ยกเว้น)</option></select></div>
            <div class="btns">
              <button id="__assist_manageonly">📋 จัดการ 'เก็บเฉพาะ'</button>
              <button id="__assist_manageexcept">📋 จัดการ 'ยกเว้น'</button>
            </div>
            <div class="field"><label>ดีเลย์ก่อนเก็บ (ms หลังของตก) — 0 = เก็บทันที</label><input type="number" id="__assist_lootdelay" min="0" step="100"></div>
            <div class="field"><label>ดีเลย์ระหว่างเก็บชิ้นต่อไป (ms) — ห่างระหว่าง pickup แต่ละครั้ง</label><input type="number" id="__assist_lootthrottle" min="100" step="100"></div>
            <div class="field"><label>เช็คของใกล้พิกัดมอนที่ฆ่า (ช่อง) — นักธนูยิงไกล → ของตกที่มอน</label><input type="number" id="__assist_pickradiuskill" min="1" max="20" placeholder="5"></div>
            <div class="btns"><button id="__assist_applylootdelay">ตั้งดีเลย์</button><button id="__assist_t_lootkillpos" class="on">เช็คพิกัดมอนที่ฆ่า</button></div>
            <h4>🌀 Warp-to-Loot (วาร์ปไปเก็บของที่ติดกำแพง)</h4>
            <div class="btns"><button id="__assist_warpbtn" class="off">วาร์ปไปเก็บของ: ?</button></div>
          </div>
          <!-- 🔮 Skill -->
          <div class="__assist_subpage" data-sub="skill">
            <div class="btns">
              <button id="__assist_skillbtn" class="off">Skill: ?</button>
              <button id="__assist_skillnow" class="primary">ใช้ skill เดี๋ยวนี้</button>
              <button id="__assist_manageskill">📋 จัดการ skill</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เพิ่ม/แก้/ลบ skill list ผ่าน popup — รองรับ targeted (Bash), AoE (Magnum), self-cast (Quicken)</div>
            <div id="__assist_skillcountdown" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">(ยังไม่ตั้ง skill)</div>
          </div>
          <!-- ✨ Buff -->
          <div class="__assist_subpage" data-sub="buff">
            <div class="btns">
              <button id="__assist_buffbtn" class="off">Buff: ?</button>
              <button id="__assist_buffnow" class="primary">ใช้ buff เดี๋ยวนี้</button>
            </div>
            <div class="field"><label>buff: itemId,ทุกกี่นาที (คั่นบรรทัด เช่น 656,30) — เพิ่มได้หลายตัว</label><textarea id="__assist_buffitems" rows="3" style="width:100%;background:#15171c;border:1px solid #3a3f4b;border-radius:5px;color:#e8e8e8;padding:5px 7px;font-size:11px;font-family:'Consolas',monospace;resize:vertical" placeholder="656,30&#10;645,30"></textarea></div>
            <div class="btns"><button id="__assist_applybuff">ใช้ค่า buff</button><button id="__assist_clearbufftimes">รีเซ็ต countdown</button></div>
            <div id="__assist_buffcountdown" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">(ยังไม่ตั้ง buff)</div>
          </div>
          <!-- 💉 Heal -->
          <div class="__assist_subpage" data-sub="heal">
            <div class="btns">
              <button id="__assist_healbtn" class="off">Heal: ?</button>
            </div>
            <div class="field"><label>HP% เริ่มใช้ยา (healAt)</label><input type="number" id="__assist_healat" min="1" max="100"></div>
            <div class="field"><label>item id ที่จะใช้ heal (คั่นด้วยจุลภาค)</label><input type="text" id="__assist_healitems" placeholder="เช่น 501,502,503"></div>
            <div class="btns"><button id="__assist_applyheal">ใช้ค่า heal</button></div>
            <div class="field"><label>โหมด heal</label><select id="__assist_healmode"><option value="order">order (ใช้ตัวเดิมจนหมด)</option><option value="random">random (สุ่ม)</option></select></div>
          </div>
          <!-- 🏃 Flee -->
          <div class="__assist_subpage" data-sub="flee">
            <div class="field"><label>flee: รุม N ตัว (0=off)</label><input type="number" id="__assist_fleemob" min="0" max="20"></div>
            <div class="field"><label>flee: aggro N ตัว (0=off)</label><input type="number" id="__assist_fleeaggro" min="0" max="20"></div>
            <div class="field"><label>flee: มอนรอบ N ตัว ในระยะ (0=off)</label><input type="number" id="__assist_fleeprox" min="0" max="20"></div>
            <div class="field"><label>🚨 มอนที่ต้องหนี (ชื่อหรือ sub-ID คั่นจุลภาค) — เจอในระยะ → วาร์ปหนี</label><input type="text" id="__assist_fleemonsters" placeholder="เช่น MVP,Boss,1234"></div>
            <div class="field"><label>ระยะหนีมอนอันตราย (ช่อง)</label><input type="number" id="__assist_fleemonsterradius" min="1" max="50" placeholder="20"></div>
            <div class="btns"><button id="__assist_applyflee">ใช้ค่า flee</button></div>
          </div>
          <!-- 🪑 Rest -->
          <div class="__assist_subpage" data-sub="rest">
            <div class="btns"><button id="__assist_restbtn" class="off">Rest: ?</button></div>
            <div class="field"><label>HP% ที่จะนั่งพัก (ต่ำกว่านี้ → นั่ง)</label><input type="number" id="__assist_resthp" min="1" max="99"></div>
            <div class="field"><label>HP% ที่จะลุกยืน (ฟื้นถึงนี้ → ลุก)</label><input type="number" id="__assist_restuntil" min="1" max="100"></div>
            <div class="field"><label>นั่งนานสุด (วินาที) — กันค้าง</label><input type="number" id="__assist_restmaxsec" min="5" max="300"></div>
            <div class="btns"><button id="__assist_applyrest">ใช้ค่า rest</button></div>
            <h4>💀 Auto-Respawn (เกิดใหม่อัตโนมัติเมื่อตาย)</h4>
            <div class="btns"><button id="__assist_respawnbtn" class="on">Respawn: ?</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ ตาย → respawn กลับจุด save → นั่งพักจนเลือดเต็ม → กลับฟาร์ม</div>
          </div>
          <!-- 💰 Sell -->
          <div class="__assist_subpage" data-sub="sell">
            <div class="btns">
              <button id="__assist_sellbtn" class="off">Sell: ?</button>
              <button id="__assist_sellnow" class="danger">ขายเดี๋ยวนี้</button>
            </div>
            <div class="field"><label>ชื่อ NPC ขายของ</label><input type="text" id="__assist_sellnpc" placeholder="เช่น Tool Dealer"></div>
            <div class="field"><label>แมปที่ NPC อยู่</label><input type="text" id="__assist_sellmap" placeholder="เช่น izlude_in"></div>
            <div class="field"><label>พิกัดวาร์ป X</label><input type="number" id="__assist_sellx" placeholder="114"><label style="margin-left:8px">Y</label><input type="number" id="__assist_selly" placeholder="49"><button id="__assist_useselfpos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="field"><label>ขายทุก N นาที (0=off)</label><input type="number" id="__assist_sellinterval" min="0" max="999"></div>
            <div class="btns"><button id="__assist_applysell">ใช้ค่า sell</button><button id="__assist_t_sellfull" class="on">ขายตอนเต็ม</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เลือก item ที่จะขาย/ฝาก: กดปุ่มสีที่รายการของในสถิติ — วน เก็บ(เทา)→ขาย(ส้ม)→ฝาก(เขียว)→เก็บ</div>
          </div>
          <!-- 🏦 Storage -->
          <div class="__assist_subpage" data-sub="storage">
            <div class="btns">
              <button id="__assist_storagebtn" class="off">Storage: ?</button>
              <button id="__assist_depositnow" class="primary">ฝากเดี๋ยวนี้</button>
            </div>
            <div class="field"><label>ชื่อ NPC Kafra</label><input type="text" id="__assist_kafra" placeholder="เช่น Kafra Staff"></div>
            <div class="field"><label>แมปที่ Kafra อยู่</label><input type="text" id="__assist_kaframap" placeholder="เช่น izlude"></div>
            <div class="field"><label>พิกัดวาร์ป X</label><input type="number" id="__assist_kafrax" placeholder="0=ใช้ sell"><label style="margin-left:8px">Y</label><input type="number" id="__assist_kafray" placeholder="0=ใช้ sell"><button id="__assist_usekafrapos" style="margin-left:8px;font-size:10px">ใช้พิกัดตัวละคร</button></div>
            <div class="field"><label>เมนู choice (0=Save, 1=Storage, 2=Warp)</label><input type="number" id="__assist_kafrachoice" min="0" max="9" placeholder="1"></div>
            <div class="btns"><button id="__assist_applykafra">ใช้ค่า storage</button><button id="__assist_t_depfull" class="on">ฝากตอนเต็ม</button><button id="__assist_t_depaftersell" class="on">ฝากหลังขาย</button></div>
          </div>
          <!-- ⚙️ อื่นๆ -->
          <div class="__assist_subpage" data-sub="misc">
            <h4>🌐 Remote Monitor (ส่งข้อมูลไป relay server — ดูจากมือถือ/เครื่องอื่น)</h4>
            <div class="btns">
              <button id="__assist_relaybtn" class="off">Relay: ?</button>
              <button id="__assist_relayreconnect" class="primary">🔄 เชื่อมใหม่</button>
            </div>
            <div class="field"><label>URL relay server (wss:// = SSL, ws:// = ไม่มี SSL)</label><input type="text" id="__assist_relayurl" placeholder="wss://rayro.catgg.net"></div>
            <div class="btns"><button id="__assist_applyrelay">ใช้ค่า relay</button></div>
            <div class="btns"><button id="__assist_openremote" class="primary" style="display:none">🌐 เปิดดูข้อมูลที่เว็บ</button></div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เปิดแล้วสคริปต์จะส่งข้อมูลไป relay server ทุก 1 วินาที<br>★ ดูสถานะการเชื่อมต่อได้ที่แท็บ "📊 สถิติ" บรรทัด "🌐 Remote Monitor"<br>★ ตั้งค่า relay server ที่ <code>relay-server.js</code> ฝั่งเซิร์ฟเวอร์</div>
            <h4>🗺️ Navigation (บันทึกเส้นทางเดิน + waypoint graph)</h4>
            <div class="btns">
              <button id="__assist_navrecbtn" class="off">บันทึก: ?</button>
              <button id="__assist_navwanderbtn" class="on">เดินตาม nav</button>
            </div>
            <div class="field"><label>โหมดเดินตาม nav</label><select id="__assist_navmode"><option value="patrol">patrol (เดินตามลำดับ route ครบแล้วย้อนกลับ)</option><option value="graph">graph (wander สุ่มตามกราฟ)</option></select></div>
            <div class="field"><label>รัศมีรวมจุด (ช่อง) — จุดที่อยู่ใกล้กัน <= N ช่อง = รวม node เดียว</label><input type="number" id="__assist_navradius" min="1" max="20"></div>
            <div class="btns">
              <button id="__assist_applynav">ใช้ค่า nav</button>
              <button id="__assist_navexport">export</button>
              <button id="__assist_navimport">import</button>
              <button id="__assist_navclear" class="danger">ล้าง</button>
            </div>
            <div id="__assist_navstats" style="font-size:10px;color:#9aa0a6;margin-top:4px;line-height:1.6">(ยังไม่มีข้อมูล)</div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เปิด 'บันทึก' แล้วเดินเก็บข้อมูลในแมปที่ต้องการ ปิดเมื่อเสร็จ<br>★ wander จะใช้ waypoint graph แทนสุ่ม (ถ้ามีข้อมูลแมปนั้น)</div>
            <h4>📤 สำรอง / ย้ายเครื่อง</h4>
            <div class="btns">
              <button id="__assist_exportall">📤 export ทั้งหมด</button>
              <button id="__assist_importall">📥 import</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ export รวม config + buff/skill times + nav data<br>★ import = ทับค่าปัจจุบัน</div>
          </div>
          <!-- 📨 Telegram -->
          <div class="__assist_subpage" data-sub="telegram">
            <h4>📨 Telegram Alerts</h4>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;margin-bottom:8px;line-height:1.6;">
              ★ แจ้งเตือน Log สำคัญ (การ์ด/ตาย/หนีมอน) ไป Telegram<br>
              ★ สร้าง Bot Token: คุย <code>@BotFather</code> → /newbot<br>
              ★ หา Chat ID: คุย <code>@userinfobot</code><br>
              ★ บอทต้องเชื่อม relay server ก่อน (ดูสถานะที่แท็บ สถิติ)
            </div>
            <div class="field"><label>Bot Token (จาก @BotFather)</label><input type="text" id="__assist_tg_token" placeholder="เช่น 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" autocomplete="off"></div>
            <div class="field"><label>Chat ID (จาก @userinfobot)</label><input type="text" id="__assist_tg_chatid" placeholder="เช่น 123456789" autocomplete="off"></div>
            <div class="btns">
              <button id="__assist_tg_save" class="primary">💾 บันทึก</button>
              <button id="__assist_tg_test">📨 ทดสอบ</button>
              <button id="__assist_tg_clear" class="danger">🗑 ล้าง</button>
            </div>
            <div id="__assist_tg_status" style="font-size:10px;color:#9aa0a6;margin-top:6px;line-height:1.6">(ยังไม่ได้ตั้งค่า)</div>
            <h4>🔔 ประเภทการแจ้งเตือน</h4>
            <div class="btns">
              <button id="__assist_t_tgcard" class="on">🃏 การ์ด</button>
              <button id="__assist_t_tgflee" class="on">🚨 หนี/ตาย</button>
              <button id="__assist_t_tgbot" class="on">💬 พูดถึง bot</button>
            </div>
            <div class="btns">
              <button id="__assist_t_tgnearby" class="off">💬 แชทใกล้</button>
              <button id="__assist_t_tgwhisper" class="on">💭 กระซิบ</button>
            </div>
            <div style="font-size:10px;color:#9aa0a6;margin-top:4px;">★ เปิด/ปิดการส่งแต่ละประเภทไป Telegram</div>
          </div>
        </div>
        <div class="__assist_page" data-page="alert">
          <div class="logbox" id="__assist_alertbox"></div>
          <div class="btns"><button class="danger" id="__assist_clearalert">ล้าง log สำคัญ</button></div>
        </div>
        <div class="__assist_page" data-page="log">
          <div class="logbox" id="__assist_logbox"></div>
          <div class="btns"><button id="__assist_copylog">📋 คัดลอก log</button><button id="__assist_clearlog">ล้าง log</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // ★★ track "กำลังแก้ input" ด้วย focusin/focusout (แทน document.activeElement)
    //   Unity เรียก canvas.focus() ทุกเฟรม → activeElement เปลี่ยนเป็น canvas ตลอด
    //   → syncInput ที่เช็ค activeElement จะเขียนทับค่าที่กำลังพิมพ์อยู่
    //   แก้: track ด้วย focusin/focusout (จับก่อน Unity แย่ง focus)
    //   ★ editingInputs + isEditing ประกาศที่ module-level (ใช้ได้ทั้ง buildUI + renderUI)
    root.addEventListener('focusin', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) editingInputs.add(e.target);
    });
    root.addEventListener('focusout', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea')) {
        // ★ delay 100ms ก่อนล้าง — กัน Unity แย่ง focus ชั่วขณะ แล้ว browser คืน focus กลับ
        setTimeout(() => { try { editingInputs.delete(e.target); } catch (_) {} }, 100);
      }
    });

    // ---------- wire events ----------
    // ★★ Unity WebGL (Emscripten) ดัก keyboard ที่ window ใน capture phase เหมือนกัน
    //   + เรียก preventDefault ทำให้ input ไม่รับ key → พิมพ์ไม่ติด
    //   วิธีแก้: intercept keydown ใน capture phase (ดักก่อน Unity) ถ้ามี input ของเรา active
    //   → หยุด propagation + จัดการ input เอง (แทรก/ลบตัวอักษรตรงๆ)
    const ASSIST_INPUT_SEL = 'input, select, textarea';
    // ★ รองรับทั้ง main panel (root) และ item-list popup (append ที่ body แยก)
    function isOurField(t) {
      if (!t || !t.closest || !t.matches || !t.matches(ASSIST_INPUT_SEL)) return false;
      return root.contains(t)
        || (t.closest && t.closest('#__assist_itempopup'))
        || (t.closest && t.closest('#__assist_skillpopup'))
        || (t.closest && t.closest('#__assist_feedback_modal'))
        || (t.closest && t.closest('#__assist_chatroom_modal'));
    }
    function ourActiveInput() {
      const ae = document.activeElement;
      return (ae && isOurField(ae)) ? ae : null;
    }
    // ดัก keyboard events ใน capture phase — ถ้ามี input ของเรา active ให้หยุดทุกอย่าง + จัดการเอง
    window.addEventListener('keydown', (e) => {
      const inp = ourActiveInput();
      if (!inp) return;
      // หยุด Unity รับ key นี้
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.preventDefault();
      // จัดการ input เอง (Unity กลืน key หมด แม้ input focus)
      handleInputKey(inp, e);
    }, true);
    // ดัก paste ด้วย
    window.addEventListener('paste', (e) => {
      const inp = ourActiveInput();
      if (!inp) return;
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const s = inp.selectionStart, en = inp.selectionEnd;
      inp.value = inp.value.slice(0, s) + text + inp.value.slice(en);
      const pos = s + text.length;
      inp.selectionStart = inp.selectionEnd = pos;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
    // จัดการ key ให้ input เอง (เพราะ Unity กลืน keydown)
    function handleInputKey(inp, e) {
      const k = e.key;
      const s = inp.selectionStart, en = inp.selectionEnd;
      // ★ Escape → ปิด modal (feedback หรือ chatroom)
      if (k === 'Escape') {
        const modal = inp.closest && (inp.closest('#__assist_feedback_modal') || inp.closest('#__assist_chatroom_modal'));
        if (modal) { modal.remove(); return; }
      }
      if (k === 'Backspace') {
        if (s === en && s > 0) { inp.value = inp.value.slice(0, s - 1) + inp.value.slice(en); inp.selectionStart = inp.selectionEnd = s - 1; }
        else if (s !== en) { inp.value = inp.value.slice(0, s) + inp.value.slice(en); inp.selectionStart = inp.selectionEnd = s; }
      } else if (k === 'Delete') {
        if (s === en && s < inp.value.length) { inp.value = inp.value.slice(0, s) + inp.value.slice(en + 1); inp.selectionStart = inp.selectionEnd = s; }
        else if (s !== en) { inp.value = inp.value.slice(0, s) + inp.value.slice(en); inp.selectionStart = inp.selectionEnd = s; }
      } else if (k === 'ArrowLeft') { inp.selectionStart = inp.selectionEnd = Math.max(0, s - 1); }
      else if (k === 'ArrowRight') { inp.selectionStart = inp.selectionEnd = Math.min(inp.value.length, s + 1); }
      else if (k === 'Home') { inp.selectionStart = inp.selectionEnd = 0; }
      else if (k === 'End') { inp.selectionStart = inp.selectionEnd = inp.value.length; }
      else if (k === 'Enter') {
        // ★ textarea: Enter = ขึ้นบรรทัด, Ctrl+Enter = ส่ง (feedback/chatroom modal)
        //   input (1 บรรทัด): Enter = blur หรือ Ctrl+Enter = ส่ง (chatroom)
        if (inp.tagName === 'TEXTAREA') {
          if (e.ctrlKey || e.metaKey) {
            const modal = inp.closest('#__assist_feedback_modal') || inp.closest('#__assist_chatroom_modal');
            if (modal) { const b = modal.querySelector('button[data-send]'); if (b) b.click(); }
            return;
          }
          inp.value = inp.value.slice(0, s) + '\n' + inp.value.slice(en);
          inp.selectionStart = inp.selectionEnd = s + 1;
        } else {
          // ★ input 1 บรรทัด: Ctrl+Enter = ส่ง (chatroom), Enter = ส่ง (chatroom) หรือ blur
          if (inp.closest('#__assist_chatroom_modal')) {
            const modal = inp.closest('#__assist_chatroom_modal');
            if (e.ctrlKey || e.metaKey || inp.id === '__assist_chatroom_msg') {
              const b = modal.querySelector('button[data-send]'); if (b) b.click();
              return;
            }
          }
          inp.blur();
        }
      }
      else if (k.length === 1) {   // ตัวอักษร 1 ตัว (รวมตัวเลข ภาษาอังกฤษ)
        inp.value = inp.value.slice(0, s) + k + inp.value.slice(en);
        inp.selectionStart = inp.selectionEnd = s + 1;
      }
      // อื่นๆ (Shift/Ctrl/Alt/Tab ฯลฯ) ไม่ต้องทำอะไร
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // ★ คลิก input → focus ทันที (กัน Unity ขโมย)
    root.addEventListener('mousedown', (e) => {
      if (isOurField(e.target)) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        setTimeout(() => { try { e.target.focus(); e.target.select && e.target.select(); } catch (_) {} }, 0);
      }
    }, true);

    const bar = root.querySelector('#__assist_bar');
    const popup = root.querySelector('#__assist_popup');
    bar.addEventListener('click', (e) => {
      // กดที่ pill loot/heal ใน mini-bar = toggle ทันที (ไม่เปิด popup)
      const pill = e.target.closest('.pill');
      if (pill) {
        if (pill.hasAttribute('data-loot')) CFG.lootEnabled ? ASSIST.lootOff() : ASSIST.lootOn();
        if (pill.hasAttribute('data-heal')) CFG.healEnabled ? ASSIST.healOff() : ASSIST.healOn();
        if (pill.hasAttribute('data-rest')) CFG.restEnabled ? ASSIST.restOff() : ASSIST.restOn();
        if (pill.hasAttribute('data-combat')) {
          if (!CFG.combatEnabled && !confirm('เปิด Auto-Combat?\n\nส่ง packet โจมตีจริง — ตั้ง whitelist ก่อน (เช่น ASSIST.setTargetWhitelist("Poring"))\nใช้ในความรับผิดชอบของคุณ')) return;
          CFG.combatEnabled ? ASSIST.combatOff() : ASSIST.combatOn();
        }
        if (pill.hasAttribute('data-skill')) CFG.skillEnabled ? ASSIST.skillOff() : ASSIST.skillOn();
        if (pill.hasAttribute('data-buff')) CFG.buffEnabled ? ASSIST.buffOff() : ASSIST.buffOn();
        if (pill.hasAttribute('data-sell')) CFG.sellEnabled ? ASSIST.sellOff() : ASSIST.sellOn();
        if (pill.hasAttribute('data-storage')) CFG.storageEnabled ? ASSIST.storageOff() : ASSIST.storageOn();
        if (pill.hasAttribute('data-teleport')) {
          if (sendRandomWarp()) log('🌀 วาร์ปสุ่ม (กดจาก mini-bar)');
        }
        if (pill.hasAttribute('data-monitor')) { openMonitor(); }
        if (pill.hasAttribute('data-remote')) { openRemoteMonitor(); }
        if (pill.hasAttribute('data-feedback')) { openFeedbackModal(); }
        if (pill.hasAttribute('data-chatroom')) { openChatRoomModal(); }
        return;
      }
      popup.classList.toggle('open');
    });

    // tab switching
    root.querySelectorAll('#__assist_tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const page = tab.getAttribute('data-page');
        root.querySelectorAll('#__assist_tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
        root.querySelectorAll('.__assist_page').forEach(p => p.classList.toggle('active', p.getAttribute('data-page') === page));
      });
    });
    // ★ sub-tab switching (ใน config page)
    root.querySelectorAll('.__assist_subtabs .subtab').forEach(sub => {
      sub.addEventListener('click', () => {
        const s = sub.getAttribute('data-sub');
        root.querySelectorAll('.__assist_subtabs .subtab').forEach(t => t.classList.toggle('active', t === sub));
        root.querySelectorAll('.__assist_subpage').forEach(p => p.classList.toggle('active', p.getAttribute('data-sub') === s));
      });
    });

    // config tab buttons
    root.querySelector('#__assist_lootbtn').addEventListener('click', () => CFG.lootEnabled ? ASSIST.lootOff() : ASSIST.lootOn());
    root.querySelector('#__assist_healbtn').addEventListener('click', () => CFG.healEnabled ? ASSIST.healOff() : ASSIST.healOn());
    root.querySelector('#__assist_warpbtn').addEventListener('click', () => {
      if (!CFG.warpLootEnabled && !confirm('เปิด Warp-to-Loot?\n\nส่ง packet วาร์ปจริง — เก็บไม่ได้ครบ ' + CFG.maxAttempts + ' ครั้งจะวาร์ปไปที่ไอเท็ม\nใช้ในความรับผิดชอบของคุณ')) return;
      CFG.warpLootEnabled ? ASSIST.warpLootOff() : ASSIST.warpLootOn();
    });

    root.querySelector('#__assist_applyheal').addEventListener('click', () => {
      const pct = parseInt(root.querySelector('#__assist_healat').value, 10);
      if (!isNaN(pct)) ASSIST.setHealAt(pct);
      const ids = root.querySelector('#__assist_healitems').value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length) ASSIST.setHealItems(...ids);
    });
    root.querySelector('#__assist_healmode').addEventListener('change', e => ASSIST.setHealMode(e.target.value));
    // ---- buff wires ----
    root.querySelector('#__assist_buffbtn').addEventListener('click', () => CFG.buffEnabled ? ASSIST.buffOff() : ASSIST.buffOn());
    root.querySelector('#__assist_buffnow').addEventListener('click', () => ASSIST.buffNow());
    root.querySelector('#__assist_applybuff').addEventListener('click', () => {
      const raw = root.querySelector('#__assist_buffitems').value;
      const items = raw.split('\n').map(line => {
        const parts = line.split(',').map(s => s.trim());
        const itemId = parseInt(parts[0], 10);
        const intervalMin = parseFloat(parts[1]);
        return (!isNaN(itemId) && !isNaN(intervalMin) && intervalMin > 0) ? { itemId, intervalMin } : null;
      }).filter(x => x);
      ASSIST.setBuffItems(items);
    });
    root.querySelector('#__assist_clearbufftimes').addEventListener('click', () => ASSIST.clearBuffTimes());
    // ---- skill wires ----
    root.querySelector('#__assist_skillbtn').addEventListener('click', () => CFG.skillEnabled ? ASSIST.skillOff() : ASSIST.skillOn());
    root.querySelector('#__assist_skillnow').addEventListener('click', () => ASSIST.skillNow());
    root.querySelector('#__assist_manageskill').addEventListener('click', () => openSkillPopup());
    root.querySelector('#__assist_lootmode').addEventListener('change', e => ASSIST.setLootMode(e.target.value));
    root.querySelector('#__assist_manageonly').addEventListener('click', () => openItemListPopup('only'));
    root.querySelector('#__assist_manageexcept').addEventListener('click', () => openItemListPopup('except'));
    root.querySelector('#__assist_applylootdelay').addEventListener('click', () => {
      const ms = parseInt(root.querySelector('#__assist_lootdelay').value, 10);
      if (!isNaN(ms)) ASSIST.setLootDelay(ms);
      const th = parseInt(root.querySelector('#__assist_lootthrottle').value, 10);
      if (!isNaN(th) && th >= 100) { CFG.sendThrottleMs = th; log('📦 ดีเลย์ระหว่างเก็บ =', th, 'ms'); }
      const rk = parseInt(root.querySelector('#__assist_pickradiuskill').value, 10);
      if (!isNaN(rk)) { CFG.pickRadiusKill = rk; log('📦 ระยะเช็คพิกัดมอน =', rk, 'ช่อง'); }
    });
    root.querySelector('#__assist_t_lootkillpos').addEventListener('click', () => {
      CFG.lootUseKillPos = !CFG.lootUseKillPos;
      log('📦 เช็คพิกัดมอนที่ฆ่า =', CFG.lootUseKillPos);
    });

    // ---- combat wires ----
    const parseList = (sel) => root.querySelector(sel).value.split(',').map(s => {
      const t = s.trim(); if (!t) return null;
      const n = parseInt(t, 10); return isNaN(n) ? t : n;     // ตัวเลข → number, อื่น → ชื่อ
    }).filter(x => x !== null);
    root.querySelector('#__assist_combatbtn').addEventListener('click', () => {
      if (!CFG.combatEnabled && !confirm('เปิด Auto-Combat?\n\nส่ง packet โจมตีจริง — ตั้ง whitelist ก่อน\nใช้ในความรับผิดชอบของคุณ')) return;
      CFG.combatEnabled ? ASSIST.combatOff() : ASSIST.combatOn();
    });
    root.querySelector('#__assist_applywhitelist').addEventListener('click', () => ASSIST.setTargetWhitelist(...parseList('#__assist_whitelist')));
    root.querySelector('#__assist_applyblacklist').addEventListener('click', () => ASSIST.setTargetBlacklist(...parseList('#__assist_blacklist')));
    root.querySelector('#__assist_applycombat').addEventListener('click', () => {
      const r = parseInt(root.querySelector('#__assist_attackrange').value, 10);
      if (!isNaN(r)) { if (r > 2) ASSIST.setRanged(r); else ASSIST.setAttackRange(r || 2); }
      const sw = parseInt(root.querySelector('#__assist_stuckwarp').value, 10);
      if (!isNaN(sw)) { CFG.stuckWarpOnAbandon = sw; log('⚔️ stuck abandon → วาร์ปสุ่ม =', sw === 0 ? 'ปิด' : sw + 'ครั้ง'); }
    });
    root.querySelector('#__assist_t_warptoboss').addEventListener('click', () => { CFG.warpToBoss = !CFG.warpToBoss; saveConfigDebounced(); log('👑 วาร์ปไปสู้ Boss:', CFG.warpToBoss ? 'เปิด' : 'ปิด'); });
    root.querySelector('#__assist_t_warptominiboss').addEventListener('click', () => { CFG.warpToMiniBoss = !CFG.warpToMiniBoss; saveConfigDebounced(); log('👹 วาร์ปไปสู้ Mini Boss:', CFG.warpToMiniBoss ? 'เปิด' : 'ปิด'); });
    // ---- flee wires (แยกจาก combat) ----
    root.querySelector('#__assist_applyflee').addEventListener('click', () => {
      const fm = parseInt(root.querySelector('#__assist_fleemob').value, 10);
      const fa = parseInt(root.querySelector('#__assist_fleeaggro').value, 10);
      const fp = parseInt(root.querySelector('#__assist_fleeprox').value, 10);
      if (!isNaN(fm)) ASSIST.setFleeMob(fm);
      if (!isNaN(fa)) ASSIST.setFleeAggro(fa);
      if (!isNaN(fp)) ASSIST.setFleeProximity(fp);
      const fmList = root.querySelector('#__assist_fleemonsters').value.trim();
      if (fmList !== '') CFG.fleeMonsters = fmList.split(',').map(s => s.trim()).filter(Boolean);
      const fmr = parseInt(root.querySelector('#__assist_fleemonsterradius').value, 10);
      if (!isNaN(fmr)) CFG.fleeMonsterRadius = fmr;
    });
    // ---- rest wires ----
    root.querySelector('#__assist_restbtn').addEventListener('click', () => CFG.restEnabled ? ASSIST.restOff() : ASSIST.restOn());
    root.querySelector('#__assist_respawnbtn').addEventListener('click', () => { CFG.autoRespawnEnabled = !CFG.autoRespawnEnabled; saveConfigDebounced(); log('💀 Auto-Respawn:', CFG.autoRespawnEnabled ? 'เปิด' : 'ปิด'); });
    root.querySelector('#__assist_applyrest').addEventListener('click', () => {
      const hp = parseInt(root.querySelector('#__assist_resthp').value, 10);
      const until = parseInt(root.querySelector('#__assist_restuntil').value, 10);
      const sec = parseInt(root.querySelector('#__assist_restmaxsec').value, 10);
      if (!isNaN(hp)) ASSIST.setRestHp(hp);
      if (!isNaN(until)) ASSIST.setRestUntil(until);
      if (!isNaN(sec)) ASSIST.setRestMaxSec(sec);
    });
    // ---- sell wires ----
    root.querySelector('#__assist_sellbtn').addEventListener('click', () => CFG.sellEnabled ? ASSIST.sellOff() : ASSIST.sellOn());
    root.querySelector('#__assist_sellnow').addEventListener('click', () => ASSIST.sellNow());
    root.querySelector('#__assist_applysell').addEventListener('click', () => {
      const npcName = root.querySelector('#__assist_sellnpc').value.trim();
      const npcMap = root.querySelector('#__assist_sellmap').value.trim();
      const interval = parseInt(root.querySelector('#__assist_sellinterval').value, 10);
      const sx = parseInt(root.querySelector('#__assist_sellx').value, 10);
      const sy = parseInt(root.querySelector('#__assist_selly').value, 10);
      if (npcName) ASSIST.setSellNpc(npcName, npcMap);
      if (!isNaN(sx) && !isNaN(sy)) ASSIST.setSellNpcPos(sx, sy);
      if (!isNaN(interval)) ASSIST.setSellInterval(interval);
    });
    root.querySelector('#__assist_useselfpos').addEventListener('click', () => { ASSIST.useCurrentPosAsSellWarp(); });
    root.querySelector('#__assist_t_sellfull').addEventListener('click', () => { CFG.sellOnFull = !CFG.sellOnFull; ASSIST.toggleSellOnFull(CFG.sellOnFull); });
    // ---- storage wires ----
    root.querySelector('#__assist_storagebtn').addEventListener('click', () => CFG.storageEnabled ? ASSIST.storageOff() : ASSIST.storageOn());
    root.querySelector('#__assist_depositnow').addEventListener('click', () => ASSIST.depositNow());
    root.querySelector('#__assist_applykafra').addEventListener('click', () => {
      const kn = root.querySelector('#__assist_kafra').value.trim();
      const km = root.querySelector('#__assist_kaframap').value.trim();
      const kx = parseInt(root.querySelector('#__assist_kafrax').value, 10);
      const ky = parseInt(root.querySelector('#__assist_kafray').value, 10);
      const kc = parseInt(root.querySelector('#__assist_kafrachoice').value, 10);
      if (kn) ASSIST.setKafra(kn, km);
      if (!isNaN(kx) && !isNaN(ky)) ASSIST.setKafraPos(kx, ky);
      if (!isNaN(kc)) CFG.kafraChoice = kc;
    });
    root.querySelector('#__assist_usekafrapos').addEventListener('click', () => { ASSIST.useCurrentPosAsKafra(); });
    root.querySelector('#__assist_t_depfull').addEventListener('click', () => { CFG.depositOnFull = !CFG.depositOnFull; ASSIST.toggleDepositOnFull(CFG.depositOnFull); });
    root.querySelector('#__assist_t_depaftersell').addEventListener('click', () => { CFG.depositAfterSell = !CFG.depositAfterSell; ASSIST.toggleDepositAfterSell(CFG.depositAfterSell); });
    // ---- relay/remote monitor wires ----
    root.querySelector('#__assist_relaybtn').addEventListener('click', () => {
      CFG.monitorServerEnabled = !CFG.monitorServerEnabled;
      saveConfigDebounced();
      log('🌐 Remote Monitor:', CFG.monitorServerEnabled ? 'เปิด' : 'ปิด');
      if (CFG.monitorServerEnabled) {
        connectRelay();             // พยายามเชื่อมทันที
        relayRegisterPlayer();      // ส่ง register ทันทีถ้ามี playerId แล้ว
      } else {
        // ปิด → ตัดการเชื่อมต่อปัจจุบัน
        if (relayWs) { try { relayWs.close(); } catch (_) {} relayWs = null; }
        setRelayStatus('disabled', 'ปิด');
      }
    });
    root.querySelector('#__assist_relayreconnect').addEventListener('click', () => {
      log('🔄 บังคับเชื่อม relay ใหม่');
      if (relayWs) { try { relayWs.close(); } catch (_) {} relayWs = null; }
      relayReconnectAt = 0;          // reset cooldown
      relayConnectedAt = 0;
      if (CFG.monitorServerEnabled) { connectRelay(); relayRegisterPlayer(); }
    });
    root.querySelector('#__assist_applyrelay').addEventListener('click', () => {
      const url = root.querySelector('#__assist_relayurl').value.trim();
      if (url) {
        const prevUrl = CFG.monitorServerUrl;
        CFG.monitorServerUrl = url;
        saveConfigDebounced();
        log('🌐 relay URL =', url);
        // ถ้า URL เปลี่ยน → ตัดขาวเชื่อมใหม่
        if (url !== prevUrl && relayWs) { try { relayWs.close(); } catch (_) {} relayWs = null; relayReconnectAt = 0; relayConnectedAt = 0; }
        if (CFG.monitorServerEnabled) { connectRelay(); relayRegisterPlayer(); }
      }
    });
    root.querySelector('#__assist_openremote').addEventListener('click', () => openRemoteMonitor());
    // ---- telegram wires ----
    root.querySelector('#__assist_tg_save').addEventListener('click', () => {
      const token = root.querySelector('#__assist_tg_token').value.trim();
      const chatId = root.querySelector('#__assist_tg_chatid').value.trim();
      if (!token || !chatId) { updateTelegramStatus('❌ กรุณากรอก Bot Token + Chat ID ให้ครบ', '#e74c3c'); return; }
      // ★ บันทึกลงเครื่อง (localStorage) — persist ข้าม session
      CFG.telegramBotToken = token;
      CFG.telegramChatId = chatId;
      saveConfigDebounced();
      if (playerName == null) { updateTelegramStatus('⚠️ บันทึกในเครื่องแล้ว — จะส่งไป relay เมื่อเข้าเกม + เชื่อม relay', '#f39c12'); return; }
      if (!relayWs || relayWs.readyState !== 1) { updateTelegramStatus('⚠️ บันทึกในเครื่องแล้ว — จะส่งไป relay เมื่อเชื่อมต่อ', '#f39c12'); return; }
      updateTelegramStatus('⏳ กำลังบันทึก...', '#f39c12');
      if (sendSetTelegram(token, chatId)) log('📨 บันทึก Telegram config...');
    });
    root.querySelector('#__assist_tg_test').addEventListener('click', () => {
      if (!relayWs || relayWs.readyState !== 1) { updateTelegramStatus('❌ ยังไม่ได้เชื่อม relay server', '#e74c3c'); return; }
      updateTelegramStatus('⏳ กำลังส่งทดสอบ...', '#f39c12');
      sendRelayAlert('📨 ทดสอบแจ้งเตือนจาก RO Assist — หากคุณเห็นข้อความนี้ = ใช้งานได้แล้ว!');
      log('📨 ส่งข้อความทดสอบไป Telegram');
    });
    root.querySelector('#__assist_tg_clear').addEventListener('click', () => {
      if (sendClearTelegram()) {
        root.querySelector('#__assist_tg_token').value = '';
        root.querySelector('#__assist_tg_chatid').value = '';
        updateTelegramStatus('🗑 ล้างการตั้งค่าแล้ว', '#9aa0a6');
        log('📨 ล้าง Telegram config');
      }
    });
    // ---- telegram alert toggle wires ----
    const tgToggles = [
      ['#__assist_t_tgcard', 'telegramAlertCard', '🃏 การ์ด'],
      ['#__assist_t_tgflee', 'telegramAlertFlee', '🚨 หนี/ตาย'],
      ['#__assist_t_tgbot', 'telegramAlertBotMention', '💬 พูดถึง bot'],
      ['#__assist_t_tgnearby', 'telegramAlertNearby', '💬 แชทใกล้'],
      ['#__assist_t_tgwhisper', 'telegramAlertWhisper', '💭 กระซิบ'],
    ];
    tgToggles.forEach(([sel, key, label]) => {
      const btn = root.querySelector(sel);
      if (btn) btn.addEventListener('click', () => {
        CFG[key] = !CFG[key]; saveConfigDebounced();
        log('📨 Telegram alert', label, CFG[key] ? 'เปิด' : 'ปิด');
      });
    });
    // ---- nav wires ----
    root.querySelector('#__assist_navrecbtn').addEventListener('click', () => CFG.navRecording ? ASSIST.navRecordOff() : ASSIST.navRecordOn());
    root.querySelector('#__assist_navwanderbtn').addEventListener('click', () => { CFG.navWanderUseNav = !CFG.navWanderUseNav; ASSIST.navToggleWander(CFG.navWanderUseNav); });
    root.querySelector('#__assist_navmode').addEventListener('change', e => { CFG.navWanderMode = e.target.value; navPatrolReset(); log('🗺️ nav mode =', CFG.navWanderMode); });
    root.querySelector('#__assist_applynav').addEventListener('click', () => {
      const r = parseInt(root.querySelector('#__assist_navradius').value, 10);
      if (!isNaN(r)) ASSIST.navSetMergeRadius(r);
    });
    root.querySelector('#__assist_navexport').addEventListener('click', () => ASSIST.navExport());
    root.querySelector('#__assist_navimport').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const file = inp.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => ASSIST.navImport(reader.result);
        reader.readAsText(file);
      };
      inp.click();
    });
    root.querySelector('#__assist_navclear').addEventListener('click', () => {
      if (confirm('ล้างข้อมูล nav ทั้งหมด? (ทุกแมป)')) ASSIST.navClearAll();
    });
    // ---- farm map wires ----
    root.querySelector('#__assist_warptofarm').addEventListener('click', () => ASSIST.warpToFarm());
    root.querySelector('#__assist_t_warpback').addEventListener('click', () => { CFG.warpBackToFarm = !CFG.warpBackToFarm; ASSIST.toggleWarpBack(CFG.warpBackToFarm); });
    root.querySelector('#__assist_usefarmpos').addEventListener('click', () => { ASSIST.useCurrentPosAsFarm(); });
    root.querySelector('#__assist_applyfarm').addEventListener('click', () => {
      const fm = root.querySelector('#__assist_farmmap').value.trim();
      const fx = parseInt(root.querySelector('#__assist_farmx').value, 10);
      const fy = parseInt(root.querySelector('#__assist_farmy').value, 10);
      ASSIST.setFarmMap(fm, !isNaN(fx) ? fx : -999, !isNaN(fy) ? fy : -999);
    });
    const tBtn = (sel, fn, cfgKey) => root.querySelector(sel).addEventListener('click', () => { CFG[cfgKey] = !CFG[cfgKey]; fn(CFG[cfgKey]); });
    tBtn('#__assist_t_antiks', (v) => ASSIST.toggleAntiKS(v), 'antiKS');
    tBtn('#__assist_t_avoidp', (v) => ASSIST.toggleAvoidPlayers(v), 'avoidOtherPlayers');
    tBtn('#__assist_t_lowhp', (v) => ASSIST.toggleLowestHpFirst(v), 'targetLowestHpFirst');
    tBtn('#__assist_t_wander', (v) => ASSIST.toggleWander(v), 'wanderEnabled');
    tBtn('#__assist_t_warpfind', (v) => ASSIST.toggleWarpFind(v), 'warpFindEnabled');
    tBtn('#__assist_t_warptomon', (v) => ASSIST.toggleWarpToMonster(v), 'warpToMonster');

    root.querySelector('#__assist_resetstats').addEventListener('click', () => ASSIST.resetStats());
    root.querySelector('#__assist_sellnow2').addEventListener('click', () => ASSIST.sellNow());
    root.querySelector('#__assist_clearinv').addEventListener('click', () => {
      inventory.clear(); equipmentSlots.clear();
      log('🎒 ล้างรายการของที่เก็บได้แล้ว');
    });
    root.querySelector('#__assist_exportall').addEventListener('click', () => ASSIST.exportAll());
    root.querySelector('#__assist_importall').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const file = inp.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => ASSIST.importAll(reader.result);
        reader.readAsText(file);
      };
      inp.click();
    });
    root.querySelector('#__assist_clearlog').addEventListener('click', () => ASSIST.clearLogs());
    // ★ คัดลอก log — ใช้ navigator.clipboard ถ้าได้ ไม่งั้นใช้ textarea fallback
    root.querySelector('#__assist_copylog').addEventListener('click', (e) => {
      // ★ stopPropagation — กัน Unity ตอบสนองต่อ click นี้
      e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const logs = ASSIST.getLogs();
      if (!logs.length) { log('⚠️ ไม่มี log ให้คัดลอก'); return; }
      const text = logs.map(l => {
        const d = new Date(l.t);
        const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
        return `[${ts}] ${l.msg}`;
      }).join('\n');
      // ★ ใช้ execCommand('copy') แบบ synchronous — ทำทันทีใน click handler
      //   navigator.clipboard.writeText() เป็น async → Unity ขโมย focus ระหว่างรอ → ล้มเงียบ
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;font-size:1px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      if (ok) log('📋 คัดลอก log แล้ว (' + logs.length + ' บรรทัด) — ไปวางได้เลย');
      else log('❌ คัดลอกไม่สำเร็จ — คลิกที่ logbox + Ctrl+A แล้ว Ctrl+C เอง');
    });
    root.querySelector('#__assist_clearalert')?.addEventListener('click', () => ASSIST.clearImportantLogs());
    const updBtn = root.querySelector('#__assist_updatebtn');
    if (updBtn) updBtn.addEventListener('click', () => { if (confirm('อัปเดตเป็นเวอร์ชั่นล่าสุด?\n(หลังอัปเดตต้อง reconnect เกม ปิด-เปิดหน้า)')) ASSIST.update(); });

    log('🖥️ แสดง panel แล้ว (คลิกที่แถบมุมขวาบนเพื่อเปิด)');
  }

  // ★ MONITOR_HTML — HTML สำหรับ popup window (embed ในสคริปต์ → ไม่ต้องเปิดไฟล์แยก)
  const MONITOR_HTML = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RO Monitor</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0d1117;color:#e8e8e8;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}.c{max-width:480px;margin:0 auto;padding:12px}.s{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#15171c;border-radius:8px;margin-bottom:10px}.d{width:8px;height:8px;border-radius:50%}.d.on{background:#27ae60;box-shadow:0 0 6px #27ae60}.d.off{background:#e74c3c}.card{background:#15171c;border:1px solid #2a2d35;border-radius:8px;padding:10px;margin-bottom:8px}.card h3{color:#8ab4f8;font-size:11px;text-transform:uppercase;margin-bottom:6px}.g{display:grid;grid-template-columns:1fr 1fr;gap:6px}.st{display:flex;justify-content:space-between;padding:3px 6px;background:#0d1117;border-radius:4px}.st .k{color:#9aa0a6;font-size:11px}.st .v{font-weight:600;font-size:12px}.hb{background:#2a2d35;height:16px;border-radius:8px;overflow:hidden;position:relative;margin-bottom:3px}.hf{height:100%;transition:width .3s;border-radius:8px}.hf.hp{background:linear-gradient(90deg,#e53935,#ef5350)}.hf.sp{background:linear-gradient(90deg,#1976d2,#42a5f5)}.ht{position:absolute;top:0;left:0;right:0;text-align:center;line-height:16px;font-size:10px;color:#fff;font-weight:600;text-shadow:0 0 3px rgba(0,0,0,.8)}.tg{display:flex;flex-wrap:wrap;gap:3px}.tg span{font-size:10px;padding:2px 6px;border-radius:6px;font-weight:600}.on{background:#1b5e20;color:#a5d6a7}.off{background:#4a2020;color:#ef9a9a}.cd{display:flex;justify-content:space-between;padding:2px 6px;font-size:11px;border-radius:3px;background:#0d1117;margin-bottom:2px}.cd.r{color:#27ae60}.cd.w{color:#f39c12}.disc{text-align:center;padding:40px;color:#5f6368}</style></head>
<body><div class="c">
<div class="s"><div class="d off" id="dot"></div><span id="st">รอข้อมูล...</span><span style="margin-left:auto;color:#5f6368;font-size:11px" id="ver"></span></div>
<div id="dash" style="display:none">
<div class="card"><h3>HP / SP</h3><div class="hb"><div class="hf hp" id="hpf" style="width:0"></div><div class="ht" id="hpt">?</div></div><div class="hb"><div class="hf sp" id="spf" style="width:0"></div><div class="ht" id="spt">?</div></div></div>
<div class="card"><h3>ตำแหน่ง</h3><div class="g"><div class="st"><span class="k">พิกัด</span><span class="v" id="pos">?</span></div><div class="st"><span class="k">แมป</span><span class="v" id="map">?</span></div><div class="st"><span class="k">ฟาร์ม</span><span class="v" id="fm">-</span></div><div class="st"><span class="k">สถานะ</span><span class="v" id="state">?</span></div></div></div>
<div class="card"><h3>Combat</h3><div class="g"><div class="st"><span class="k">เป้า</span><span class="v" id="tgt">-</span></div><div class="st"><span class="k">รุม</span><span class="v" id="mob">0</span></div><div class="st"><span class="k">DPS</span><span class="v" id="dps" style="color:#e67e22">0</span></div><div class="st"><span class="k">ASPD</span><span class="v" id="aspd" style="color:#3498db">0</span></div></div></div>
<div class="card"><h3>สถิติ</h3><div class="g"><div class="st"><span class="k">ฆ่า</span><span class="v" id="kills">0</span></div><div class="st"><span class="k">เก็บ</span><span class="v" id="loot">0</span></div><div class="st"><span class="k">EXP/นาที</span><span class="v" id="expmin">0</span></div><div class="st"><span class="k">Zeny/ชม</span><span class="v" id="gr" style="color:#f1c40f">0</span></div><div class="st"><span class="k">เวลา</span><span class="v" id="el">0s</span></div><div class="st"><span class="k">ตาย</span><span class="v" id="dth">0</span></div></div></div>
<div class="card"><h3>ระบบ</h3><div class="tg" id="tg"></div></div>
<div class="card" id="cdcard" style="display:none"><h3>Buff / Skill</h3><div id="cds"></div></div>
</div>
<div id="disc" class="disc"><p style="font-size:36px">🔌</p><p style="margin-top:8px">ยังไม่ได้รับข้อมูล</p></div>
</div>
<script>
function fmt(ms){const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m '+(s%60)+'s';const h=Math.floor(m/60);return h+'h '+(m%60)+'m'}
function N(n){return(n||0).toLocaleString()}
let last=null;
function update(d){last=d;document.getElementById('disc').style.display='none';document.getElementById('dash').style.display='';document.getElementById('dot').className='d on';document.getElementById('st').textContent='🟢 '+new Date(d.t).toLocaleTimeString();document.getElementById('ver').textContent='v'+(d.version||'?');
const hp=d.hpMax>0?(d.hp/d.hpMax*100):0;document.getElementById('hpf').style.width=Math.max(0,Math.min(100,hp))+'%';document.getElementById('hpt').textContent=(d.hp??'?')+' / '+(d.hpMax||'?')+' ('+(hp?hp.toFixed(0):'?')+'%)';
const sp=d.spMax>0?(d.sp/d.spMax*100):0;document.getElementById('spf').style.width=Math.max(0,Math.min(100,sp))+'%';document.getElementById('spt').textContent=(d.sp??'?')+' / '+(d.spMax||'?');
document.getElementById('pos').textContent=d.player?.x!=null?'('+d.player.x.toFixed(0)+','+d.player.y.toFixed(0)+')':'?';document.getElementById('map').textContent=d.map||'?';document.getElementById('fm').textContent=d.farmMap||'-';
let st=d.isDead?'☠️ ตาย':(d.isResting?'🪑 นั่ง':'🟢 ปกติ');if(d.sellState&&d.sellState!=='IDLE')st+=' | 💰'+d.sellState;if(d.storageState&&d.storageState!=='IDLE')st+=' | 🏦'+d.storageState;document.getElementById('state').textContent=st;
const t=d.target;document.getElementById('tgt').textContent=t?t.name+' ('+(t.dist?t.dist.toFixed(1):'?')+')':'-';document.getElementById('mob').textContent=d.mobAttackers||0;
document.getElementById('dps').textContent=d.stats?.dps>0?N(d.stats.dps):'—';document.getElementById('aspd').textContent=d.stats?.aspd>0?d.stats.aspd.toFixed(1):'—';
document.getElementById('kills').textContent=N(d.stats?.kills);document.getElementById('loot').textContent=N(d.stats?.itemsLooted);document.getElementById('expmin').textContent=N(d.stats?.expPerMin);
document.getElementById('gr').textContent=d.stats?.goldRatePerHour>0?N(d.stats.goldRatePerHour)+'z':'—';document.getElementById('el').textContent=fmt(d.stats?.elapsedMs||0);document.getElementById('dth').textContent=d.stats?.deaths||0;
const T=d.toggles||{};const tl=[['loot','📦'],['heal','💉'],['rest','🪑'],['combat','⚔️'],['skill','🔮'],['buff','✨'],['sell','💰'],['storage','🏦']];document.getElementById('tg').innerHTML=tl.map(([k,l])=>'<span class="'+(T[k]?'on':'off')+'">'+l+'</span>').join('');
const cd=[...(d.buffs||[]).map(b=>({n:'✨ '+b.name,r:b.remainingMs})),...(d.skills||[]).map(s=>({n:'🔮 '+s.name,r:s.remainingMs}))];const cc=document.getElementById('cdcard');if(cd.length>0){cc.style.display='';document.getElementById('cds').innerHTML=cd.map(c=>{const rd=c.r<=0;const rs=Math.ceil(c.r/1000);const str=rd?'พร้อม':(rs>=60?Math.floor(rs/60)+'นาที '+(rs%60)+'s':rs+'s');return '<div class="cd '+(rd?'r':'w')+'"><span>'+c.n+'</span><span>'+str+'</span></div>'}).join('')}else cc.style.display='none'}
window.onData=update;
setInterval(()=>{if(last&&Date.now()-last.t>5000){document.getElementById('dot').className='d off';document.getElementById('st').textContent='🔴 ขาดการเชื่อมต่อ';document.getElementById('dash').style.opacity='.4'}else{document.getElementById('dash').style.opacity='1'}},2000);
</script></body></html>`;

  // ★ Monitor — ส่งข้อมูลไป popup window (origin เดียวกับเกม → ไม่มีปัญหา file://)
  let monitorWin = null;   // popup window reference
  let monitorChannel = null;
  try { monitorChannel = new BroadcastChannel('ro-assist-monitor'); } catch (_) {}
  const MONITOR_STORAGE_KEY = 'roAssistMonitorData';
  let lastMonitorSendAt = 0;
  function openMonitor() {
    if (monitorWin && !monitorWin.closed) { monitorWin.focus(); return; }
    monitorWin = window.open('', 'roMonitor', 'width=500,height=700,scrollbars=yes,resizable=yes');
    if (!monitorWin) { log('⚠️ popup ถูกบล็อก — อนุญาต popup สำหรับเว็บนี้'); return; }
    monitorWin.document.write(MONITOR_HTML);
    monitorWin.document.close();
    log('🖥️ เปิด Monitor แล้ว');
  }
  // ★ เปิด remote monitor ในแท็บใหม่ — ใช้ relay server URL + player_id ปัจจุบัน
  //   แสดงเฉพาะเมื่อ relay เชื่อมต่อแล้ว (เช็คใน renderUI)
  function openRemoteMonitor() {
    if (!playerId) { log('⚠️ ยังไม่รู้ player_id — รอ SPAWN ก่อน'); return; }
    const url = CFG.monitorServerUrl
      .replace(/^wss?:\/\//, '')   // ตัด ws/wss prefix → เหลือ host
      .replace(/\/.*$/, '');        // ตัด path ถ้ามี
    // protocol ตามหน้าเกม (https → https, http → http)
    const proto = location.protocol;
    const pidHex = playerId.toString(16);
    const fullUrl = proto + '//' + url + '/#pid=' + pidHex;
    log('🌐 เปิด Remote Monitor:', fullUrl);
    window.open(fullUrl, '_blank');
  }
  // ★ Feedback modal — แจ้งปัญหา/ข้อเสนอแนะ → ส่งถึงผู้พัฒนาผ่าน Telegram
  function openFeedbackModal() {
    const old = document.getElementById('__assist_feedback_modal');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = '__assist_feedback_modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:999999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:#1e1e2e;color:#e8e8e8;border-radius:12px;padding:20px;width:420px;max-width:90vw;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px">💬 แจ้งปัญหา / ข้อเสนอแนะ</div>
        <div style="font-size:11px;color:#888;margin-bottom:10px">ข้อความจะส่งถึงผู้พัฒนาพร้อมข้อมูลเวอร์ชั่น/แมป</div>
        <textarea id="__assist_feedback_text" style="width:100%;height:120px;background:#2a2d35;color:#e8e8e8;border:1px solid #444;border-radius:8px;padding:10px;font-size:13px;resize:vertical;box-sizing:border-box" placeholder="เขียนปัญหาหรือข้อเสนอแนะที่นี่... (Ctrl+Enter = ส่ง)"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">
          <button id="__assist_feedback_cancel" style="padding:8px 16px;border:none;border-radius:8px;background:#444;color:#ccc;cursor:pointer;font-size:13px">ยกเลิก</button>
          <button id="__assist_feedback_send" style="padding:8px 16px;border:none;border-radius:8px;background:#1a73e8;color:#fff;cursor:pointer;font-size:13px;font-weight:600">📤 ส่ง</button>
        </div>
        <div id="__assist_feedback_status" style="font-size:11px;margin-top:8px;text-align:center;min-height:14px"></div>
      </div>`;
    document.body.appendChild(overlay);
    const box = overlay.querySelector('#__assist_feedback_text');
    setTimeout(() => box.focus(), 0);
    const close = () => overlay.remove();
    overlay.querySelector('#__assist_feedback_cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    // ★ กัน Unity ขโมย focus เวลาคลิก textarea (mirror root mousedown handler)
    overlay.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea, button')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
          setTimeout(() => { try { e.target.focus(); } catch (_) {} }, 0);
        }
      }
    }, true);
    overlay.querySelector('#__assist_feedback_send').onclick = async () => {
      const msg = box.value.trim();
      if (!msg) { box.focus(); return; }
      const statusEl = overlay.querySelector('#__assist_feedback_status');
      const sendBtn = overlay.querySelector('#__assist_feedback_send');
      sendBtn.disabled = true; sendBtn.textContent = 'กำลังส่ง...';
      statusEl.style.color = '#f39c12'; statusEl.textContent = 'กำลังส่ง...';
      const text = [
        '💬 <b>Feedback</b>', '', msg, '',
        '— — —',
        '🤖 v' + VERSION,
        '👤 ' + (playerName || '?'),
        '🗺️ ' + (currentMap || '?'),
      ].join('\n');
      try {
        const res = await fetch('https://api.telegram.org/bot' + FEEDBACK_BOT_TOKEN + '/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: FEEDBACK_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        });
        if (res.ok) {
          statusEl.style.color = '#4caf50'; statusEl.textContent = '✅ ส่งแล้ว — ขอบคุณมาก!';
          log('💬 ส่ง feedback แล้ว');
          setTimeout(close, 1500);
        } else { throw new Error('HTTP ' + res.status); }
      } catch (e) {
        statusEl.style.color = '#f44336'; statusEl.textContent = '❌ ส่งไม่สำเร็จ: ' + e.message;
        sendBtn.disabled = false; sendBtn.textContent = '📤 ส่ง';
      }
    };
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); overlay.querySelector('#__assist_feedback_send').click(); }
      if (e.key === 'Escape') close();
    });
  }
  // ★★ Chat Room modal — ห้องแชทสำหรับผู้ใช้บอท (คุยกันผ่าน relay server)
  function renderChatRoomMessages(modal) {
    const box = modal.querySelector('#__assist_chatroom_msgs');
    if (!box) return;
    box.innerHTML = chatMessages.map(m => {
      const d = new Date(m.t);
      const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
      const name = (m.displayName || '?').replace(/</g,'&lt;');
      const text = (m.text || '').replace(/</g,'&lt;');
      return `<div style="margin-bottom:4px"><span style="color:#666;font-size:10px">${ts}</span> <span style="color:#4fc3f7;font-weight:600">${name}</span><span style="color:#888">: </span><span style="color:#e8e8e8">${text}</span></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
  function openChatRoomModal() {
    const old = document.getElementById('__assist_chatroom_modal');
    if (old) old.remove();
    // ★ reset unread badge
    chatUnread = 0;
    const badge = document.getElementById('__assist_chatbadge');
    if (badge) badge.style.display = 'none';
    // ★ โหลด displayName จาก localStorage
    let savedName = '';
    try { savedName = localStorage.getItem('roAssistChatName') || ''; } catch (_) {}
    const overlay = document.createElement('div');
    overlay.id = '__assist_chatroom_modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:999999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:#1e1e2e;color:#e8e8e8;border-radius:12px;padding:16px;width:480px;max-width:90vw;height:500px;max-height:85vh;display:flex;flex-direction:column;font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:#4fc3f7">🗨️ ห้องแชท</div>
        <div id="__assist_chatroom_msgs" style="flex:1;overflow-y:auto;background:#15151f;border-radius:8px;padding:10px;font-size:12px;line-height:1.5;margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input id="__assist_chatroom_name" type="text" value="${savedName.replace(/"/g,'&quot;')}" placeholder="ชื่อที่จะใช้คุย" style="flex:0 0 130px;background:#2a2d35;color:#e8e8e8;border:1px solid #444;border-radius:6px;padding:8px;font-size:12px;box-sizing:border-box" maxlength="30">
          <input id="__assist_chatroom_msg" type="text" placeholder="พิมพ์ข้อความ... (Enter = ส่ง)" style="flex:1;background:#2a2d35;color:#e8e8e8;border:1px solid #444;border-radius:6px;padding:8px;font-size:12px;box-sizing:border-box" maxlength="200">
          <button data-send style="padding:8px 16px;border:none;border-radius:6px;background:#1a73e8;color:#fff;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap">ส่ง</button>
        </div>
        <div style="font-size:10px;color:#666;text-align:center">Enter = ส่ง · Esc = ปิด</div>
      </div>`;
    document.body.appendChild(overlay);
    renderChatRoomMessages(overlay);
    // ★ focus message input (ถ้ามีชื่อแล้ว) หรือ name input (ถ้ายังไม่มีชื่อ)
    setTimeout(() => { try { (savedName ? overlay.querySelector('#__assist_chatroom_msg') : overlay.querySelector('#__assist_chatroom_name')).focus(); } catch (_) {} }, 0);
    const close = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    // ★ กัน Unity ขโมย focus
    overlay.addEventListener('mousedown', (e) => {
      if (e.target.matches && e.target.matches('input, select, textarea, button')) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          setTimeout(() => { try { e.target.focus(); } catch (_) {} }, 0);
        }
      }
    }, true);
    // ★ ปุ่มส่ง
    overlay.querySelector('button[data-send]').onclick = () => {
      const nameEl = overlay.querySelector('#__assist_chatroom_name');
      const msgEl = overlay.querySelector('#__assist_chatroom_msg');
      const displayName = nameEl.value.trim();
      const msg = msgEl.value.trim();
      if (!displayName) { nameEl.focus(); return; }
      if (!msg) { msgEl.focus(); return; }
      // ★ persist displayName
      try { localStorage.setItem('roAssistChatName', displayName); } catch (_) {}
      if (relayWs && relayWs.readyState === 1) {
        try {
          relayWs.send(JSON.stringify({ type: 'roomSend', message: msg, displayName }));
          msgEl.value = '';
          msgEl.focus();
        } catch (_) {}
      } else {
        log('⚠️ ยังไม่ได้เชื่อม relay — เปิด Monitor ก่อน');
      }
    };
  }
  // ★ Remote relay WebSocket state (ประกาศก่อนใช้ — กัน TDZ)
  let relayWs = null;
  let relayReconnectAt = 0;
  let relayStatus = 'disabled';        // 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  let relayStatusText = 'ปิด';          // ข้อความสั้น
  let relayConnectedAt = 0;             // เวลาที่เชื่อมต่อสำเร็จ
  // ★★ Chat Room state
  let chatMessages = [];                // ข้อความล่าสุด 100 จาก relay
  let chatUnread = 0;                   // จำนวนข้อความใหม่ที่ยังไม่ได้อ่าน
  let relayLastDataAt = 0;              // เวลาส่งข้อมูลล่าสุด
  let relayDataCount = 0;               // จำนวนครั้งที่ส่งข้อมูลแล้ว
  function sendMonitorData() {
    const now = nowMs();
    const interval = CFG.monitorSendIntervalMs || 1000;
    if (now - lastMonitorSendAt < interval) return;
    lastMonitorSendAt = now;
    const s = ASSIST.getStats();
    const tgt = ASSIST.getTarget();
    const cds = ASSIST.getBuffCountdowns ? ASSIST.getBuffCountdowns() : [];
    const skCds = ASSIST.getSkillCooldowns ? ASSIST.getSkillCooldowns() : [];
    const payload = {
      t: now, version: VERSION,
      hp: hp.cur, hpMax: hp.max, hpPct: hpPct(),
      sp: sp.cur, spMax: sp.max,
      player: { x: player.x, y: player.y, name: playerName, id: playerId },
      map: currentMap, farmMap: CFG.farmMap, zeny: playerZeny, gameServer: gameServerUrl,
      target: (() => {
        if (!tgt) return null;
        // ★ resolve entity จริงเพื่อเอา name/hp/hpMax (tgt จาก ASSIST.getTarget() มีแค่ id hex string)
        const tid = parseInt(tgt.id, 16);
        const m = entities.get(tid);
        return { name: (m && m.name) || tgt.id, dist: target ? target.lastDist : null, hp: m ? m.hp : null, hpMax: m ? m.hpMax : null, id: tid };
      })(),
      stats: { kills: s.kills, itemsLooted: s.itemsLooted, expPerMin: s.expPerMin, expGained: s.expGained, baseExpGained: s.baseExpGained, jobExpGained: s.jobExpGained, dps: s.dps, aspd: s.aspd, goldRatePerHour: s.goldRatePerHour, deaths: s.deaths, elapsedMs: s.elapsedMs },
      toggles: { loot: CFG.lootEnabled, heal: CFG.healEnabled, rest: CFG.restEnabled, combat: CFG.combatEnabled, skill: CFG.skillEnabled, buff: CFG.buffEnabled, sell: CFG.sellEnabled, storage: CFG.storageEnabled, warpToBoss: CFG.warpToBoss, warpToMiniBoss: CFG.warpToMiniBoss },
      mobAttackers: getMobAttackerCount(),
      // ★ mobAttackerList — สำหรับแสดงรูปมอน + HP bar ใน monitor (mirror dashboard mobAttackerList)
      mobAttackerList: (() => {
        const nowA = nowMs();
        const out = [];
        const seen = new Set();
        // เป้าหมายปัจจุบันก่อน — ★ resolve entity จริงเพื่อเอา name/hp (tgt.id เป็น hex string)
        if (tgt) {
          const tid = parseInt(tgt.id, 16);
          const m = entities.get(tid);
          out.push({ id: tid, name: (m && m.name) || tgt.id, hp: m ? m.hp : null, hpMax: m ? m.hpMax : null, isTarget: true });
          seen.add(tid);
        }
        for (const [id, t] of mobAttackers) {
          if (seen.has(id)) continue;
          if (nowA - t >= CFG.fleeMobWindowMs) continue;
          const m = entities.get(id);
          if (!m || !m.alive || m.x == null) continue;
          out.push({ id, name: m.name || id.toString(16), hp: m.hp, hpMax: m.hpMax, isTarget: false });
          if (out.length >= 6) break;
        }
        return out;
      })(),
      buffs: cds.map(b => ({ name: b.name, remainingMs: b.remainingMs, itemId: b.itemId })),
      skills: skCds.map(sk => ({ name: sk.name, remainingMs: sk.remainingMs })),
      // ★ inventory — สำหรับแสดงรูป item + ชื่อ + จำนวนใน monitor
      inventory: [...inventory.entries()].filter(([id, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, count]) => ({ itemId: Number(id), name: itemDisplayName(Number(id)), count })),
      isDead: isDead, isResting: isResting,
      sellState: sellState, storageState: storageState,
      // ★ relay server status (ส่งไปแสดงใน remote monitor ด้วย)
      relay: { ...relayStatusInfo(), url: CFG.monitorServerUrl, enabled: CFG.monitorServerEnabled },
      // ★ chat history — ส่งแชทล่าสุด 30 ข้อความ
      chatHistory: chatBuf.slice(-30),
      // ★ important log — ส่ง log สำคัญล่าสุด 30 รายการ
      alerts: importantLogBuf.slice(-30),
      // ★ map entities — สำหรับแสดง dots บนแผนที่ใน remote monitor
      mapEntities: (() => {
        const now = nowMs(); const out = [];
        const STALE_MS = 60000;
        // ★★ prioritize: boss > mini boss > monster > warp > NPC > player
        //   เพื่อให้ entities สำคัญโผล่ในแผนที่ก่อน (กันผู้เล่นเยอะกิน slot)
        const priority = (e) => {
          if (e._isBoss) return 0;
          if (e._isMiniBoss) return 1;
          if (e.kind === 1) return 2;       // monster
          if (e._isWarp) return 3;          // warp
          if (e.kind === 2) return 4;       // NPC
          return 5;                         // player (lowest)
        };
        const valid = [];
        for (const e of entities.values()) {
          if (e.id === playerId) continue;
          if (e.x == null || !e.alive) continue;
          if (isStaleId(e.id, now)) continue;
          if (e.kind !== 2) {
            if (!e._lastSeenAt) e._lastSeenAt = now;
            if (now - e._lastSeenAt > STALE_MS) {
              if ((e._isMiniBoss || e._isBoss) && bossAlertedIds.has(e.id)) {
                bossAlertedIds.delete(e.id);
                entities.delete(e.id);
                log('👹 Mini Boss หายไป (ไม่ได้รับตำแหน่ง 60s) — จะ alert ใหม่เมื่อเกิดใหม่');
              }
              continue;
            }
          }
          valid.push(e);
        }
        // ★ sort by priority → important entities first
        valid.sort((a, b) => priority(a) - priority(b));
        for (const e of valid) {
          if (out.length >= 50) break;
          out.push({ id: e.id.toString(16), kind: e.kind || 0, x: e.x, y: e.y, name: e.name || '', hp: e.hp, hpMax: e.hpMax, isBoss: !!e._isBoss, isMiniBoss: !!e._isMiniBoss, isWarp: !!e._isWarp });
        }
        return out;
      })(),
      targetId: target ? target.id.toString(16) : null,
      // ★ ground items — ของที่ตกอยู่บนพื้น (สำหรับแสดงบนแผนที่)
      groundItems: (() => {
        const out = [];
        const now = nowMs();
        for (const d of recentDrops.values()) {
          if (d.x == null) continue;
          // ข้ามของที่เก็บไปแล้ว (ถ้าไม่อยู่ใน queue = เก็บแล้ว)
          if (!queue.has(d.dropId) && !warpQueue.has(d.dropId)) continue;
          out.push({ dropId: d.dropId, itemId: d.itemId, name: itemDisplayName(d.itemId), x: d.x, y: d.y });
          if (out.length >= 30) break;
        }
        return out;
      })(),
    };
    // ★ ส่งผ่าน BroadcastChannel (ถ้ามี) + localStorage (fallback)
    if (monitorChannel) try { monitorChannel.postMessage(payload); } catch (_) {}
    try { localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
    // ★ ส่งตรงเข้า popup window (origin เดียวกัน — ทำงานเสมอ)
    if (monitorWin && !monitorWin.closed) {
      try { if (monitorWin.onData) monitorWin.onData(payload); } catch (_) {}
    }
    // ★ ส่งไป relay server (ดูจากมือถือ/เครื่องอื่นได้)
    if (relayWs && relayWs.readyState === 1 && playerId != null) {
      try { relayWs.send(JSON.stringify({ type: 'data', payload })); relayLastDataAt = nowMs(); relayDataCount++; } catch (_) {}
    }
  }
  function setRelayStatus(status, text) {
    relayStatus = status;
    relayStatusText = text;
    if (status === 'connected' && relayConnectedAt === 0) relayConnectedAt = nowMs();
  }
  function relayStatusInfo() {
    if (!CFG.monitorServerEnabled) return { status: 'disabled', text: 'ปิด', color: '#9aa0a6' };
    if (relayStatus === 'connected') {
      const uptime = relayConnectedAt > 0 ? fmtMs(nowMs() - relayConnectedAt) : '—';
      const sinceData = relayLastDataAt > 0 ? Math.round((nowMs() - relayLastDataAt) / 1000) + 'วิที่แล้ว' : '—';
      return { status: 'connected', text: `🟢 เชื่อมแล้ว ${uptime} • ${relayDataCount}ครั้ง • ${sinceData}`, color: '#2ecc71' };
    }
    if (relayStatus === 'connecting')  return { status: 'connecting',  text: '🟡 กำลังเชื่อม...', color: '#f1c40f' };
    if (relayStatus === 'reconnecting') {
      const wait = relayReconnectAt > 0 ? Math.max(0, Math.ceil((relayReconnectAt - nowMs()) / 1000)) : 0;
      return { status: 'reconnecting', text: `🔄 รอเชื่อมใหม่ใน ${wait}วิ`, color: '#e67e22' };
    }
    if (relayStatus === 'error')       return { status: 'error',       text: '🔴 ผิดพลาด (รอเชื่อมใหม่)', color: '#e74c3c' };
    return { status: 'idle', text: '⚪ ยังไม่เชื่อม', color: '#9aa0a6' };
  }
  function connectRelay() {
    if (!CFG.monitorServerEnabled || !CFG.monitorServerUrl) { setRelayStatus('disabled', 'ปิด'); return; }
    if (relayWs && (relayWs.readyState === 0 || relayWs.readyState === 1)) return;  // กำลังเชื่อมหรือเชื่อมแล้ว
    if (nowMs() < relayReconnectAt) {
      // แสดงสถานะ "รอเชื่อมใหม่" ถ้ายังอยู่ใน cooldown
      if (relayStatus !== 'connected' && relayStatus !== 'connecting') setRelayStatus('reconnecting', 'รอเชื่อมใหม่');
      return;
    }
    setRelayStatus('connecting', 'กำลังเชื่อม...');
    try {
      log('🌐 กำลังเชื่อม relay server:', CFG.monitorServerUrl);
      relayWs = new WebSocket(CFG.monitorServerUrl);
      relayWs.onopen = () => {
        setRelayStatus('connected', 'เชื่อมแล้ว');
        relayConnectedAt = nowMs();
        log('✅ เชื่อม relay server แล้ว:', CFG.monitorServerUrl);
        // ส่ง register
        if (playerId != null) {
          try { relayWs.send(JSON.stringify({ type: 'register', playerId: playerId.toString(16), playerName: playerName || '' })); } catch (_) {}
          // ★ ส่ง telegram config ทันที (ถ้ามี) — sync ไป relay server
          if (CFG.telegramBotToken && CFG.telegramChatId) {
            try { relayWs.send(JSON.stringify({ type: 'setTelegram', botToken: CFG.telegramBotToken, chatId: CFG.telegramChatId })); } catch (_) {}
            log('📨 ส่ง Telegram config ไป relay แล้ว');
          }
          // ★ ส่งแจ้งเตือนยืนยันการเชื่อมต่อ
          sendRelayAlert('🌐 เชื่อมต่อระบบ Remote Monitor แล้ว');
        } else {
          log('⚠️ ยังไม่มี player_id — ระบบจะ register ทันทีเมื่อ SPAWN มา');
          // ★★ เข้าห้องแชทได้แม้ยังไม่มี player_id
          try { relayWs.send(JSON.stringify({ type: 'roomJoin' })); } catch (_) {}
        }
      };
      relayWs.onclose = (ev) => {
        const wasConnected = relayStatus === 'connected';
        relayWs = null;
        relayConnectedAt = 0;
        relayReconnectAt = nowMs() + 5000;   // reconnect ใน 5s
        setRelayStatus('reconnecting', 'รอเชื่อมใหม่ใน 5วิ');
        log(`🔌 หลุดจาก relay server (code=${ev.code}) — เชื่อมใหม่ใน 5วิ`, CFG.monitorServerUrl);
        if (ev.code === 1006 && !wasConnected) {
          log('💡 หมายเหตุ: code=1006 มักเกิดจากเซิร์ฟเวอร์ตอบกลับไม่ได้/proxy ผิด/SSL ไม่ตรง — ตรวจสอบว่า relay server รันอยู่และ nginx ส่ง WS ผ่าน');
        }
      };
      relayWs.onerror = () => {
        setRelayStatus('error', 'ผิดพลาด');
        log('❌ relay server error:', CFG.monitorServerUrl);
        try { relayWs.close(); } catch (_) {}
      };
      relayWs.onmessage = (ev) => {
        // ★ รับ message จาก relay server (telegramSaved, telegramConfig)
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.type === 'telegramSaved') {
          if (m.ok) {
            log('📨 บันทึก Telegram config แล้ว');
            updateTelegramStatus('✅ บันทึกแล้ว — แจ้งเตือนจะส่งไป Telegram เมื่อมี log สำคัญ', '#2ecc71');
          } else {
            log('⚠️ บันทึก Telegram config ล้มเหลว:', m.error || '?');
            updateTelegramStatus('❌ บันทึกไม่สำเร็จ: ' + (m.error || '?'), '#e74c3c');
          }
        } else if (m.type === 'telegramConfig') {
          // relay บอกว่ามี config อยู่แล้วหรือไม่
          if (m.configured) {
            updateTelegramStatus('✅ ตั้งค่าแล้ว (Chat ID: ' + m.chatId + ') — แจ้งเตือนจะส่งไป Telegram', '#2ecc71');
          } else {
            updateTelegramStatus('⚠️ ยังไม่ได้ตั้งค่า — กรอก Bot Token + Chat ID แล้วกด บันทึก', '#f39c12');
          }
        }
        // ★ command จาก remote monitor → toggle on/off หรือ action (sellNow, depositNow)
        else if (m.type === 'command' && m.system && m.action) {
          // ★ action พิเศษ (ไม่ใช่ toggle): sellNow, depositNow, buffNow, skillNow
          if (m.action === 'now') {
            const actionMethod = m.system + 'Now';
            if (typeof ASSIST[actionMethod] === 'function') {
              ASSIST[actionMethod]();
              log('🎮 Remote action:', m.system, 'now');
              try { relayWs.send(JSON.stringify({ type: 'commandAck', system: m.system, action: m.action, ok: true })); } catch (_) {}
            } else {
              try { relayWs.send(JSON.stringify({ type: 'commandAck', system: m.system, action: m.action, ok: false, error: 'unknown action' })); } catch (_) {}
            }
          } else {
            const method = m.system + (m.action === 'off' ? 'Off' : 'On');
            if (typeof ASSIST[method] === 'function') {
              ASSIST[method]();
              log('🎮 Remote command:', m.system, m.action);
              try { relayWs.send(JSON.stringify({ type: 'commandAck', system: m.system, action: m.action, ok: true })); } catch (_) {}
            } else {
              log('⚠️ Remote command: method "' + method + '" ไม่มี');
              try { relayWs.send(JSON.stringify({ type: 'commandAck', system: m.system, action: m.action, ok: false, error: 'unknown method' })); } catch (_) {}
            }
          }
        }
        // ★ chat จาก remote monitor → ส่งไป game server
        else if (m.type === 'chat' && m.message != null) {
          if (sendChat(m.message, m.chatType || 0)) {
            log('💬 Remote chat (' + (m.chatType === 1 ? 'shout' : 'nearby') + '):', m.message);
            try { relayWs.send(JSON.stringify({ type: 'chatAck', ok: true })); } catch (_) {}
          } else {
            log('⚠️ Remote chat: ส่งไม่ได้ (activeWS ไม่พร้อม?)');
            try { relayWs.send(JSON.stringify({ type: 'chatAck', ok: false, error: 'not connected' })); } catch (_) {}
          }
        }
        // ★★ Chat Room — รับประวัติแชท (100 ข้อความล่าสุด)
        else if (m.type === 'roomHistory' && Array.isArray(m.messages)) {
          chatMessages = m.messages.slice(-100);
          const modal = document.getElementById('__assist_chatroom_modal');
          if (modal) renderChatRoomMessages(modal);
        }
        // ★★ Chat Room — รับข้อความใหม่ (broadcast)
        else if (m.type === 'roomMessage' && m.message) {
          chatMessages.push(m.message);
          if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);
          const modal = document.getElementById('__assist_chatroom_modal');
          if (modal) {
            renderChatRoomMessages(modal);
          } else {
            // modal ปิดอยู่ → เพิ่ม badge
            chatUnread++;
            const badge = document.getElementById('__assist_chatbadge');
            if (badge) { badge.textContent = chatUnread > 99 ? '99+' : chatUnread; badge.style.display = 'flex'; }
          }
        }
      };
    } catch (e) {
      setRelayStatus('error', 'สร้าง WS ไม่ได้');
      log('❌ สร้าง relay WebSocket ไม่ได้:', e.message);
      relayReconnectAt = nowMs() + 5000;
    }
  }
  // ★ ส่ง register ทันทีเมื่อได้ player_id (เรียกจาก SPAWN/SELECT_CHAR handler)
  function relayRegisterPlayer() {
    if (relayWs && relayWs.readyState === 1 && playerId != null) {
      try {
        relayWs.send(JSON.stringify({ type: 'register', playerId: playerId.toString(16), playerName: playerName || '' }));
        log('📡 ลงทะเบียน (register) player_id ' + playerId.toString(16) + ' ไปยัง relay แล้ว');
        // ★ ส่ง telegram config ทันที (ถ้ามี) — sync ไป relay server
        if (CFG.telegramBotToken && CFG.telegramChatId) {
          relayWs.send(JSON.stringify({ type: 'setTelegram', botToken: CFG.telegramBotToken, chatId: CFG.telegramChatId }));
          log('📨 ส่ง Telegram config ไป relay แล้ว');
        }
        // ★ ขอ telegram config status หลัง register (เพื่อแสดงใน UI ว่าตั้งไว้แล้วหรือยัง)
        relayWs.send(JSON.stringify({ type: 'getTelegram' }));
        // ★★ เข้าห้องแชท — ขอประวัติ 100 ข้อความล่าสุด
        relayWs.send(JSON.stringify({ type: 'roomJoin' }));
        // ★ ส่งแจ้งเตือนยืนยันการเชื่อมต่อ
        sendRelayAlert('🌐 เชื่อมต่อระบบ Remote Monitor แล้ว');
      } catch (_) {}
    }
  }
  // ★ ส่ง alert ไป relay server (relay จะ forward ไป Telegram ถ้ามี config)
  function sendRelayAlert(msg) {
    if (relayWs && relayWs.readyState === 1 && playerId != null) {
      try { relayWs.send(JSON.stringify({ type: 'alert', msg })); } catch (_) {}
    }
  }
  // ★ บันทึก telegram config (botToken + chatId) ที่ relay server
  function sendSetTelegram(botToken, chatId) {
    if (relayWs && relayWs.readyState === 1) {
      try { relayWs.send(JSON.stringify({ type: 'setTelegram', botToken, chatId: String(chatId) })); return true; } catch (_) {}
    }
    return false;
  }
  // ★ ลบ telegram config (ส่งค่าว่างไป)
  function sendClearTelegram() {
    if (relayWs && relayWs.readyState === 1) {
      try { relayWs.send(JSON.stringify({ type: 'setTelegram', botToken: '', chatId: '' })); return true; } catch (_) {}
    }
    return false;
  }
  // ★ อัปเดตสถานะ Telegram ใน UI
  function updateTelegramStatus(text, color) {
    const el = document.getElementById('__assist_tg_status');
    if (el) { el.innerHTML = text; el.style.color = color || '#9aa0a6'; }
  }

  // ---------- render loop ----------
  function fmtMs(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }
  function renderUI() {
    const root = document.getElementById('__assist_root');
    if (!root) return;
    const pct = hpPct();
    const pctNum = pct == null ? null : pct;
    const hpText = hp.cur != null ? `${hp.cur}/${hp.max} (${pctNum != null ? pctNum.toFixed(0) : '?'}%)` : 'HP ?';

    // mini-bar
    const hpEl = root.querySelector('.hptext');
    const fill = root.querySelector('.hpfill');
    // version + update button
    const verEl = root.querySelector('[data-version]');
    const updAvail = latestVersion && cmpVer(latestVersion, VERSION) > 0;
    if (verEl) verEl.textContent = 'v' + VERSION + (updAvail ? ' (มีใหม่ v' + latestVersion + ')' : '');
    const updBtn = root.querySelector('#__assist_updatebtn');
    if (updBtn) updBtn.style.display = updAvail ? '' : 'none';
    if (hpEl) hpEl.textContent = hpText;
    if (fill) {
      const w = pctNum != null ? Math.max(0, Math.min(100, pctNum)) : 0;
      fill.style.width = w + '%';
      fill.className = 'hpfill' + (w < 25 ? '' : w < 50 ? ' warn' : ' good');
    }
    root.querySelectorAll('.pill').forEach(p => {
      let on, label;
      if (p.hasAttribute('data-loot')) { on = CFG.lootEnabled; label = '📦 Loot'; }
      else if (p.hasAttribute('data-heal')) { on = CFG.healEnabled; label = '💉 Heal'; }
      else if (p.hasAttribute('data-rest')) { on = CFG.restEnabled; label = '🪑 Rest'; }
      else if (p.hasAttribute('data-combat')) { on = CFG.combatEnabled; label = '⚔️ Combat'; }
      else if (p.hasAttribute('data-skill')) { on = CFG.skillEnabled; label = '🔮 Skill'; }
      else if (p.hasAttribute('data-buff')) { on = CFG.buffEnabled; label = '✨ Buff'; }
      else if (p.hasAttribute('data-sell')) { on = CFG.sellEnabled; label = '💰 Sell'; }
      else if (p.hasAttribute('data-storage')) { on = CFG.storageEnabled; label = '🏦 Kafra'; }
      else return;
      p.className = 'pill ' + (on ? 'on' : 'off');
      p.textContent = label + ': ' + (on ? 'ON' : 'OFF');
    });
    if (isDead) root.querySelector('#__assist_bar').classList.add('__assist_dead');
    else root.querySelector('#__assist_bar').classList.remove('__assist_dead');

    // stats page
    const s = ASSIST.getStats();
    const set = (sel, val) => { const el = root.querySelector(sel); if (el) el.textContent = val; };
    set('[data-hp]', hpText);
    set('[data-pos]', player.x != null ? `(${player.x.toFixed(1)}, ${player.y.toFixed(1)})` : '?');
    // ★ farm map status: แสดงแมปปัจจุบัน + เตือนถ้าอยู่ผิดแมปฟาร์ม
    {
      const farmInfo = CFG.farmMap
        ? (currentMap === CFG.farmMap ? `${currentMap} ✅` : `${currentMap || '?'} ⚠️ (ฟาร์ม: ${CFG.farmMap})`)
        : (currentMap || '?');
      set('[data-farmmap]', farmInfo);
    }
    set('[data-pid]', playerId ? playerId.toString(16) : '?');
    set('[data-state]', isDead ? '☠️ ตาย' : (isResting ? '🪑 นั่งพัก' : (activeWS && activeWS.readyState === 1 ? '🟢 เชื่อมต่อ' : '🔴 ไม่ได้ต่อ')));
    // ★ Remote Monitor status (relay server) + แสดง/ซ่อนปุ่ม 🌐 ใน mini-bar
    {
      const r = relayStatusInfo();
      const el = root.querySelector('[data-relay]');
      if (el) { el.textContent = r.text; el.style.color = r.color; }
      // ★ ปุ่ม 🌐 แสดงเฉพาะเมื่อ relay เชื่อมต่อแล้ว + มี player_id
      const showRemote = (r.status === 'connected' && playerId);
      const remoteBtn = root.querySelector('[data-remote]');
      if (remoteBtn) remoteBtn.style.display = showRemote ? '' : 'none';
      // ★ ปุ่มเปิด remote monitor ใน sub-tab อื่นๆ ก็แสดงเมื่อเชื่อมต่อแล้วเช่นกัน
      const openRemoteBtn = root.querySelector('#__assist_openremote');
      if (openRemoteBtn) openRemoteBtn.style.display = showRemote ? '' : 'none';
    }
    set('[data-kills]', s.kills);
    set('[data-looted]', s.itemsLooted);
    set('[data-exp]', s.expGained.toLocaleString());
    set('[data-expmin]', s.expPerMin.toLocaleString());
    set('[data-dps]', s.dps > 0 ? s.dps.toLocaleString() : '—');
    set('[data-aspd]', s.aspd > 0 ? s.aspd.toFixed(1) : '—');
    set('[data-goldrate]', s.goldRatePerHour > 0 ? s.goldRatePerHour.toLocaleString() + 'z' : '—');
    set('[data-elapsed]', fmtMs(s.elapsedMs));
    set('[data-deaths]', s.deaths);
    set('[data-zeny]', sessionZeny().toLocaleString() + 'z');
    const itemsEl = root.querySelector('[data-items]');
    if (itemsEl) {
      // ★ แสดงจาก inventory จริง (ลดตอนใช้/ขาย) เรียงจากจำนวนมาก → น้อย
      const invTop = [...inventory.entries()].filter(([id, c]) => c > 0).sort((a, b) => b[1] - a[1]);
      itemsEl.innerHTML = invTop.length ? invTop.map(([id, count]) => {
        const numId = Number(id);
        const price = itemPrice(numId);
        const zeny = price ? ` <span style="color:#f1c40f">${(price * count).toLocaleString()}z</span>` : '';
        const icon = itemDB.loaded ? `<img src="${itemIconUrl(numId)}" style="width:16px;height:16px;vertical-align:middle" onerror="this.style.display='none'"> ` : '';
        // ★ toggle 3-state: เก็บ(เทา) / ขาย(ส้ม) / ฝาก(เขียว) — กดวน
        const action = getItemAction(numId);
        const actionLabel = action === 'sell' ? 'ขาย' : (action === 'deposit' ? 'ฝาก' : 'เก็บ');
        const actionColor = action === 'sell' ? '#e67e22' : (action === 'deposit' ? '#27ae60' : '#6b7280');
        const bgColor = action === 'sell' ? 'rgba(230,126,34,.12)' : (action === 'deposit' ? 'rgba(39,174,96,.12)' : 'transparent');
        return `<div style="background:${bgColor};border-radius:3px;padding:2px 4px">${icon}${itemDisplayName(numId)} ×${count}${zeny} <button data-itemaction="${numId}" style="float:right;font-size:10px;color:#fff;background:${actionColor};border:none;border-radius:3px;padding:1px 6px;cursor:pointer;font-family:inherit">${actionLabel}</button></div>`;
      }).join('') : '(ยังไม่มี)';
      // wire toggle buttons (วน keep→sell→deposit→keep)
      itemsEl.querySelectorAll('button[data-itemaction]').forEach(btn => {
        btn.onclick = () => { const id = parseInt(btn.getAttribute('data-itemaction'), 10); cycleItemAction(id); };
      });
    }
    // combat stats
    const tgt = ASSIST.getTarget();
    const agg = ASSIST.getAggro();
    set('[data-combat-target]', tgt ? (tgt.id + ' pending:' + tgt.pending) : '(none)');
    set('[data-combat-aggro]', agg.mobAttackers + ' ตี / ' + agg.aggro + ' aggro / ' + agg.threat + ' threat / ' + agg.monstersNearby + ' รอบ');
    // inventory + sell state
    set('[data-inventory]', inventory.size + ' ชนิด' + (inventoryFull ? ' ⚠️เต็ม' : ''));
    set('[data-sellstate]', CFG.sellEnabled ? (sellState === 'IDLE' ? 'ON (รอ trigger)' : sellState) : 'OFF');
    set('[data-storagestate]', CFG.storageEnabled ? (storageState === 'IDLE' ? 'ON (รอ trigger)' : storageState) : 'OFF');

    // config page — ซิงค์ค่าปัจจุบันเข้า input (กันเขียนทับเวลา user กำลังพิมพ์)
    const lootBtn = root.querySelector('#__assist_lootbtn');
    const healBtn = root.querySelector('#__assist_healbtn');
    const warpBtn = root.querySelector('#__assist_warpbtn');
    if (lootBtn) { lootBtn.textContent = 'Loot: ' + (CFG.lootEnabled ? 'ON' : 'OFF'); lootBtn.className = CFG.lootEnabled ? 'on' : 'off'; }
    if (healBtn) { healBtn.textContent = 'Heal: ' + (CFG.healEnabled ? 'ON' : 'OFF'); healBtn.className = CFG.healEnabled ? 'on' : 'off'; }
    if (warpBtn) { warpBtn.textContent = 'วาร์ปไปเก็บของ: ' + (CFG.warpLootEnabled ? 'ON' : 'OFF') + (warpQueue.size ? ` (${warpQueue.size})` : ''); warpBtn.className = CFG.warpLootEnabled ? 'on' : 'off'; }
    const ha = root.querySelector('#__assist_healat');
    if (ha && !isEditing(ha)) ha.value = CFG.healAtPercent;
    const hi = root.querySelector('#__assist_healitems');
    if (hi && !isEditing(hi)) hi.value = CFG.healItems.join(',');
    const hm = root.querySelector('#__assist_healmode');
    if (hm && !isEditing(hm)) hm.value = CFG.healMode;
    // buff config sync + countdown display
    const buffBtn = root.querySelector('#__assist_buffbtn');
    if (buffBtn) { buffBtn.textContent = 'Buff: ' + (CFG.buffEnabled ? 'ON' : 'OFF'); buffBtn.className = CFG.buffEnabled ? 'on' : 'off'; }
    const bi = root.querySelector('#__assist_buffitems');
    if (bi && !isEditing(bi)) bi.value = (CFG.buffItems || []).map(x => x.itemId + ',' + x.intervalMin).join('\n');
    const cdEl = root.querySelector('#__assist_buffcountdown');
    if (cdEl) {
      if (!CFG.buffItems || !CFG.buffItems.length) {
        cdEl.textContent = '(ยังไม่ตั้ง buff)';
      } else {
        const cds = ASSIST.getBuffCountdowns();
        cdEl.innerHTML = cds.map(c => {
          const icon = itemDB.loaded ? `<img src="${itemIconUrl(c.itemId)}" style="width:14px;height:14px;vertical-align:middle" onerror="this.style.display='none'"> ` : '';
          const remSec = Math.ceil(c.remainingMs / 1000);
          const remStr = remSec >= 60 ? Math.floor(remSec/60) + 'นาที' + (remSec%60 ? ' '+(remSec%60)+'s' : '') : remSec + 's';
          const state = c.remainingMs <= 0 ? '<span style="color:#27ae60">พร้อมใช้</span>' : '<span style="color:#f39c12">' + remStr + '</span>';
          return `<div>${icon}${c.name} <span style="color:#5f6368">(ทุก ${c.intervalMin}นาที)</span> → ${state}</div>`;
        }).join('');
      }
    }
    // skill config sync + countdown display
    const skillBtn = root.querySelector('#__assist_skillbtn');
    if (skillBtn) { skillBtn.textContent = 'Skill: ' + (CFG.skillEnabled ? 'ON' : 'OFF'); skillBtn.className = CFG.skillEnabled ? 'on' : 'off'; }
    const skCdEl = root.querySelector('#__assist_skillcountdown');
    if (skCdEl) {
      if (!CFG.skills || !CFG.skills.length) {
        skCdEl.textContent = '(ยังไม่ตั้ง skill — กด "📋 จัดการ skill")';
      } else {
        const cds = ASSIST.getSkillCooldowns();
        const spStr = sp.cur != null ? (sp.max ? ` | SP ${sp.cur}/${sp.max}` : ` | SP ${sp.cur}`) : '';
        skCdEl.innerHTML = cds.map(c => {
          const remSec = Math.ceil(c.remainingMs / 1000);
          const remStr = remSec >= 60 ? Math.floor(remSec/60) + 'นาที' : remSec + 's';
          const state = c.remainingMs <= 0 ? '<span style="color:#27ae60">พร้อม</span>' : '<span style="color:#f39c12">' + remStr + '</span>';
          return `<div>🔮 ${c.name} <span style="color:#5f6368">(#${c.skillId})</span> → ${state}</div>`;
        }).join('') + `<div style="color:#5f6368;margin-top:2px">${spStr}</div>`;
      }
    }
    const lm = root.querySelector('#__assist_lootmode');
    if (lm && !isEditing(lm)) lm.value = CFG.filter.mode;
    const ld = root.querySelector('#__assist_lootdelay');
    if (ld && !isEditing(ld)) ld.value = CFG.lootDelayAfterDropMs;
    const lt = root.querySelector('#__assist_lootthrottle');
    if (lt && !isEditing(lt)) lt.value = CFG.sendThrottleMs;

    // combat config sync
    const combatBtn = root.querySelector('#__assist_combatbtn');
    if (combatBtn) { combatBtn.textContent = 'Combat: ' + (CFG.combatEnabled ? 'ON' : 'OFF'); combatBtn.className = CFG.combatEnabled ? 'on' : 'off'; }
    const syncInput = (sel, val) => { const el = root.querySelector(sel); if (el && !isEditing(el)) el.value = val; };
    const syncToggle = (sel, on) => { const el = root.querySelector(sel); if (el) el.className = on ? 'on' : 'off'; };
    syncInput('#__assist_whitelist', CFG.targetWhitelist.join(','));
    syncInput('#__assist_blacklist', CFG.targetBlacklist.join(','));
    syncInput('#__assist_attackrange', CFG.rangedAttackRange > 0 ? CFG.rangedAttackRange : CFG.attackRange);
    syncInput('#__assist_fleemob', CFG.fleeOnMobCount);
    syncInput('#__assist_fleeaggro', CFG.fleeOnAggroCount);
    // rest config sync
    const restBtn = root.querySelector('#__assist_restbtn');
    if (restBtn) { restBtn.textContent = 'Rest: ' + (CFG.restEnabled ? 'ON' : 'OFF') + (isResting ? ' 🪑' : ''); restBtn.className = CFG.restEnabled ? 'on' : 'off'; }
    syncInput('#__assist_resthp', CFG.restHpPercent);
    syncInput('#__assist_restuntil', CFG.restUntilPercent);
    syncInput('#__assist_restmaxsec', CFG.restMaxSec);
    // ★ auto-respawn toggle sync
    const respawnBtn = root.querySelector('#__assist_respawnbtn');
    if (respawnBtn) { respawnBtn.textContent = 'Respawn: ' + (CFG.autoRespawnEnabled ? 'ON' : 'OFF'); respawnBtn.className = CFG.autoRespawnEnabled ? 'on' : 'off'; }
    syncInput('#__assist_fleeprox', CFG.fleeOnProximityCount);
    syncInput('#__assist_stuckwarp', CFG.stuckWarpOnAbandon);
    syncToggle('#__assist_t_warptoboss', CFG.warpToBoss === true);
    syncToggle('#__assist_t_warptominiboss', CFG.warpToMiniBoss === true);
    syncInput('#__assist_fleemonsters', (CFG.fleeMonsters || []).join(','));
    syncInput('#__assist_fleemonsterradius', CFG.fleeMonsterRadius);
    syncToggle('#__assist_t_antiks', CFG.antiKS);
    syncInput('#__assist_pickradiuskill', CFG.pickRadiusKill);
    syncToggle('#__assist_t_lootkillpos', CFG.lootUseKillPos);
    syncToggle('#__assist_t_avoidp', CFG.avoidOtherPlayers);
    syncToggle('#__assist_t_lowhp', CFG.targetLowestHpFirst);
    syncToggle('#__assist_t_wander', CFG.wanderEnabled);
    syncToggle('#__assist_t_warpfind', CFG.warpFindEnabled);
    syncToggle('#__assist_t_warptomon', CFG.warpToMonster);
    // sell config sync
    const sellBtn = root.querySelector('#__assist_sellbtn');
    if (sellBtn) { sellBtn.textContent = 'Sell: ' + (CFG.sellEnabled ? 'ON' : 'OFF') + (sellState !== 'IDLE' ? ' (' + sellState + ')' : ''); sellBtn.className = CFG.sellEnabled ? 'on' : 'off'; }
    syncInput('#__assist_sellnpc', CFG.sellNpcName);
    syncInput('#__assist_sellmap', CFG.sellNpcMap);
    syncInput('#__assist_sellx', CFG.sellNpcX);
    syncInput('#__assist_selly', CFG.sellNpcY);
    syncInput('#__assist_sellinterval', CFG.sellIntervalMin);
    syncToggle('#__assist_t_sellfull', CFG.sellOnFull);
    // storage config sync
    const storageBtn = root.querySelector('#__assist_storagebtn');
    if (storageBtn) { storageBtn.textContent = 'Storage: ' + (CFG.storageEnabled ? 'ON' : 'OFF') + (storageState !== 'IDLE' ? ' (' + storageState + ')' : ''); storageBtn.className = CFG.storageEnabled ? 'on' : 'off'; }
    syncInput('#__assist_kafra', CFG.kafraName);
    syncInput('#__assist_kaframap', CFG.kafraMap);
    syncInput('#__assist_kafrax', CFG.kafraMapX);
    syncInput('#__assist_kafray', CFG.kafraMapY);
    syncInput('#__assist_kafrachoice', CFG.kafraChoice);
    syncToggle('#__assist_t_depfull', CFG.depositOnFull);
    syncToggle('#__assist_t_depaftersell', CFG.depositAfterSell);
    // ★ relay/remote monitor config sync
    const relayBtn = root.querySelector('#__assist_relaybtn');
    if (relayBtn) {
      const r = relayStatusInfo();
      relayBtn.textContent = 'Relay: ' + (CFG.monitorServerEnabled ? 'ON' : 'OFF') + ' — ' + r.text;
      relayBtn.className = CFG.monitorServerEnabled ? 'on' : 'off';
    }
    syncInput('#__assist_relayurl', CFG.monitorServerUrl);
    // ★ telegram alert toggle sync
    syncToggle('#__assist_t_tgcard', CFG.telegramAlertCard !== false);
    syncToggle('#__assist_t_tgflee', CFG.telegramAlertFlee !== false);
    syncToggle('#__assist_t_tgbot', CFG.telegramAlertBotMention !== false);
    syncToggle('#__assist_t_tgnearby', CFG.telegramAlertNearby === true);
    syncToggle('#__assist_t_tgwhisper', CFG.telegramAlertWhisper !== false);
    // ★ sync telegram token/chatId จาก CFG ลง input fields
    const tgToken = root.querySelector('#__assist_tg_token');
    if (tgToken && !isEditing(tgToken) && CFG.telegramBotToken) tgToken.value = CFG.telegramBotToken;
    const tgChatId = root.querySelector('#__assist_tg_chatid');
    if (tgChatId && !isEditing(tgChatId) && CFG.telegramChatId) tgChatId.value = CFG.telegramChatId;
    // nav config sync + stats display
    const navRecBtn = root.querySelector('#__assist_navrecbtn');
    if (navRecBtn) { navRecBtn.textContent = 'บันทึก: ' + (CFG.navRecording ? 'ON 🔴' : 'OFF'); navRecBtn.className = CFG.navRecording ? 'on' : 'off'; }
    syncToggle('#__assist_navwanderbtn', CFG.navWanderUseNav);
    const nm = root.querySelector('#__assist_navmode');
    if (nm && !isEditing(nm)) nm.value = CFG.navWanderMode;
    syncInput('#__assist_navradius', CFG.navMergeRadius);
    const navStatsEl = root.querySelector('#__assist_navstats');
    if (navStatsEl) {
      const all = ASSIST.navGetAllStats();
      const mapNames = Object.keys(all);
      if (!mapNames.length) {
        navStatsEl.textContent = '(ยังไม่มีข้อมูล — เปิด "บันทึก" แล้วเดินเก็บข้อมูลในแมปที่ต้องการ)';
      } else {
        navStatsEl.innerHTML = mapNames.map(m => {
          const s = all[m];
          const cur = m === currentMap ? ' ✅' : '';
          return `<div>📦 ${m}${cur}: ${s.nodes} nodes, ${s.edges} edges (${s.trail} trail)</div>`;
        }).join('');
      }
    }
    // farm map config sync
    syncInput('#__assist_farmmap', CFG.farmMap);
    syncInput('#__assist_farmx', CFG.farmMapX);
    syncInput('#__assist_farmy', CFG.farmMapY);
    syncToggle('#__assist_t_warpback', CFG.warpBackToFarm);

    // log page (อัปเดตเฉพาะถ้าเปิดอยู่ เพื่อประหยัด)
    const logPage = root.querySelector('.__assist_page[data-page="log"]');
    if (logPage && logPage.classList.contains('active')) {
      const box = root.querySelector('#__assist_logbox');
      if (box) {
        const logs = ASSIST.getLogs();
        const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
        // ★ rebuild เมื่อจำนวนเปลี่ยน OR log ล่าสุดเปลี่ยน (กันค้างตอน buffer เต็ม 200 แล้ว shift)
        const lastT = logs.length ? logs[logs.length - 1].t : 0;
        const firstT = logs.length ? logs[0].t : 0;
        const sig = logs.length + ':' + firstT + ':' + lastT;
        if (box.dataset.sig !== sig) {
          box.dataset.sig = sig;
          box.innerHTML = logs.map(l => {
            const d = new Date(l.t);
            const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
            return `<div class="logline"><span class="ts">${ts}</span> ${l.msg.replace(/</g,'&lt;')}</div>`;
          }).join('');
          if (wasNearBottom) box.scrollTop = box.scrollHeight;
        }
      }
    }
    // ★ alert page (log สำคัญ — card + chat bot)
    const alertPage = root.querySelector('.__assist_page[data-page="alert"]');
    if (alertPage && alertPage.classList.contains('active')) {
      const box = root.querySelector('#__assist_alertbox');
      if (box) {
        const logs = ASSIST.getImportantLogs();
        const wasNearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
        const lastT = logs.length ? logs[logs.length - 1].t : 0;
        const firstT = logs.length ? logs[0].t : 0;
        const sig = logs.length + ':' + firstT + ':' + lastT;
        if (box.dataset.sig !== sig) {
          box.dataset.sig = sig;
          box.innerHTML = logs.length ? logs.map(l => {
            const d = new Date(l.t);
            const ts = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
            const color = l.type === 'card' ? '#f1c40f' : (l.type === 'chat' ? '#ef5350' : '#e8e8e8');
            return `<div class="logline" style="color:${color}"><span class="ts">${ts}</span> ${l.msg.replace(/</g,'&lt;')}</div>`;
          }).join('') : '<div style="color:#5f6368;padding:20px;text-align:center">(ยังไม่มี log สำคัญ)</div>';
          if (wasNearBottom) box.scrollTop = box.scrollHeight;
        }
      }
    }
  }

  // ---------- version check + update ----------
  let lastConfigSnapshot = null;
  let lastAutoSaveAt = 0;
  let lastVersionCheckAt = 0;
  let latestVersion = null;          // เวอร์ชั่นล่าสุดจาก GitHub (null = ยังไม่ได้เช็ค)
  let updateChecking = false;
  function parseVersionFromHeader(src) {
    const m = src.match(/@version\s+([\d.]+)/);
    return m ? m[1] : null;
  }
  function cmpVer(a, b) {   // คืน >0 ถ้า a ใหม่กว่า b
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] || 0, db = pb[i] || 0;
      if (da !== db) return da - db;
    }
    return 0;
  }
  async function checkVersion() {
    if (updateChecking) return;
    updateChecking = true;
    try {
      const res = await fetch(GITHUB_RAW, { cache: 'no-store' });
      if (!res.ok) return;
      const src = await res.text();
      const remote = parseVersionFromHeader(src);
      if (remote) {
        latestVersion = remote;
        if (cmpVer(remote, VERSION) > 0) {
          log('🔔 มีเวอร์ชั่นใหม่!', VERSION, '→', remote, '(กดปุ่ม ⬆ อัปเดต หรือ ASSIST.update())');
        } else {
          log('✅ เวอร์ชั่นล่าสุดแล้ว (' + VERSION + ')');
        }
      }
    } catch (e) { /* offline / CORS → ข้าม */ }
    finally { updateChecking = false; }
  }
  async function doUpdate() {
    log('⬆ กำลังอัปเดต...');
    saveConfig();
    // ★ ตรวจว่ารันใน Tampermonkey หรือ console
    const isTampermonkey = (typeof GM_info !== 'undefined') || (typeof GM !== 'undefined') || (typeof unsafeWindow !== 'undefined');
    if (isTampermonkey) {
      // Tampermonkey: eval ไม่ทำงาน (sandbox) → ใช้ @updateURL ของ Tampermonkey เอง
      //    บอกผู้ใช้ไปกดใน Tampermonkey dashboard
      log('📋 Tampermonkey: กดที่ไอคอน Tampermonkey → คลิกที่สคริปต์นี้ → กดปุ่ม Update');
      log('   หรือเปิด Tampermonkey Dashboard → คลิกรูปเฟือง → Check for updates');
      // ล้าง latestVersion เพื่อหยุดกระพริบ
      latestVersion = null;
      window.open(GITHUB_RAW + '?ts=' + Date.now(), '_blank');
      return;
    }
    // Console: eval โหลดเวอร์ชั่นใหม่แทนที่เลย
    try {
      const res = await fetch(GITHUB_RAW, { cache: 'no-store' });
      if (!res.ok) { log('❌ ดาวน์โหลดล้มเหลว'); return; }
      let src = await res.text();
      try {
        window.__ASSIST = false;
        (0, eval)(src);
        log('✅ อัปเดตสำเร็จ — รบกวน reconnect เกม (ปิด-เปิดหน้า)');
      } catch (e) {
        log('⚠️ eval ล้มเหลว → เปิดลิงก์ raw URL เพื่อ copy เอง');
        latestVersion = null;   // หยุดกระพริบ
        window.open(GITHUB_RAW, '_blank');
      }
    } catch (e) { log('❌ อัปเดตล้มเหลว:', e.message); }
  }

  // ---------- bootstrap UI (รอ DOM ready) ----------
  function startUI() {
    buildUI();
    uiLoop = setInterval(() => {
      renderUI();
      sendMonitorData();   // ★ ส่งไป monitor.html
      connectRelay();      // ★ เชื่อม relay server (auto-reconnect)
      // auto-save config ทุก ~5 วิ ถ้าค่าเปลี่ยน
      const now = Date.now();
      if (now - lastAutoSaveAt > 5000) {
        lastAutoSaveAt = now;
        const snap = JSON.stringify(PERSIST_KEYS.map(k => CFG[k]));
        if (snap !== lastConfigSnapshot) { lastConfigSnapshot = snap; saveConfig(); }
      }
      // ตรวจเวอร์ชั่นจาก GitHub ทุก ~10 นาที
      if (!latestVersion && now - lastVersionCheckAt > 600000) {
        lastVersionCheckAt = now;
        checkVersion();
      }
    }, 400);
    // ตรวจเวอร์ชั่นครั้งแรกหลังเข้าเกม 5 วิ
    setTimeout(checkVersion, 5000);
    setTimeout(loadItemDB, 2000);   // โหลด item DB หลังเข้าเกม 2s
  }
  if (document.body) startUI();
  else document.addEventListener('DOMContentLoaded', startUI, { once: true });

  log('✅ ติดตั้งแล้ว — เล่นเกมตามปกติ ระบบจะเก็บของและใช้ยาให้เอง');
  log('   พิมพ์ ASSIST.help() เพื่อดูคำสั่งทั้งหมด, ASSIST.status() เพื่อดูสถานะ');
})();
