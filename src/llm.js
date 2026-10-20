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
@move {"task":3,"where":"k5"} — перенести задачу в другую категорию.
@edit {"task":3,"text":"…","due":"ГГГГ-ММ-ДД","time":"ЧЧ:ММ"} — поменять текст, дату или время (только нужные поля; "due":"" убирает дату).
Если Марк называет место словами («в Pshyk / Главное / Всякое»), найди его в списке категорий и поставь where. Если просит переложить только что созданную задачу, используй @move.
@remind {"at":"ГГГГ-ММ-ДДTЧЧ:ММ","text":"…"} — напоминание от тебя на компе в это время. Если просят напомнить, ставь @remind. Если напоминание нужно и на телефоне, добавь ещё @add с due и time.
Никогда не говори, что сделал действие, если не написал команду. Не выдумывай номера задач.

Задачи (№, текст, пометки):
${ctx.tasks || "нет"}
Категории для where:
${ctx.cats || "нет"}
Сделано сегодня: ${ctx.done || "ничего"}.`;
  const headers = { "Content-Type": "application/json" };
  if (s.llmKey) headers.Authorization = "Bearer " + s.llmKey;
  // free models can hang or spend the whole budget on hidden reasoning: time out, retry once with a bigger budget
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(s.llmUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST", headers, signal: ctl.signal,
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history.slice(-12)], max_tokens: attempt ? 4000 : 1500 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || r.status);
      const content = j.choices?.[0]?.message?.content || "";
      if (content.trim()) return parse(content);
    } catch (e) {
      if (e.name !== "AbortError" || attempt) throw e.name === "AbortError" ? new Error("модель не ответила за минуту") : e;
    } finally { clearTimeout(timer); }
  }
  throw new Error("модель промолчала, попробуй ещё раз или выбери другую в ⚙");
}

// split the reply into what Mark reads and the @commands
export function parse(raw) {
  const actions = [], text = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*`?@(add|done|focus|unfocus|remind|move|edit)\s*(\{.*\})`?\s*$/);
    if (m) { try { actions.push({ op: m[1], ...JSON.parse(m[2]) }); } catch { } }
    else text.push(line);
  }
  return { text: text.join("\n").replace(/\*\*(.+?)\*\*/g, "$1").trim(), actions };
}
