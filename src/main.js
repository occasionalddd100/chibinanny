import "./style.css";
import * as win from "./win.js";
import * as db from "./db.js";
import { say, loadSettings, saveSettings, mem, remember } from "./talk.js";
import { chat, freeModels } from "./llm.js";
import { plan } from "./plan.js";

const S = loadSettings();
const PET = () => 150 * (+S.size || 1), BUB_W = 300, PILL = 28;
const $ = id => document.getElementById(id);
const stage = $("stage"), petEl = $("pet"), body = $("body"), bubEl = $("bubble"), pillEl = $("pill"), fxEl = $("fx");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const short = (s, n = 42) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const hm = d => d.toTimeString().slice(0, 5);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "cls") el.className = v;
    else if (v !== undefined && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

// ---------- the pet's body: position, motion, bouncy animation ----------
let area = { left: 0, top: 0, right: 800, bottom: 600 };
const pet = {
  x: 0, air: 0, vy: 0, dir: 1, face: 1, scale: 1,
  move: "idle",            // idle | walk | drag | fall | summon
  anim: "idle",            // idle | walk | sit | happy | angry | sleep | drag
  t: 0, animT: 0, until: 0, target: 0, squash: 0, goal: null,
};

let tFx = 0;
function frame(dt) {
  pet.t += dt; pet.animT += dt;
  const now = performance.now() / 1000;
  const groundAnim = mode === "focus" ? "sit" : mode === "sleep" ? "sleep" : bubble?.level >= 2 ? "angry" : null;

  if (pet.move === "idle" && pet.anim !== "happy") {
    if (groundAnim) setAnim(groundAnim);
    else if (pet.anim !== "idle") setAnim("idle");
    // wander when nobody is talking and nothing is going on
    if (!bubble && mode !== "focus" && mode !== "sleep" && now > pet.until) {
      pet.target = rnd(area.left + 90, area.right - 90);
      pet.move = "walk"; setAnim("walk");
    }
  }
  if (pet.move === "walk") {
    const d = pet.target - pet.x, sp = 75 * pet.scale * dt;
    pet.dir = Math.sign(d) || 1;
    if (Math.abs(d) <= sp) { pet.x = pet.target; pet.move = "idle"; pet.until = now + rnd(6, 22); setAnim("idle"); }
    else pet.x += pet.dir * sp;
  }
  if (pet.move === "fall") {
    pet.vy -= 1800 * dt; pet.air += pet.vy * dt;
    if (pet.air <= 0) {
      pet.air = 0;
      if (pet.vy < -250) { pet.vy = -pet.vy * 0.35; pet.squash = 1; }   // bounce once or twice
      else { pet.vy = 0; pet.move = "idle"; pet.until = now + rnd(3, 8); pet.squash = 1; }
    }
  }
  if (pet.move === "summon" && pet.goal) {
    const k = 1 - Math.exp(-dt * 3.5);
    pet.x += (pet.goal.x - pet.x) * k; pet.air += (pet.goal.air - pet.air) * k; pet.scale += (pet.goal.scale - pet.scale) * k;
  } else if (pet.scale !== 1 && pet.move !== "summon") {
    pet.scale += (1 - pet.scale) * (1 - Math.exp(-dt * 4));
    if (Math.abs(pet.scale - 1) < 0.01) pet.scale = 1;
  }
  if (pet.anim === "happy" && pet.animT > 2.4) setAnim(groundAnim || "idle");
  pet.x = clamp(pet.x, area.left + 40, area.right - 40);
  pet.squash = Math.max(0, pet.squash - dt * 4);
  pet.face += ((pet.move === "walk" ? pet.dir : pet.face > 0 ? 1 : -1) - pet.face) * (1 - Math.exp(-dt * 12));

  // body transform: everything bouncy comes from here
  const a = pet.animT, T = pet.anim;
  let y = 0, rot = 0, sx = 1, sy = 1, x = 0;
  if (T === "idle") { const b = Math.sin(a * 2.4); sy = 1 + 0.03 * b; sx = 1 - 0.02 * b; rot = 1.5 * Math.sin(a * 0.9); }
  if (T === "walk") { const s = Math.abs(Math.sin(a * 7)); y = 18 * s; sy = 0.88 + 0.16 * s; sx = 1.1 - 0.12 * s; rot = 5 * pet.dir * Math.cos(a * 7); }
  if (T === "sit") { const b = Math.abs(Math.sin(a * 3.3)); y = 3 * b; rot = 3.5 * Math.sin(a * 3.3); sy = 0.96 + 0.03 * b; sx = 1.02; }
  if (T === "sleep") { const b = Math.sin(a * 1.2); sy = 0.94 + 0.03 * b; sx = 1.03 - 0.02 * b; rot = -6; }
  if (T === "happy") { const s = Math.abs(Math.sin(a * 6.5)); y = 42 * s; sy = 0.85 + 0.25 * s; sx = 1.12 - 0.15 * s; rot = a < 0.48 ? a * 750 : 6 * Math.sin(a * 13); }
  if (T === "angry") { x = 4 * Math.sin(a * 42); const s = Math.abs(Math.sin(a * 9)); sy = 1 + 0.07 * s; sx = 1 + 0.05 * s; y = 6 * s; }
  if (T === "drag") { rot = clamp(-dragVx * 0.04, -25, 25) + 4 * Math.sin(a * 8); sy = 1.08; sx = 0.94; }
  if (pet.squash) { sy *= 1 - 0.25 * pet.squash; sx *= 1 + 0.25 * pet.squash; }
  body.style.transform = `translate(${x}px, ${-y}px) rotate(${rot}deg) scale(${sx * pet.face}, ${sy})`;
  $("shadow").style.transform = `scale(${clamp(1 - (y + pet.air) / 160, 0.35, 1)})`;
  $("shadow").style.opacity = pet.air > 3 ? 0 : 1;

  // particles
  tFx -= dt;
  if (tFx <= 0) {
    if (T === "sit") { spark(["♪", "♫"][Math.random() * 2 | 0]); tFx = 1.6; }
    else if (T === "sleep") { spark("z"); tFx = 1.4; }
    else if (T === "happy") { spark(["✦", "♥", "★"][Math.random() * 3 | 0]); tFx = 0.18; }
    else if (T === "angry") { spark("!"); tFx = 0.7; }
    else tFx = 0.5;
  }
  layout();
}

function setAnim(a) { if (pet.anim !== a) { pet.anim = a; pet.animT = 0; } }
function spark(ch) {
  const P = PET() * pet.scale;
  const s = h("span", { cls: "spark" }, ch);
  s.style.left = rnd(P * 0.2, P * 0.8) + "px"; s.style.top = rnd(P * 0.05, P * 0.35) + "px";
  fxEl.append(s); setTimeout(() => s.remove(), 1600);
}

// window = tight box around the pet (+ bubble, + timer pill), so the rest of the screen stays clickable
function layout() {
  const P = PET() * pet.scale;
  const showBub = !bubEl.hidden, showPill = !pillEl.hidden;
  const bw = showBub ? Math.min(BUB_W, area.right - area.left) : 0;
  const bh = showBub ? bubEl.offsetHeight + 8 : 0;
  const ph = showPill ? PILL : 0;
  const w = Math.max(P, bw), hgt = P + bh + ph;
  const left = clamp(pet.x - w / 2, area.left, area.right - w);
  const top = Math.max(area.top, area.bottom - pet.air - hgt);
  const px = pet.x - left - P / 2;
  Object.assign(petEl.style, { left: px + "px", top: hgt - P + "px", width: P + "px", height: P + "px" });
  if (showPill) pillEl.style.cssText = `left:${clamp(px + P / 2 - 45, 0, w - 90)}px; top:${bh}px`;
  if (showBub) {
    bubEl.style.left = clamp(px + P / 2 - bw / 2, 0, w - bw) + "px"; bubEl.style.width = bw + "px";
    bubEl.style.setProperty("--tail", clamp(px + P / 2 - parseFloat(bubEl.style.left), 24, bw - 24) + "px");
  }
  if (win.native) win.place(left, top, w, hgt);
  else Object.assign(stage.style, { left: left + "px", top: top + "px", width: w + "px", height: hgt + "px" });
}

// drag with the mouse, drop and it falls back onto the taskbar
let drag = null, dragVx = 0;
petEl.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  petEl.setPointerCapture(e.pointerId);
  drag = { sx: e.screenX, sy: e.screenY, x: pet.x, air: pet.air, moved: false, lx: e.screenX };
});
petEl.addEventListener("pointermove", e => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) > 5) {
    drag.moved = true; pet.move = "drag"; setAnim("drag");
  }
  if (!drag.moved) return;
  dragVx = dragVx * 0.7 + (e.screenX - drag.lx) * 10; drag.lx = e.screenX;
  pet.x = drag.x + (e.screenX - drag.sx);
  pet.air = Math.max(0, drag.air - (e.screenY - drag.sy));
});
petEl.addEventListener("pointerup", () => {
  if (!drag) return;
  const moved = drag.moved; drag = null;
  if (!moved) return petClick();
  pet.move = "fall"; pet.vy = 0; setAnim(mode === "focus" ? "sit" : "idle");
  if (summoned) unsummon();
});
document.addEventListener("contextmenu", e => { e.preventDefault(); petClick(); });

