// The same Supabase as the Tasks app: table `docs`, collection `tasks`. Nothing new is created
// besides subtasks Mark names when he is stuck.
import { createClient } from "@supabase/supabase-js";

const SB_URL = "https://hhqxiwiodbowvnbrahsf.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXhpd2lvZGJvd3ZuYnJhaHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDgyMzQsImV4cCI6MjEwNzcyNDIzNH0.j0_v9nyuqldNVXpQFLU8Z1xDS_9COPgW3c2cqCzOGK4";
export const sb = createClient(SB_URL, SB_KEY);

export const today = () => new Date().toLocaleDateString("sv-SE");
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const chk = r => { if (r.error) throw r.error; return r; };

export let me = null;
export async function session() {
  const { data } = await sb.auth.getSession();
  me = data.session?.user?.id || null;
  return me;
}
export async function login(email, password) {
  const { data } = chk(await sb.auth.signInWithPassword({ email, password }));
  me = data.user.id;
}
export async function logout() { await sb.auth.signOut(); me = null; }

let all = [], prefs = {};
export async function load() {
  const { data } = chk(await sb.from("docs").select("coll,id,data,owner").in("coll", ["tasks", "prefs"]));
  all = data.filter(r => r.coll === "tasks").map(r => ({ ...r.data, id: r.id, _owner: r.owner }));
  prefs = data.find(r => r.coll === "prefs" && r.id === me + ":prefs")?.data || {};
  return all;
}

// Фокус from Tasks: tasks with a numeric `focus` (their place in the list); the sprint is prefs.sprint
const inFocus = t => typeof t.focus === "number";
export const focusOpen = () => all.filter(t => inFocus(t) && !t.done).sort((a, b) => a.focus - b.focus);
export const focusAll = () => all.filter(inFocus);
export const sprint = () => prefs.sprint || null;
async function putPrefs(f) {
  const id = me + ":prefs";
  const r = await sb.from("docs").insert({ coll: "prefs", id, data: f });
  if (r.error?.code === "23505") chk(await sb.rpc("merge_doc", { c: "prefs", i: id, f }));
  else chk(r);
  prefs = { ...prefs, ...f };
}
export const startSprint = () => putPrefs({ sprint: { start: new Date().toISOString() } });
export async function finishSprint() {
  const done = focusAll().filter(t => t.done);
  await Promise.all(done.map(t => sb.rpc("merge_doc", { c: "tasks", i: t.id, f: { focus: null } })));
  await putPrefs({ sprint: null });
  return done.length;
}
export async function toFocus(t) {
  const focus = Math.max(0, ...focusAll().map(x => x.focus)) + 1;
  chk(await sb.rpc("merge_doc", { c: "tasks", i: t.id, f: { focus } }));
  t.focus = focus;
}
export const byId = id => all.find(t => t.id === id);

const mine = t => (t.assignee ? t.assignee === me : t._owner === me);

// lower is more urgent: overdue, due today, "urgent", «Ближайшее», due this week, the rest
function rank(t) {
  const d = today();
  if (t.due && t.due < d) return 0;
  if (t.due === d) return 1;
  if (t.prio === "urgent") return 2;
  if (t.prio === "today") return 3;
  if (t.due && t.due <= addDays(6)) return 4;
  return 5;
}

// open tasks to offer, best first. A task with open subtasks is skipped: its subtasks are offered instead.
export function open() {
  const hasOpenKids = new Set(all.filter(t => t.parent && !t.done).map(t => t.parent));
  return all
    .filter(t => !t.done && !t.hidden && t.text?.trim() && mine(t) && !hasOpenKids.has(t.id))
    .sort((a, b) => rank(a) - rank(b) || (a.due || "9").localeCompare(b.due || "9") || (a.order ?? 999) - (b.order ?? 999));
}
export const burning = () => open().filter(t => rank(t) <= 2 && typeof t.focus !== "number");
export const doneToday = () => all.filter(t => t.done && t.doneOn === today() && (t.doneBy || t._owner) === me);

export async function done(t) {
  const f = { done: true, doneOn: today(), doneBy: me };
  chk(await sb.rpc("merge_doc", { c: "tasks", i: t.id, f }));
  Object.assign(t, f);
}

export async function addSub(t, text) {
  const kids = all.filter(x => x.parent === t.id);
  const data = { text, cat: t.cat, parent: t.id, order: Math.max(0, ...kids.map(x => x.order || 0)) + 1, done: false };
  // a step of a focus task goes into the focus right before it
  if (inFocus(t)) data.focus = t.focus - 0.5;
  const id = rid();
  chk(await sb.from("docs").insert({ coll: "tasks", id, data }));
  const sub = { ...data, id, _owner: me };
  all.push(sub);
  return sub;
}
