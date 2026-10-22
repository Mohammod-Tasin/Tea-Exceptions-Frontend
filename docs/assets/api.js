"use strict";
// Shared helpers: fetch wrapper, header, Google sign-in, toast, formatting. Exposed as window.TC.
(function () {
const API = "";
const GSI = "https://accounts.google.com/gsi/client";
const $ = id => document.getElementById(id);

// DOM builder. Strings become text nodes, so untrusted API data is never parsed as HTML.
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

async function api(path, opts = {}) {
  const init = { credentials: "same-origin", method: opts.method || "GET" };
  if (init.method !== "GET") {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body || {});
  }
  try {
    const res = await fetch(API + path, init);
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return null;
  }
}

function errText(r) {
  if (!r) return "সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না";
  if (r.status === 401) return "সেশন শেষ হয়ে গেছে, আবার সাইন ইন করুন";
  if (r.status === 403) return "অনুমতি নেই";
  if (r.status === 429) return "একটু পরে চেষ্টা করুন";
  return (r.body && r.body.error) || "কিছু একটা ভুল হয়েছে";
}

let cfgP;
const getConfig = () => cfgP || (cfgP = api("/api/config").then(r => (r && r.status === 200 ? r.body : null)));
const getMe = () => api("/api/me").then(r => (r && r.status === 200 ? r.body : null));

const bn = n => new Intl.NumberFormat("bn-BD").format(n);
const fmtTime = iso => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("bn-BD", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; };
// List endpoints may return a bare array or wrap it; accept both.
const list = b => Array.isArray(b) ? b : ((b && Object.values(b).find(Array.isArray)) || []);

const DRINKS = { tea: "চা", coffee: "কফি", hotwater: "গরম পানি" };
const STATUS = { pending: "পেন্ডিং", completed: "সম্পন্ন", refunded: "ফেরত" };
const KIND = { recharge: "রিচার্জ", purchase: "ক্রয়", refund: "ফেরত", admin_adjust: "অ্যাডমিন সমন্বয়" };

let toastT;
function toast(msg, err) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg; t.className = err ? "err" : ""; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4000);
}

const badge = status => el("span", { class: "badge " + status }, STATUS[status] || status);

function table(heads, rows) {
  return el("div", { class: "tablewrap" }, el("table", {},
    el("thead", {}, el("tr", {}, heads.map(h => el("th", {}, h)))),
    el("tbody", {}, rows.map(r => el("tr", {}, r.map(c => el("td", {}, c)))))));
}

// Modal confirm. rows: [[label, value]]. Resolves true on confirm.
function confirmDialog(title, rows, { note, confirmText = "নিশ্চিত করুন", disabled } = {}) {
  return new Promise(res => {
    const d = el("dialog", {});
    d.append(el("h2", {}, title),
      el("dl", {}, rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, String(v))])),
      note && el("p", { class: "muted" }, note),
      el("button", { disabled, onclick: () => d.close("ok") }, confirmText),
      el("button", { class: "secondary", onclick: () => d.close("") }, "বাতিল"));
    d.addEventListener("close", () => { res(d.returnValue === "ok"); d.remove(); });
    document.body.append(d); d.showModal();
  });
}

// ---- Google sign-in ----
let gsiInit = false;
const gsiReady = () => window.google && google.accounts && google.accounts.id;
const waitGsi = (ms = 6000) => new Promise(res => {
  const t0 = Date.now();
  (function chk() { gsiReady() ? res(true) : Date.now() - t0 > ms ? res(false) : setTimeout(chk, 100); })();
});
const retryGsi = () => new Promise(res => document.head.append(el("script", { src: GSI, async: true, onload: () => res(true), onerror: () => res(false) })));

async function onCredential(resp) {
  const r = await api("/api/auth/google", { method: "POST", body: { credential: resp.credential } });
  if (r && r.status === 200) location.reload();
  else toast(errText(r), true);
}

function signInCard(container, cfg, intro) {
  const btn = el("div", { class: "gbtn" }), note = el("p", { class: "muted" });
  container.append(el("div", { class: "card center" }, el("p", {}, intro), btn, note));
  const show = async retry => {
    note.textContent = "";
    let ok = retry ? await retryGsi() : await waitGsi();
    ok = ok && (await waitGsi(1000)) && cfg && cfg.googleClientId;
    if (!ok) {
      note.append("গুগল সাইন-ইন লোড হয়নি। ", el("button", { class: "link", onclick: () => show(true) }, "আবার চেষ্টা করুন"));
      return;
    }
    if (!gsiInit) {
      google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: onCredential, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true });
      gsiInit = true;
    }
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    google.accounts.id.renderButton(btn, { theme: dark ? "filled_black" : "outline", size: "large", text: "signin_with", shape: "pill" });
  };
  show();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  if (gsiReady()) google.accounts.id.disableAutoSelect();
  location.href = "index.html";
}

// ---- header ----
const setCredits = n => { const b = $("bal"); if (b) b.textContent = bn(n) + " ক্রেডিট"; };

function renderHeader(me) {
  const h = $("hdr");
  h.textContent = "";
  const links = [["হোম", "index.html"]];
  if (me) links.push(["হিস্টোরি", "history.html"], ["রিচার্জ", "recharge.html"]);
  if (me && me.isAdmin) links.push(["অ্যাডমিন", "admin.html"]);
  const menu = el("nav", { id: "menu", hidden: true },
    links.map(([t, href]) => el("a", { href }, t)),
    me && el("button", { onclick: logout }, "লগআউট"));
  const toggle = el("button", { class: "menu-btn", "aria-label": "মেনু", "aria-expanded": "false", onclick: () => {
    menu.hidden = !menu.hidden; toggle.setAttribute("aria-expanded", String(!menu.hidden));
  } }, "☰");
  h.append(el("div", { class: "bar" },
    el("a", { class: "brand", href: "index.html" }, "RUET Café"),
    me && el("a", { class: "pill", id: "bal", href: "recharge.html" }),
    me && me.picture && el("img", { class: "avatar", src: me.picture, alt: "", referrerpolicy: "no-referrer" }),
    toggle), menu);
  if (me) setCredits(me.credits);
}

async function boot() {
  const [cfg, me] = await Promise.all([getConfig(), getMe()]);
  renderHeader(me);
  return { cfg, me };
}

window.TC = { $, el, api, errText, getConfig, getMe, bn, fmtTime, pick, list, DRINKS, STATUS, KIND, toast, badge, table, confirmDialog, signInCard, renderHeader, setCredits, boot };
})();
