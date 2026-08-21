# 🗡️ RO Rebuild Web Assist

ผู้ช่วยเล่นเว็บ client **Ragnarok Online** (Unity WebGL / WebSocket) — ทำงานผ่าน **Tampermonkey** โดยดัก/ฉีด WebSocket ของเกมเพื่ออ่าน packet และสั่งการอัตโนมัติ พร้อม **Remote Monitor** ดู/ควบคุมจากนอกเกม + แจ้งเตือน **Telegram**

> ⚠️ เป็นสคริปต์สแตนด์อะโลน **ไม่ใช่** บอท proxy แยกต่างหาก — รันในหน้าเว็บเกมเท่านั้น

---

## ✨ ฟีเจอร์ทั้งหมด

### 🎒 พื้นฐาน

| ระบบ | ทำอะไร | Default | Mini-bar |
|---|---|---|---|
| **📦 Auto-Loot** | เก็บของจากมอนที่ **เราฆ่าเอง** — จดพิกัดฆ่า (นักธนูยิงไกล), กันของคนอื่น (blacklist 60s), warp-to-loot ของติดกำแพง | ON | 📦 |
| **💉 Auto-Heal** | ใช้ยาเมื่อ HP% ต่ำ — หลายชนิด, โหมดเรียง/สุ่ม, ตรวจ "ยาหมด" | OFF | 💉 |
| **🪑 Auto-Rest** | HP **หรือ SP** ต่ำ + ไม่โดนรุม → นั่งพัก → ฟื้นครบทั้งคู่ค่อยลุก (SP สำหรับบอทบัพ) | ON | 🪑 |
| **🎒 Inventory Popup** | เหมือนในเกม 3 แท็บ (Item/Etc/Equip) — ไอคอน + จำนวน + **ชื่อเต็ม** (`+7 Anti-Magic Helm[1]`/`Brooch of Counter`) + Attack/Weight/Level/Jobs + live-refresh + ลากย้ายได้ + ปุ่ม ขาย/ฝากเดี๋ยวนี้ | — | 🎒 |
| **🔑 Auto-Login + Refresh** | ล็อกอินใหม่อัตโนมัติ (รหัสที่เกมจำ) + เลือกตัวละคร + refresh ตอนค้าง | OFF | 🤖 |
| **📤 Backup** | Import/Export ข้อมูลทั้งหมด | — | — |

### ⚔️ ต่อสู้

| ระบบ | ทำอะไร | Default |
|---|---|---|
| **⚔️ Auto-Combat** | Progressive search, เป้าใกล้สุด/HP ต่ำสุด, claim + anti-KS, กันแย่ง, abandon/stuck handling, มอนช้า (เห็ด) ยืดเวลา, **Warp Dance** (ตีแล้ววาร์ปรอบมอน — นักเวท/นักธนู) | OFF |
| **🏃 Flee Players** | เจอผู้เล่นเข้ารัศมี → วาร์ปหนี (เปลี่ยนแมป / แมปเดิม) + cooldown — กันโดนจับว่าบอท | OFF |
| **🛡️ Guard Mode** | ยืนประจำตำแหน่ง — **ไม่หามอนเอง** ตีกลับเฉพาะมอนที่มาตี (มอนยิงไกลก็เดินเข้าไปตี) ฆ่าเสร็จกลับจุดเดิม + วาร์ปกลับถ้าตกแมป — ฐานของ**บอทบัพ** | OFF |

### 💰 เศรษฐกิจ

| ระบบ | ทำอะไร | Default |
|---|---|---|
| **💰 Auto-Sell** | ของเต็ม/ครบเวลา → วาร์ปไป NPC → ขาย (**แยก 2 รอบ** stackable → equipment กัน server ปฏิเสธทั้งก้อน) + สรุปผลจริง | OFF |
| **🏦 Auto-Storage** | ฝาก Kafra — equipment ส่ง **bag slot id** (ถอดจาก packet ตอน login), สรุป "สำเร็จ X/Y" ตามที่ server ยืนยันจริง | OFF |
| **♻️ แมปฟาร์มหมุนวน** | ตายแต่ละครั้ง → หมุนไปแมปถัดไปในรายการ (เพิ่ม/ลบ/"ใช้เลย" ได้) — เหมาะแมปมอนแรง/ผู้เล่นแย่ง | OFF |