// ---------- talking: speech bubble ----------
let bubble = null, closeTimer = 0;
function ask({ kind, text, buttons = [], input, needsAnswer = false, extra, autoClose }) {
  clearTimeout(closeTimer);
  bubble = { kind, needsAnswer, since: Date.now(), level: 1 };
  bubEl.replaceChildren();
  bubEl.append(h("div", { cls: "say" }, text));
  if (extra) bubEl.append(extra);
  if (input) {
    const f = h("form", { cls: "row" },
      h("input", { name: "v", placeholder: input.placeholder || "", autocomplete: "off" }),
      h("button", { cls: "go" }, input.button || "→"));
    f.onsubmit = e => { e.preventDefault(); const v = f.v.value.trim(); if (v) input.onSubmit(v, f); };
    bubEl.append(f);
    setTimeout(() => { win.focus(); f.v.focus(); }, 60);
  }
  if (buttons.length) bubEl.append(h("div", { cls: "btns" }, buttons.map(b =>
    h("button", { cls: b.cls || "", title: b.title, onclick: () => { answered(); b.fn(); } }, b.label))));
  bubEl.hidden = false;
  bubEl.classList.remove("pop"); void bubEl.offsetWidth; bubEl.classList.add("pop");
  if (autoClose) closeTimer = setTimeout(close, autoClose);
  return bubEl;
}
function close() { clearTimeout(closeTimer); bubble = null; bubEl.hidden = true; bubEl.replaceChildren(); }
function answered() { if (summoned) unsummon(); if (bubble) bubble.needsAnswer = false; lastAsk = Date.now(); }
const sayLine = (text, ms = 5000) => ask({ kind: "say", text, autoClose: ms });

