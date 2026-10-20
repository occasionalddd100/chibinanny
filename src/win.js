// Thin layer over the Tauri window. In a plain browser (preview, tests) every call is a no-op
// and the "screen" is the browser viewport, so the pet can be tried without building the app.
export const native = !!window.__TAURI_INTERNALS__;

// module namespaces are frozen, so the event API lives in its own variable
let T = null, E = null;
export async function init() {
  if (!native) return;
  T = await import("@tauri-apps/api/window");
  E = await import("@tauri-apps/api/event");
}

// work area of the monitor in logical px (screen minus the taskbar)
export async function area() {
  if (!native) return { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const m = (await T.currentMonitor()) || (await T.primaryMonitor());
  const s = m.scaleFactor, a = m.workArea || { position: m.position, size: m.size };
  return { left: a.position.x / s, top: a.position.y / s, right: (a.position.x + a.size.width) / s, bottom: (a.position.y + a.size.height) / s };
}

let last = { x: NaN, y: NaN, w: NaN, h: NaN };
export function place(x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (!native) return;
  const win = T.getCurrentWindow();
  if (w !== last.w || h !== last.h) win.setSize(new T.LogicalSize(w, h));
  if (x !== last.x || y !== last.y) win.setPosition(new T.LogicalPosition(x, y));
  last = { x, y, w, h };
}

export const show = () => native && T.getCurrentWindow().show();
export const focus = () => native && T.getCurrentWindow().setFocus();
export const onCall = f => native && E.listen("call", f);

export async function autostart(on) {
  if (!native) return false;
  const a = await import("@tauri-apps/plugin-autostart");
  if (on === undefined) return a.isEnabled();
  await (on ? a.enable() : a.disable());
  return on;
}

// new release on GitHub: download, install and restart (the NSIS installer runs passively)
export async function version() {
  if (!native) return "dev";
  return (await import("@tauri-apps/api/app")).getVersion();
}
export async function update(onFound) {
  if (!native) return false;
  const { check } = await import("@tauri-apps/plugin-updater");
  const u = await check();
  if (!u) return false;
  onFound?.(u.version);
  await u.downloadAndInstall();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

// Windows toast (in a plain browser: the web Notification, if allowed)
export async function notify(title, body) {
  if (!native) { if (window.Notification?.permission === "granted") new Notification(title, { body }); return; }
  const n = await import("@tauri-apps/plugin-notification");
  if (!(await n.isPermissionGranted()) && (await n.requestPermission()) !== "granted") return;
  n.sendNotification({ title, body });
}
