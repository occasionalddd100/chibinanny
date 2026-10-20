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

let all = [];
export async function load() {
  const { data } = chk(await sb.from("docs").select("id,data,owner").eq("coll", "tasks"));
  all = data.map(r => ({ ...r.data, id: r.id, _owner: r.owner }));
  return all;
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
export const urgentCount = () => open().filter(t => rank(t) <= 3).length;
export const doneToday = () => all.filter(t => t.done && t.doneOn === today() && (t.doneBy || t._owner) === me);

export async function done(t) {
  const f = { done: true, doneOn: today(), doneBy: me };
  chk(await sb.rpc("merge_doc", { c: "tasks", i: t.id, f }));
  Object.assign(t, f);
}

export async function addSub(t, text) {
  const kids = all.filter(x => x.parent === t.id);
  const data = { text, cat: t.cat, parent: t.id, order: Math.max(0, ...kids.map(x => x.order || 0)) + 1, done: false };
  const id = rid();
  chk(await sb.from("docs").insert({ coll: "tasks", id, data }));
  const sub = { ...data, id, _owner: me };
  all.push(sub);
  return sub;
}