// ---------- escalation ----------
let summoned = false;
function escalate(level) {
  if (!bubble) return;
  bubble.level = level;
  bubEl.querySelector(".say").textContent = say(S.tone, level === 2 ? "nag2" : "nag3");
  beep(level);
  if (level === 3) summon();
}
function summon() {
  summoned = true; pet.move = "summon";
  pet.goal = { x: (area.left + area.right) / 2, air: (area.bottom - area.top) / 2 - 120, scale: 1.6 };
  win.native && import("@tauri-apps/api/window").then(T => T.getCurrentWindow().setFocus());
}
function unsummon() { summoned = false; pet.goal = null; pet.move = "fall"; pet.vy = 0; }

let actx = null;
function beep(level = 1) {
  try {
    actx ||= new AudioContext();
    const notes = level >= 3 ? [880, 660, 880, 660] : level === 2 ? [660, 880] : [523, 784];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.16;
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.16);
    });
  } catch {}
}

// ---------- the brain: modes and nudges ----------
let mode = "login";                       // login | idle | focus | break | sleep
let focus = null, breakEnd = 0, lastAsk = Date.now(), chatLog = [];
const m0 = mem();
let pausedUntil = m0.pausedUntil || 0;
const softDay = () => mem().softDay === db.today();

function setMode(m) { mode = m; renderPill(); }
function renderPill() {
  const now = Date.now();
  const left = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const txt = mode === "focus" && focus ? "🎧 " + left(focus.endsAt - now) : mode === "break" ? "☕ " + left(breakEnd - now) : "";
  pillEl.hidden = !txt; pillEl.textContent = txt;
}
function quiet(d = new Date()) {
  const t = hm(d), { quietFrom: a, quietTo: b } = S;
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

async function tick() {
  renderPill();
  if (mode === "login") return;
  if (reminders()) return;
  if (await taskReminders()) return;
  const now = Date.now(), d = new Date();
  const asleep = now < pausedUntil || (quiet(d) && mode !== "focus");
  if (asleep) { if (mode !== "sleep" && mode !== "focus") { setMode("sleep"); if (bubble?.needsAnswer) close(); } return; }
  if (mode === "sleep") { setMode("idle"); lastAsk = now; }

  if (mode === "focus" && now >= focus.endsAt && bubble?.kind !== "check") return checkin();
  if (mode === "break" && now >= breakEnd) { setMode("idle"); return pick(); }
  if (hm(d) >= S.eveningAt && mem().evening !== db.today()) { remember({ evening: db.today() }); return evening(); }
  if (mode === "idle" && !bubble && mem().morning !== db.today()) { remember({ morning: db.today() }); return pick({ morning: true }); }
  if (mode === "idle" && !bubble && now - lastAsk > S.nagMin * 60e3 * (softDay() ? 3 : 1)) return pick();
  if (bubble?.needsAnswer && !softDay()) {
    const min = (now - bubble.since) / 60e3;
    if (min >= 20 && bubble.level < 3) escalate(3);
    else if (min >= 10 && bubble.level < 2) escalate(2);
  }
}

function taskButton(t, min) {
  const tag = t.due && t.due < db.today() ? " ⏰" : t.due === db.today() ? " · сегодня" : t.prio === "urgent" ? " 🔥" : "";
  return { label: short(t.text) + tag, cls: "task", title: t.text, fn: () => startFocus(t, min) };
}

async function pick({ morning = false, min } = {}) {
  lastAsk = Date.now();
  try { await db.load(); } catch (e) { return sayLine("Не достучался до задач: " + (e.message || e), 8000); }
  const soft = softDay();
  min ??= soft ? 10 : S.focusMin;
  const opener = say(S.tone, morning && !soft ? "morning" : "pick", {}, soft);
  const list = db.focusOpen();
  // the sprint from «Фокус» in Tasks, top to bottom
  if (list.length) {
    const t = list[0], all = db.focusAll().length;
    const head = db.sprint() ? `Спринт: ${all - list.length} из ${all}.` : `В фокусе ${list.length}.`;
    return ask({
      kind: "pick", needsAnswer: true, text: `${opener}\n${head} Дальше: «${short(t.text, 70)}»`,
      buttons: [
        { label: `▶ ${min} мин`, cls: "ok", fn: () => startFocus(t, min) },
        { label: "5 мин", fn: () => startFocus(t, 5) },
        { label: "Уже сделал ✓", fn: () => finish(t, "next") },
        ...(list.length > 1 ? [{ label: "Другая…", cls: "ghost", fn: () => more(list.slice(1), min) }] : []),
        { label: "Не сейчас", cls: "ghost", fn: snooze },
      ],
    });
  }
  // empty focus: ask to build a sprint, offer what is burning
  const hot = db.burning().slice(0, 3);
  ask({
    kind: "pick", needsAnswer: true,
    text: "Фокус пуст. Накидай задач в Tasks → «Фокус» и погнали." + (hot.length ? "\nИли закинь горящее:" : ""),
    buttons: [
      ...hot.map(t => ({ label: "＋ " + short(t.text), cls: "task", title: t.text, fn: async () => { try { await db.toFocus(t); } catch {} pick({ min }); } })),
      { label: "Не сейчас", cls: "ghost", fn: snooze },
    ],
  });
}
function more(list, min) {
  ask({
    kind: "pick", needsAnswer: true, text: "Какую?",
    buttons: [...list.slice(0, 8).map(t => taskButton(t, min)), { label: "Не сейчас", cls: "ghost", fn: snooze }],
  });
}
function snooze() {
  const n = (mem().excuses || 0) + 1; remember({ excuses: n });
  const line = say(n >= 3 && S.tone !== "soft" ? "hard" : S.tone, "snooze");
  sayLine(line, 3500);
}

function startFocus(t, min = S.focusMin) {
  if (!db.sprint() && typeof t.focus === "number") db.startSprint().catch(() => {});
  focus = { id: t.id, text: t.text, min, endsAt: Date.now() + min * 60e3 };
  remember({ focus, excuses: 0 });
  setMode("focus"); pet.move = "idle";
  sayLine(say(S.tone, "start", { t: short(t.text, 60) }, softDay()), 5000);
}

function checkin() {
  beep(1);
  const t = { id: focus.id, text: focus.text };
  ask({
    kind: "check", needsAnswer: true, text: say(S.tone, "check", { t: short(t.text, 60) }),
    buttons: [
      { label: "Сделал ✓", cls: "ok", fn: () => finish(t, focus.min >= 15 ? "break" : "next") },
      { label: `Ещё ${focus.min} мин`, fn: () => startFocus(t, focus.min) },
      { label: "Застрял", fn: () => stuck(t) },
      { label: "Перерыв", cls: "ghost", fn: () => takeBreak() },
    ],
  });
}

// after: "break" after a long session, "next" goes straight to the next focus task
async function finish(t, after = "break") {
  const task = db.byId(t.id) || t;
  try { await db.done(task); } catch (e) { return sayLine("Не отметилось: " + (e.message || e), 8000); }
  const m = mem(), yest = new Date(Date.now() - 864e5).toLocaleDateString("sv-SE");
  const streak = m.lastDoneDay === db.today() ? m.streak || 1 : m.lastDoneDay === yest ? (m.streak || 0) + 1 : 1;
  remember({ streak, lastDoneDay: db.today(), focus: null });
  focus = null;
  setAnim("happy"); pet.move = "idle";
  const wasFocus = typeof task.focus === "number";
  if (wasFocus && !db.focusOpen().length) {
    const n = await db.finishSprint().catch(() => 0);
    sayLine(`Спринт закрыт! Сделано: ${n} 🎉` + (streak > 1 ? ` Серия: ${streak} дн.` : ""), 9000);
    return takeBreak(true);
  }
  sayLine(say(S.tone, "done") + (streak > 1 ? ` Серия: ${streak} дн. подряд.` : ""), after === "next" ? 2500 : 5000);
  if (after === "next") { setMode("idle"); setTimeout(() => !bubble && pick(), 2600); }
  else takeBreak(true);
}
function takeBreak(quietly = false) {
  focus = null; remember({ focus: null });
  breakEnd = Date.now() + S.breakMin * 60e3; setMode("break");
  if (!quietly) sayLine(`Перерыв ${S.breakMin} мин. Потом продолжаем.`, 4000);
}
function stuck(t) {
  ask({
    kind: "stuck", needsAnswer: true, text: say(S.tone, "stuck"),
    input: {
      placeholder: "например: открыть файл и написать заголовок", button: "Го",
      onSubmit: async v => {
        answered();
        const task = db.byId(t.id) || t;
        try { const sub = await db.addSub(task, v); startFocus(sub, 10); }
        catch (e) { sayLine("Не сохранилось: " + (e.message || e), 8000); }
      },
    },
    buttons: [{ label: "Отмена", cls: "ghost", fn: () => takeBreak() }],
  });
}
async function evening() {
  try { await db.load(); } catch {}
  const n = db.doneToday().length;
  ask({ kind: "say", text: say(S.tone, "evening", { n: n || "ноль" }), autoClose: 15000 });
}

// ---------- menu (click or right click on the pet) ----------
function petClick() {
  if (mode === "login") return showLogin();
  if (bubble?.needsAnswer) { setAnim("angry"); setTimeout(() => setAnim("idle"), 600); return; }
  if (bubble && bubble.kind === "menu") return close();
  const now = Date.now();
  const status = mode === "focus" ? `Делаем: «${short(focus.text, 50)}»`
    : mode === "break" ? "Перерыв." : now < pausedUntil ? "Сплю до " + hm(new Date(pausedUntil)) + "." : "Чем займёмся?";
  const b = [];
  if (mode === "focus") {
    const t = { id: focus.id, text: focus.text };
    b.push({ label: "Сделал ✓", cls: "ok", fn: () => finish(t, "next") }, { label: "Застрял", fn: () => stuck(t) },
      { label: "Бросить", cls: "ghost", fn: () => { focus = null; remember({ focus: null }); setMode("idle"); close(); } });
  } else b.push({ label: "Взять задачу", cls: "ok", fn: () => pick() });
  b.push({ label: "Поговорить", fn: openChat }, { label: "Мне тяжело", fn: heavy });
  b.push(now < pausedUntil
    ? { label: "Проснись", fn: () => { pausedUntil = 0; remember({ pausedUntil: 0 }); setMode("idle"); pick(); } }
    : { label: "Пауза 1 ч", cls: "ghost", fn: () => pause(60) });
  b.push({ label: "⚙", cls: "ghost", title: "Настройки", fn: settings }, { label: "✕", cls: "ghost", fn: close });
  ask({ kind: "menu", text: status, buttons: b });
}
function pause(min) {
  pausedUntil = Date.now() + min * 60e3; remember({ pausedUntil });
  focus = null; remember({ focus: null }); setMode("sleep");
  sayLine("Ладно, посплю. Позови, если что 💤", 3500);
}
function heavy() {
  remember({ softDay: db.today() });
  ask({
    kind: "soft",
    text: "Понял. Сегодня без пинков и злых напоминаний. Можно одно маленькое дело, можно просто отдохнуть. Как ты?",
    buttons: [
      { label: "Одно маленькое (10 мин)", cls: "ok", fn: () => pick({ min: 10 }) },
      { label: "Поговорить", fn: openChat },
      { label: "Отдохнуть 2 ч", cls: "ghost", fn: () => pause(120) },
    ],
  });
}

// ---------- chat ----------
function openChat() {
  const log = h("div", { cls: "log" });
  const draw = () => {
    log.replaceChildren(...chatLog.slice(-8).map(m => h("div", { cls: m.act ? "act" : m.role === "user" ? "me" : "it" }, m.content)));
    log.scrollTop = log.scrollHeight;
  };
  draw();
  ask({
    kind: "chat", text: chatLog.length ? "" : "Слушаю. О чём?", extra: log,
    input: {
      placeholder: "напиши… (добавь задачу, напомни в 6:15)",
      onSubmit: async (v, f) => {
        f.v.value = ""; chatLog.push({ role: "user", content: v }); draw();
        if (!S.llmKey && S.llmUrl.includes("openrouter")) { chatLog.push({ role: "assistant", content: "Чтобы болтать, вставь ключ OpenRouter в ⚙." }); return draw(); }
        const wait = { role: "assistant", content: "…" }; chatLog.push(wait); draw(); layout();
        try {
          await db.load().catch(() => {});
          // numbered tasks the model may act on: the focus first, then the rest by urgency
          const fl = db.focusOpen(), rest = db.open().filter(t => !fl.includes(t));
          const list = [...fl, ...rest].slice(0, 30);
          const cats = db.catList().slice(0, 200);
          const d = new Date(), pad = n => String(n).padStart(2, "0");
          const ctx = {
            now: d.toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
            iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
            state: mode === "focus" ? `Марк делает «${focus.text}», осталось ${Math.round((focus.endsAt - Date.now()) / 60e3)} мин.` : softDay() ? "Сегодня Марку тяжело, мягкий режим." : "Марк сейчас без задачи.",
            tasks: list.map((t, i) => `${i + 1}. ${t.text}` + [typeof t.focus === "number" && "в фокусе", t.due && "срок " + t.due + (t.time ? " " + t.time : ""), t.prio === "urgent" && "срочно"].filter(Boolean).map(x => ` [${x}]`).join("")).join("\n"),
            cats: cats.map((c, i) => `k${i + 1}: ${c.label}`).join("\n"),
            done: db.doneToday().map(t => t.text).join("; "),
          };
          const history = chatLog.filter(m => m !== wait).map(m => ({ role: m.role, content: m.content }));
          const r = await chat(S, history, ctx);
          wait.content = r.text || (r.actions.length ? "Сделано." : "…");
          for (const a of r.actions) chatLog.push({ role: "assistant", act: true, content: await act(a, list, cats) });
        } catch (e) { wait.content = "Не смог ответить: " + (e.message || e); }
        draw(); layout();
      },
    },
    buttons: [{ label: "Закрыть", cls: "ghost", fn: close }],
  });
  if (!chatLog.length) bubEl.querySelector(".say").textContent = "Слушаю. О чём?";
}

// one @command from the model; returns the line shown in the chat
async function act(a, list, cats) {
  const pick = () => { const t = list[(+a.task || 0) - 1]; if (!t) throw new Error("нет задачи №" + a.task); return t; };
  try {
    if (a.op === "add") {
      if (!a.text) throw new Error("без текста");
      const cat = /^k\d+$/.test(a.where || "") ? cats[+a.where.slice(1) - 1]?.id : undefined;
      const t = await db.addTask(a.text, { cat, due: a.due, time: a.time, focus: a.focus });
      const where = db.catList().find(c => c.id === t.cat)?.label || "";
      return `✓ Задача «${short(t.text, 50)}»` + (t.due ? ` на ${t.due}${t.time ? " " + t.time : ""}` : "") + (t.focus ? ", в фокусе" : "") + (where ? ` → ${where}` : "");
    }
    if (a.op === "move") {
      const t = pick(), cat = cats[+String(a.where || "").slice(1) - 1]?.id;
      await db.move(t, cat);
      return `✓ Перенёс «${short(t.text, 40)}» → ${db.catList().find(c => c.id === cat)?.label}`;
    }
    if (a.op === "edit") {
      const t = pick(), f = {};
      for (const k of ["text", "due", "time"]) if (typeof a[k] === "string") f[k] = a[k];
      if (f.due === "") f.time = "";
      if (!Object.keys(f).length) throw new Error("нечего менять");
      await db.edit(t, f);
      return `✓ Изменил «${short(t.text, 40)}»` + (t.due ? `: ${t.due}${t.time ? " " + t.time : ""}` : "");
    }
    if (a.op === "done") { const t = pick(); await db.done(t); setAnim("happy"); return `✓ Сделано: «${short(t.text, 50)}»`; }
    if (a.op === "focus") { const t = pick(); await db.toFocus(t); return `✓ В фокус: «${short(t.text, 50)}»`; }
    if (a.op === "unfocus") { const t = pick(); await db.unFocus(t); return `✓ Убрал из фокуса: «${short(t.text, 50)}»`; }
    if (a.op === "remind") {
      const at = new Date(a.at).getTime();
      if (!at || isNaN(at)) throw new Error("непонятное время " + a.at);
      remember({ reminders: [...(mem().reminders || []), { at, text: a.text || "Напоминание" }] });
      return `⏰ Напомню ${new Date(at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: ${a.text || ""}`;
    }
  } catch (e) { return `✗ Не вышло (${a.op}): ${e.message || e}`; }
  return "";
}

// smart reminders from Tasks (same plan as the phone): the evening before, the morning of, an hour before, at the time.
// A Windows toast for each; Пшик also says the close ones. Tasks are re-read every 5 minutes.
let planned = [], plannedAt = 0;
async function taskReminders() {
  const now = Date.now();
  if (now - plannedAt > 5 * 60e3) {
    plannedAt = now;
    try { await db.load(); planned = plan(db.snapshot(), now - 15 * 60e3); } catch { return false; }
  }
  const fired = mem().fired || {};
  const due = planned.filter(x => x.at.getTime() <= now && !fired[x.key]);
  if (!due.length) return false;
  for (const x of due) fired[x.key] = x.at.getTime();
  // forget keys older than two days
  for (const k of Object.keys(fired)) if (fired[k] < now - 2 * 864e5) delete fired[k];
  remember({ fired });
  for (const x of due) win.notify(x.title, x.body).catch(() => {});
  const x = due[due.length - 1];
  if (bubble?.needsAnswer) return true;
  beep(x.key.startsWith("now:") ? 2 : 1);
  ask({ kind: "say", text: "🔔 " + x.title + (x.body && !x.key.startsWith("now:") ? "\n" + x.body : ""), autoClose: 30000, buttons: [{ label: "Ок", cls: "ghost", fn: close }] });
  return true;
}

// reminders set from the chat; they ring even in quiet hours, a missed one rings on the next start
function reminders() {
  const now = Date.now(), list = mem().reminders || [];
  const due = list.filter(r => r.at <= now);
  if (!due.length || bubble?.kind === "remind") return false;
  const r = due[0];
  remember({ reminders: list.filter(x => x !== list.find(y => y.at === r.at && y.text === r.text)) });
  const late = now - r.at > 10 * 60e3 ? ` (было на ${hm(new Date(r.at))})` : "";
  beep(2);
  ask({
    kind: "remind", needsAnswer: true, text: "⏰ " + r.text + late,
    buttons: [
      { label: "Ок ✓", cls: "ok", fn: close },
      { label: "Через 10 мин", fn: () => { remember({ reminders: [...(mem().reminders || []), { at: Date.now() + 10 * 60e3, text: r.text }] }); close(); } },
    ],
  });
  return true;
}

// ---------- updates ----------
// quiet when automatic; a manual check says what happened, errors included
async function checkUpdate(manual) {
  try {
    const found = await win.update(v => sayLine(`Нашёл обновление ${v}, ставлю и перезапускаюсь…`, 20000));
    if (manual && !found) sayLine(`Стоит последняя версия (${await win.version()}).`, 5000);
  } catch (e) {
    console.warn("update", e);
    if (manual) sayLine("Не получилось обновиться: " + (e?.message || e), 15000);
  }
}

// ---------- settings ----------
async function settings() {
  const auto = await win.autostart().catch(() => false);
  const ver = await win.version().catch(() => "?");
  await db.load().catch(() => {});
  const home = h("select", { name: "homeCat" }, h("option", { value: "" }, "туда же, где фокус"), db.catList().map(c => h("option", { value: c.id }, c.label)));
  home.value = S.homeCat || "";
  const field = (label, el) => h("label", { cls: "field" }, h("span", {}, label), el);
  const sel = (name, opts) => { const s = h("select", { name }, opts.map(([v, l]) => h("option", { value: v }, l))); s.value = S[name]; return s; };
  const inp = (name, type = "text", ph = "") => h("input", { name, type, placeholder: ph, value: S[name] });
  const models = h("datalist", { id: "models" });
  const model = h("input", { name: "llmModel", list: "models", placeholder: "авто: бесплатный DeepSeek", value: S.llmModel });
  const form = h("form", { cls: "settings" },
    field("Тон", sel("tone", [["soft", "мягко"], ["normal", "нормально"], ["hard", "по жопе"]])),
    field("Размер", sel("size", [["0.8", "маленький"], ["1", "обычный"], ["1.3", "большой"], ["1.6", "огромный"]])),
    field("Фокус, мин", inp("focusMin", "number")),
    field("Перерыв, мин", inp("breakMin", "number")),
    field("Пинать раз в, мин", inp("nagMin", "number")),
    field("Тишина с", inp("quietFrom", "time")),
    field("Тишина до", inp("quietTo", "time")),
    field("Итог дня в", inp("eveningAt", "time")),
    field("Новые задачи в", home),
    field("Автозапуск", h("input", { name: "auto", type: "checkbox", checked: auto })),
    field("LLM адрес", inp("llmUrl")),
    field("Ключ", inp("llmKey", "password", "sk-or-…")),
    field("Модель", model), models,
    h("div", { cls: "btns" },
      h("button", { type: "button", cls: "ghost", onclick: async () => {
        try { const ids = await freeModels({ ...S, llmUrl: form.llmUrl.value }); models.replaceChildren(...ids.slice(0, 40).map(id => h("option", { value: id }))); model.focus(); }
        catch (e) { model.placeholder = "не загрузилось: " + e.message; }
      } }, "Бесплатные модели"),
      h("button", { cls: "ok" }, "Сохранить"),
      h("button", { type: "button", cls: "ghost", onclick: () => { sayLine("Проверяю обновления…", 15000); checkUpdate(true); } }, `Обновления (v${ver})`),
      h("button", { type: "button", cls: "ghost", onclick: async () => { await db.logout(); setMode("login"); showLogin(); } }, "Выйти из аккаунта")));
  form.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    for (const k of ["focusMin", "breakMin", "nagMin"]) f[k] = Math.max(1, +f[k] || S[k]);
    const on = !!form.auto.checked; delete f.auto;
    Object.assign(S, f); saveSettings(S); db.setHomeCat(S.homeCat);
    if (on !== auto) await win.autostart(on).catch(() => {});
    sayLine("Сохранил.", 2000);
  };
  ask({ kind: "settings", text: "Настройки", extra: form });
  win.focus();
}

