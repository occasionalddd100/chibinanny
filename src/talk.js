// What Пшик says. Three tones; {t} is the task, {n} a number.
const P = {
  soft: {
    morning: ["Доброе! Вот что горит сегодня. С чего начнём?", "Привет! Выберем одно дело для начала?"],
    pick: ["Может, возьмём что-нибудь?", "Давай одну задачку, я посижу рядом.", "Чем займёмся?"],
    nag2: ["Эй, я всё ещё тут. Выберешь задачу?", "Ну пожааалуйста, одну задачу."],
    nag3: ["Я сяду тут, пока не выберешь 🙂"],
    start: ["Погнали: «{t}». Я рядом.", "Ок, «{t}». Ты справишься."],
    check: ["Время! Как там «{t}»?", "Таймер всё. «{t}» получилось?"],
    done: ["Умница! 🎉", "Есть! Ещё один шаг вперёд.", "Красота, сделано!"],
    stuck: ["Бывает. Какой самый маленький шаг на 10 минут?"],
    snooze: ["Ладно, загляну попозже."],
    evening: ["Сегодня закрыто: {n}. Отдыхай!", "Итог дня: {n}. Завтра продолжим."],
  },
  normal: {
    morning: ["Утро. Вот что горит. С чего начинаем?", "Подъём, дела ждут. Выбирай одно."],
    pick: ["Так, что делаем?", "Хватит прохлаждаться, бери задачу.", "Выбирай задачу, я засеку время."],
    nag2: ["Я жду. Задача сама себя не сделает.", "Алло! Выбери уже что-нибудь."],
    nag3: ["Всё, я сажусь посреди экрана, пока не выберешь."],
    start: ["Погнали: «{t}». Таймер пошёл.", "«{t}». Не отвлекайся, я слежу."],
    check: ["Время! «{t}» сделал?", "Ну что, «{t}» готово?"],
    done: ["Вот это я понимаю! 🎉", "Минус одна. Так держать.", "Сделано. Давай следующую."],
    stuck: ["Застрял? Назови самый маленький шаг на 10 минут."],
    snooze: ["Окей, но я вернусь.", "Ладно. Ненадолго."],
    evening: ["За сегодня: {n}. Норм. Завтра больше.", "Итог: {n}. Отдыхай."],
  },
  hard: {
    morning: ["Встал? Вот твои долги на сегодня. Выбирай.", "Утро. Хватит листать ленту, выбирай задачу."],
    pick: ["Ну и чем ты занят? Бери задачу.", "Опять ничего не делаешь? Выбирай.", "Работаем. Выбирай задачу, живо."],
    nag2: ["Я ВСЁ ЕЩЁ ЖДУ.", "Серьёзно? Выбери задачу, это одна кнопка.", "Сам себе обещал. Выбирай."],
    nag3: ["Всё. Сижу тут, пока не возьмёшь задачу."],
    start: ["«{t}». Таймер пошёл. Не сливайся.", "Погнали: «{t}». Увижу ютуб — укушу."],
    check: ["Время вышло. «{t}» сделал или опять?", "Отчитывайся: «{t}»?"],
    done: ["Ну наконец-то! 🎉", "Можешь, когда хочешь.", "Вот. А ныл."],
    stuck: ["Застрял — дроби. Самый маленький шаг на 10 минут, пиши."],
    snooze: ["Ладно. Но я запомнил.", "Отмазка засчитана. Последняя."],
    evening: ["За сегодня: {n}. Завтра не расслабляйся.", "Итог: {n}. Мало? Завтра больше."],
  },
};
const SOFTDAY = {
  pick: ["Без спешки. Хочешь одно маленькое дело? Можно и отдохнуть."],
  start: ["Хорошо, «{t}», всего 10 минут. Не получится — тоже ок."],
};

export function say(tone, key, vars = {}, softDay = false) {
  const list = (softDay && SOFTDAY[key]) || P[tone]?.[key] || P.normal[key];
  const s = list[Math.floor(Math.random() * list.length)];
  return s.replace("{t}", vars.t ?? "").replace("{n}", vars.n ?? "");
}

const KEY = "pinok.settings";
export const DEFAULTS = {
  tone: "normal", size: "1", focusMin: 25, breakMin: 5, nagMin: 20, quietFrom: "23:00", quietTo: "09:00", eveningAt: "21:30",
  llmUrl: "https://openrouter.ai/api/v1", llmKey: "", llmModel: "",
};
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

// small persistent memory: streak, last morning/evening, the current focus (survives a restart)
const MEM = "pinok.mem";
export function mem() { try { return JSON.parse(localStorage.getItem(MEM) || "{}"); } catch { return {}; } }
export function remember(patch) { try { localStorage.setItem(MEM, JSON.stringify({ ...mem(), ...patch })); } catch {} }
