// Chat through any OpenAI-compatible API: OpenRouter free models by default, Ollama works too
// (url http://localhost:11434/v1, no key). Only task titles are sent, never notes.

export async function freeModels(s) {
  const r = await fetch(s.llmUrl.replace(/\/$/, "") + "/models");
  const { data } = await r.json();
  const ids = data.map(m => m.id);
  const free = ids.filter(id => id.endsWith(":free"));
  return free.length ? free.sort((a, b) => (b.includes("deepseek") - a.includes("deepseek"))) : ids;
}

export async function chat(s, history, ctx) {
  let model = s.llmModel;
  if (!model) model = (await freeModels(s))[0];
  const tone = { soft: "мягко и тепло", normal: "по-дружески, с подколками", hard: "жёстко, с сарказмом, но без оскорблений" }[s.tone];
  const system = `Ты Пшик, маленький чиби-персонаж в наушниках, живёшь на рабочем столе у Марка. Твоя работа: чтобы он делал дела, а не прокрастинировал. Говоришь по-русски, на «ты», ${tone}. Отвечай 1–3 короткими предложениями, без markdown. Если Марку плохо или он перегружен, сначала поддержи, задачи потом.
Сейчас: ${ctx.now} (${ctx.iso}). ${ctx.state}

Ты можешь действовать в приложении задач Tasks. Чтобы сделать действие, напиши в ответе отдельную строку-команду, по одной на действие. Марк их не увидит, он увидит результат:
@add {"text":"…","due":"ГГГГ-ММ-ДД","time":"ЧЧ:ММ","focus":true,"where":"k2"} — новая задача. due, time, focus, where необязательны. where — категория из списка ниже, без него задача пойдёт к задачам фокуса. due+time дают уведомление на телефон.
@done {"task":3} — отметить задачу №3 сделанной.
@focus {"task":3} / @unfocus {"task":3} — добавить в Фокус или убрать из него.
@remind {"at":"ГГГГ-ММ-ДДTЧЧ:ММ","text":"…"} — напоминание от тебя на компе в это время. Если просят напомнить, ставь @remind. Если напоминание нужно и на телефоне, добавь ещё @add с due и time.
Никогда не говори, что сделал действие, если не написал команду. Не выдумывай номера задач.

Задачи (№, текст, пометки):
${ctx.tasks || "нет"}
Категории для where:
${ctx.cats || "нет"}
Сделано сегодня: ${ctx.done || "ничего"}.`;
  const headers = { "Content-Type": "application/json" };
  if (s.llmKey) headers.Authorization = "Bearer " + s.llmKey;
  const r = await fetch(s.llmUrl.replace(/\/$/, "") + "/chat/completions", {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history.slice(-10)], max_tokens: 500 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.status);
  return parse(j.choices[0].message.content || "");
}

// split the reply into what Mark reads and the @commands
export function parse(raw) {
  const actions = [], text = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*`?@(add|done|focus|unfocus|remind)\s*(\{.*\})`?\s*$/);
    if (m) { try { actions.push({ op: m[1], ...JSON.parse(m[2]) }); } catch { } }
    else text.push(line);
  }
  return { text: text.join("\n").replace(/\*\*(.+?)\*\*/g, "$1").trim(), actions };
}