// ---------- login ----------
function showLogin() {
  const err = h("div", { cls: "err" });
  const form = h("form", { cls: "settings" },
    h("input", { name: "email", type: "email", placeholder: "email от Tasks", autocomplete: "username" }),
    h("input", { name: "password", type: "password", placeholder: "пароль", autocomplete: "current-password" }),
    err, h("div", { cls: "btns" }, h("button", { cls: "ok" }, "Войти")));
  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = "";
    try { await db.login(form.email.value.trim(), form.password.value); close(); started(); }
    catch (x) { err.textContent = x.message || String(x); layout(); }
  };
  ask({ kind: "login", text: "Привет, я Пшик! Войди тем же аккаунтом, что в Tasks, и я буду следить за твоими задачами.", extra: form });
  setTimeout(() => { win.focus(); form.email.focus(); }, 60);
}

function started() {
  setMode("idle"); lastAsk = Date.now();
  const f = mem().focus;
  if (f && f.endsAt > Date.now() - 3 * 3600e3) { focus = f; setMode("focus"); }
  tick();
}

// ---------- boot ----------
(async () => {
  let bootErr = null;
  db.setHomeCat(S.homeCat);
  try { await win.init(); area = await win.area(); } catch (e) { bootErr = e; }
  pet.x = area.right - 160;
  setInterval(async () => { try { area = await win.area(); } catch {} }, 30000);
  let last = performance.now();
  const loop = t => { try { frame(Math.min(0.05, (t - last) / 1000)); } catch (e) { console.error(e); } last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  layout(); await win.show();
  if (bootErr) sayLine("Что-то сломалось на старте: " + (bootErr.message || bootErr), 20000);
  win.onCall(() => { if (summoned) return; pet.x = (area.left + area.right) / 2; pet.air = 300; pet.move = "fall"; petClick(); });
  setInterval(tick, 5000);
  if (await db.session().catch(() => null)) started();
  else setTimeout(showLogin, 800);
  // updates from GitHub Releases: at start and every 6 hours, never in the middle of a focus session
  setTimeout(() => checkUpdate(false), 15000);
  setInterval(() => mode !== "focus" && checkUpdate(false), 6 * 3600e3);
})();

// for the browser preview and tests
window.__pinok = { pet, ask, pick, checkin, escalate, setAnim, get mode() { return mode; }, startFocus, heavy, settings, sayLine };
