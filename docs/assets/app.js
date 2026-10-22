"use strict";
(async function () {
const { $, el, api, bn, pick, list, DRINKS, errText } = TC;

let cfg, me;
let st = {};                 // last /api/status body
let online = false, busy = false, inflight = false;
let active = null;           // {orderId, drink, deadline, t0, ending}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const price = d => (cfg && cfg.prices && cfg.prices[d]) || 0;
const priceText = d => (price(d) ? `${bn(price(d))} ক্রেডিট` : "ফ্রি");

function say(text, err, href, linkText) {
  const m = $("msg");
  m.textContent = text || "";
  if (href) m.append(" ", el("a", { href }, linkText));
  m.className = "card msg" + (err ? " err" : "");
  m.hidden = !text;
}

// ---- machine status ----
function heatMsg() {
  const t = st.tempC == null ? "" : st.tempBelow ? ` ≈ ${st.tempC}°C-এর নিচে` : ` ≈ ${st.tempC}°C`;
  return "পানি গরম হচ্ছে, একটু অপেক্ষা করুন" + t;
}

function renderStatus() {
  let cls = "", text = "Machine offline";
  if (online && st.machineState === "ready") [cls, text] = ["ready", "মেশিন প্রস্তুত"];
  else if (online && st.machineState === "heating") [cls, text] = ["heating", heatMsg()];
  else if (online && st.machineState === "sensor_fault") [cls, text] = ["fault", "মেশিন সাময়িকভাবে বন্ধ"];
  $("dot").className = online ? "on" : "off";
  $("status").className = "card " + cls;
  $("statusText").textContent = text;
}

function renderDrinks() {
  const ready = online && st.machineState === "ready";
  document.querySelectorAll("#drinks button").forEach(b => (b.disabled = !ready || busy || inflight || !!active));
}

// ---- signed-in / signed-out area ----
function setBalance() {
  const b = $("meBal");
  if (b) b.textContent = `ব্যালান্স: ${bn(me.credits)} ক্রেডিট`;
  TC.setCredits(me.credits);
}

function renderAuth() {
  const a = $("auth");
  a.textContent = "";
  $("drinks").hidden = !me;
  if (!me) {
    TC.signInCard(a, cfg, "ক্রেডিট দিয়ে চা, কফি বা গরম পানি নিতে গুগল দিয়ে সাইন ইন করুন।");
    return;
  }
  a.append(el("div", { class: "card who" },
    me.picture && el("img", { class: "avatar", src: me.picture, alt: "", referrerpolicy: "no-referrer" }),
    el("div", {}, el("strong", {}, "হ্যালো, " + (me.name || me.email)), el("div", { class: "muted", id: "meBal" }))));
  setBalance();
}

function buildDrinks() {
  const box = $("drinks");
  box.className = "card";
  for (const d of ["tea", "coffee", "hotwater"]) {
    box.append(el("button", { class: "drink", "data-drink": d, disabled: true, onclick: () => ask(d) },
      el("span", {}, DRINKS[d]), el("small", {}, priceText(d))));
  }
}

async function refreshMe() {
  const r = await api("/api/me");
  me = r && r.status === 200 ? r.body : r && r.status === 401 ? null : me;
}

// ---- buying ----
async function ask(d) {
  if (inflight || active || !me) return;
  const after = me.credits - price(d);
  const ok = await TC.confirmDialog(`${DRINKS[d]} নেবেন?`, [
    ["পানীয়", DRINKS[d]], ["দাম", priceText(d)],
    ["বর্তমান ব্যালান্স", `${bn(me.credits)} ক্রেডিট`], ["পরে ব্যালান্স", `${bn(Math.max(after, 0))} ক্রেডিট`],
  ], {
    note: after < 0 ? "ক্রেডিট যথেষ্ট নয়, আগে রিচার্জ করুন।"
      : `আনলক হলে মেশিনে গিয়ে বাটন চাপুন। ${cfg && cfg.unlockSeconds ? bn(cfg.unlockSeconds) + " সেকেন্ডের" : "নির্দিষ্ট সময়ের"} মধ্যে না চাপলে ক্রেডিট অটোমেটিক ফেরত আসবে।`, // unlockSeconds is not in /api/config today; the real value arrives with the unlock response
    disabled: after < 0,
  });
  if (ok) unlock(d);
}

async function unlock(d) {
  if (inflight) return;
  inflight = true; renderDrinks(); say("");
  const r = await api("/api/unlock", { method: "POST", body: { drink: d } });
  inflight = false;
  const err = r && r.body && r.body.error;
  if (!r) say(errText(r), true);
  else if (r.status === 200) {
    me.credits = r.body.credits; setBalance();
    active = { orderId: r.body.orderId, drink: d, t0: Date.now(), deadline: Date.now() + r.body.seconds * 1000 };
    busy = true; renderActive();
  } else if (r.status === 401) {
    me = null; TC.renderHeader(null); renderAuth(); say(errText(r), true);
  } else if (r.status === 402) {
    if (r.body.credits != null) { me.credits = r.body.credits; setBalance(); }
    say(`ক্রেডিট যথেষ্ট নয় (ব্যালান্স ${bn(me.credits)}, দাম ${bn(r.body.price)}).`, true, "recharge.html", "রিচার্জ করুন");
  } else if (r.status === 409 && err === "machine busy") say("অন্য কেউ ব্যবহার করছে, একটু পরে চেষ্টা করুন", true);
  else if (r.status === 409 && err === "not_ready") say(heatMsg(), true);
  else if (r.status === 409) say("Machine is offline", true);
  else say(errText(r), true);
  renderDrinks(); poll();
}

// ---- countdown + result ----
function renderActive() {
  const box = $("active");
  box.hidden = false;
  box.textContent = "";
  box.append(el("h2", {}, `এখন মেশিনে ${DRINKS[active.drink]} বাটন চাপুন`), el("div", { class: "big", id: "secs" }), el("p", { class: "muted" }, "সময় শেষ হলে ক্রেডিট ফেরত আসবে"));
  tick();
}

function tick() {
  const s = $("secs");
  if (active && !active.ending && s) s.textContent = bn(Math.max(0, Math.ceil((active.deadline - Date.now()) / 1000)));
}
setInterval(tick, 250);

async function finish() {
  const a = active;
  a.ending = true;
  let order;
  for (let i = 0; i < 4; i++) {
    await refreshMe();
    const r = await api("/api/me/orders?limit=5");
    order = list(r && r.body).find(o => String(pick(o, "id", "orderId")) === String(a.orderId));
    if (order && pick(order, "status") !== "pending") break;
    await sleep(1500);
  }
  if (me) setBalance();
  const status = order && pick(order, "status");
  const reason = order && pick(order, "refundReason", "refund_reason");
  const box = $("active");
  box.textContent = "";
  box.append(
    el("h2", {}, status === "completed" ? "✅ অর্ডার সম্পন্ন হয়েছে" : status === "refunded" ? "↩️ ক্রেডিট ফেরত দেওয়া হয়েছে" : "অর্ডারের অবস্থা নিশ্চিত করা যায়নি"),
    status === "refunded" && reason && el("p", { class: "muted" }, reason),
    !status && el("p", { class: "muted" }, el("a", { href: "history.html" }, "হিস্টোরি দেখুন")),
    el("button", { class: "secondary", onclick: () => { box.hidden = true; active = null; renderDrinks(); } }, "ঠিক আছে"));
}

// ---- polling: 1 s while ready/active, 3 s otherwise ----
async function poll() {
  const r = await api("/api/status");
  if (r && r.status === 200) { st = r.body; online = !!st.online; busy = !!st.busy; }
  else { st = {}; online = false; busy = false; }
  renderStatus(); renderDrinks();
  // ignore "not busy" right after unlock: the status may not have caught up yet
  if (active && !active.ending && Date.now() - active.t0 > 2000 && !busy) finish();
}

const boot = TC.boot();
(async function loop() {
  await poll();
  setTimeout(loop, active || (online && st.machineState === "ready") ? 1000 : 3000);
})();
({ cfg, me } = await boot);
buildDrinks(); renderAuth(); renderDrinks();
})();