### 🤝 บอทบัพ (Buff Bot) — ครบวงจร

| ระบบ | ทำอะไร | Default |
|---|---|---|
| **🤝 Auto-Buff Others** | บัพ/Heal **ผู้เล่นอื่น**อัตโนมัติ — ทุกคนในระยะ หรือเฉพาะรายชื่อ, ระยะ, delay ซ้ำต่อคน, **HP เป้าหมาย < %** (Heal เฉพาะคนเลือดต่ำ), รวมตัวเอง, สกิลพื้นที่ (Sanctuary) ส่งพิกัดเป้า, นั่งอยู่ก็ลุกมาบัพ + นั่งใหม่ | OFF |
| **🔁 Buff Visit (คู่บอท)** | บอท**ฟาร์ม**ย้อนกลับไปรับบัพจากบอทบัพทุก N วิ — ตั้งแมป/พิกัดจุดรับ + เวลารอ → ไปใกล้=เดิน ไกล=วาร์ป → ยืนรับ → กลับฟาร์ม**แมป+พิกัดเดิม** | OFF |
| **✨ Auto-Buff (item)** | ใช้ไอเทมบัพเป็นระยะ + countdown ข้าม session | OFF |

### 🖥️ ระบบรอบตัว

| ระบบ | ทำอะไร |
|---|---|
| **🖥️ Remote Monitor** | ดู HP/SP/แมป/มอนรุม/แผนที่(คลิกเดิน/วาร์ป/โจมตี)/Log/แชท จากเบราว์เซอร์อื่น + สั่ง toggle/ขาย/ฝาก/**กดเก็บ-ขาย-ฝากต่อ item** + popup Inventory 3 แท็บเหมือนในเกม |
| **📨 Telegram Alert** | การ์ดดรอป / หนี+**ตาย (บอกสาเหตุ: สู้กับมอนอะไร+ตำแหน่ง)** / แชทพูดถึงบอท |
| **💬 ห้องแชท** | แชทข้ามบอท/ข้ามผู้ใช้ (ส่งรูป/ไฟล์ได้) + badge ข้อความใหม่ |
| **🐞 Feedback** | ปุ่มแจ้งปัญหา/ข้อเสนอแนะ พร้อม log แนบ |

ทุกระบบเปิด/ปิดอิสระ + บันทึกลง localStorage ข้าม session

---

## 📥 วิธีตั้งค่า

### ตัวช่วย (userscript)

1. ติดตั้ง [Tampermonkey](https://www.tampermonkey.net/) → **Create a new script** → วางทั้งหมดจาก [`ro-rebuild-web-assist.user.js`](./ro-rebuild-web-assist.user.js) → **Ctrl+S**
2. รีเฟรชหน้าเกม — auto-update อัตโนมัติ

### Relay server (สำหรับ Remote Monitor / Telegram / แชท)

```bash
node relay-server.js        # ค่า default wss ที่จะรัน (deploy เอง เช่น render.com)
```

เปิด `remote-monitor.html` → ใส่ player_id (ดูได้จาก log ตอนเข้าเกม) → เชื่อมต่อ

### โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `ro-rebuild-web-assist.user.js` | ตัวช่วยหลัก (~9,000 บรรทัด) |
| `relay-server.js` | relay กลาง (monitor + Telegram + แชท + upload) |
| `remote-monitor.html` | หน้า monitor ระยะไกล |
| `db/Item/` | item DB v2 — 6 CSV (2,579 รายการ) + 6 desc + EquipmentGroups.csv |

---

## 🎮 คำสั่ง console ที่ใช้บ่อย

```javascript
ASSIST.status() / help() / config()

// Combat / เป้า
ASSIST.combatOn() / combatOff()
ASSIST.setTargetWhitelist('Poring', 'Lunatic')   // ว่าง = ทุกมอน
ASSIST.setRanged(8)                              // นักธนู

// Guard (บอทบัพยืนประจำจุด)
ASSIST.toggleGuard(true)
ASSIST.setGuardPos('izlude', 129, 88)

// สกิล — 6 โหมด: targeted / ground / aoe / self / ally / buff
ASSIST.addSkill({ skillId: 41, level: 10, ally: true, hpBelowPct: 50 })           // Heal ตัวเอง HP<50%
ASSIST.addSkill({ skillId: 44, level: 10, buffMode: true, buffNames: ['friend'], targetHpBelowPct: 90 })  // Blessing ให้คน
ASSIST.skillOn() / skillNow()

// บัพให้คนอื่น + ไปรับบัพ (คู่บอท)
ASSIST.toggleBuffOthers ? null : null           // เปิดผ่านปุ่มใน Sub-tab Skill
ASSIST.toggleBuffVisit(true)
ASSIST.setBuffVisitPos('izlude', 129, 88, 600, 20)

// เศรษฐกิจ
ASSIST.sellNow() / depositNow()
ASSIST.setSellNpc('Tool Dealer', 'izlude_in', 116, 55)
ASSIST.setKafra('Kafra Staff', 'izlude', 129, 88)

// แมป
ASSIST.useCurrentPosAsFarm() / warpToFarm()

// ข้อมูล
ASSIST.getInventory() / exportAll() / importAll(json)
```

---

## 🧠 รายละเอียดสำคัญ

### Teleport Serializer
Server รับคำสั่งวาร์ป (0x40) ห่างกัน ~3 วินาที — ยิงถี่ตัวหลังถูก**ดรอปเงียบ** (เคยทำระบบขาย/ฝากค้างเป็นนาที) → สคริปต์จัดคิว intent ล่าสุดชนะ (last-wins) แล้ว flush เมื่อครบกำหนดทุกกรณี

### Auto-Skill — 6 โหมด

| โหมด | Protocol | ตัวอย่าง |
|---|---|---|
| **targeted** | `[1d][01][targetId:4][skillId:1][level:1]` | Bash, Double Strafe |
| **ground** | `[1d][04][x:2][y:2][skillId:1][level:1]` | Arrow Shower, Sanctuary (ให้คน = พิกัดเป้า) |
| **AoE** | `[1d][05][skillId:2][level:1]` | Magnum Break |
| **self-cast** | `[1d][05]` (ไม่มี target) | Two-Hand Quicken (สกิล Self แท้) |
| **ally** | `[1d][01]` + playerId ตัวเอง | Heal/Blessing ใช้กับตัวเอง (Skills.toml Target=Ally) |
| **buff** | `[1d][01]` + playerId **คนอื่น** | บอทบัพ Heal/Blessing ให้ผู้เล่น |

เงื่อนไขต่อสกิล: SP ขั้นต่ำ · **HP ตัวเอง < %** · **HP เป้าหมาย < %** (รวมตัวเอง) · มอนขั้นต่ำ · ระยะ · cooldown · interval · **delay ซ้ำต่อคน** (buff) · รายชื่อผู้เล่น (buff) — dedupe ด้วย skillId+โหมด (Heal ally + Heal buff อยู่ด้วยกันได้)

Preset **~110 สกิล** จาก Skills.toml ของ server จริง (13 ตัวยืนยันจาก capture แล้ว)

### Equipment Inventory (ถอดจาก login packet 0x38)

ก้อน 0x13880 (stride 44) = **ของในถุง equipment** — ต่อชิ้น: refine (u8@11÷4) · **การ์ดในชิ้น** (u32@28÷4 — ยืนยัน 6/6 การ์ด) · **bag slot id** (20000+ลำดับ รวมชิ้นที่สวมอยู่ — ใช้ฝาก/ขายได้ทันที) · หาง packet = รายการ inst ของ**ชิ้นที่สวมอยู่** (0 = ช่องว่าง เช่น โล่ตอนถือดาบ 2 มือ)

### ระบบกันชนกัน (หลาย state machine)

- ตอนขาย/ฝาก: combat + wander + loot + warp-loot หยุดหมด ให้ routine เป็นเจ้าของตัวละคร
- Guard เปิด: farm-back ทั้ง 0x12 และ combatLoop หยุดดึงกลับ (กันปิงปอง)
- Buff Visit กำลังเดิน: ไม่ acquire มอนใหม่/ไม่ wander และ farm-back ไม่ดึงตอนอยู่แมปรับบัพ
- ตาย: 0x12 ไม่ warp กลับทันที (รอ post-respawn rest จบ — เคยวาร์ปกลับไปตายซ้ำใน 3 วิ)

---

## 🔧 Packet หลักที่ใช้

| Opcode | ใช้เพื่อ |
|---|---|
| `0x03` SELECT_CHAR | playerId + แมป (authoritative) |
| `0x06` SPAWN | entity + HP + ตำแหน่ง + playerId/ชื่อ |
| `0x07` MOVE | ตำแหน่ง entity/ตัวเรา + ghost มอนก่อน SPAWN |
| `0x0b` ATTACK | สั่งตี + DPS/anti-KS + ตีกลับ (victim=เรา) |
| `0x12` MAP_NAME | ชื่อแมป + warp-back มี gate กันชนครบ |
| `0x17` DAMAGE_V2 | damage → DPS/ASPD/anti-KS |
| `0x1b`+`0x36` | despawn pending + reason (5=ยังอยู่, 2=ถูกเก็บ) |
| `0x1d` SKILL | ทั้ง 6 โหมด (ตารางด้านบน) |
| `0x24` DEATH | ตาย + วิเคราะห์ฆาตกร (target + ตีเราล่าสุด) + หมุนแมปฟาร์ม |
| `0x25`/`0x27` | HP / SP |
| `0x2c` CHAT | แชท (คำว่า bot + /where) |
| `0x30` EQUIP | สวมใส่/ถอด + invIdx = slotId & 0xFF |
| `0x32` INVENTORY | stackable (sub=3 ตั้งค่า absolute) + equipment add (sub=5) + removal |
| `0x36`/`0x1b` | despawn sweeper (pending 2s ไร้ยืนยัน) |
| `0x38` MAP_DATA | zeny + **inventory+น้ำหนัก** (re-sync ทุกครั้งหลัง equip/คาฟรา) + **ก้อน equipment** |
| `0x3c` MINIMAP_MARKER | ผู้เล่น/Boss/Warp portal (flag ต่อระเบียน) |
| `0x51`/`0x52` | ของตก / สั่งเก็บ + ผล |
| `0x53`/`0x57`/`0x5b` | sell menu / ส่งขาย (แยก 2 รอบ) / ผลขาย |
| `0x4c`/`0x4d` | คุย NPC / dialog menu |
| `0x54`/`0x56` | รายการ Kafra / ฝาก-ถอย (sub=01 ฝาก, 02 ถอย + itemId ในคำตอบ) |
| `0x40` TELEPORT | วาร์ป (ผ่าน serializer) |

---

## ⚠️ ข้อควรระวัง

- ใช้กับเว็บ client **WebSocket** (Unity WebGL) เท่านั้น
- การใช้สคริปต์ช่วยเล่นอาจผิดกฎของเซิร์ฟเวอร์ — **ใช้ในความรับผิดชอบของผู้ใช้**
- ฟีเจอร์ที่ส่ง packet จริง (warp/combat/skill/บัพคนอื่น) **default OFF** — เปิดเองเมื่อพร้อม
- รหัสผ่าน Auto-Login เก็บใน localStorage (plain) — ห้ามส่งออก/แชร์เครื่อง

---

## 📜 License

MIT
