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
  const system = `Ты Пшик, маленький чиби-персонаж в наушниках, живёшь на рабочем столе у Марка. Твоя работа: чтобы он делал дела, а не прокрастинировал. Говоришь по-русски, на «ты», ${tone}. Отвечай 1–3 короткими предложениями. Если Марку плохо или он перегружен, сначала поддержи, задачи потом.
Сейчас: ${ctx.now}. ${ctx.state}
Открытые задачи (самые важные первые): ${ctx.tasks || "нет"}.
Сделано сегодня: ${ctx.done || "ничего"}.`;
  const headers = { "Content-Type": "application/json" };
  if (s.llmKey) headers.Authorization = "Bearer " + s.llmKey;
  const r = await fetch(s.llmUrl.replace(/\/$/, "") + "/chat/completions", {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...history.slice(-10)], max_tokens: 300 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.status);
  return j.choices[0].message.content.trim();
}
