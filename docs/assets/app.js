"use strict";
(async function () {
const { $, el, api, num, credits, pick, list, DRINKS, errText } = TC;

let cfg, me;
let st = {};                 // last /api/status body
let online = false, busy = false, inflight = false;
let active = null;           // {orderId, drink, deadline, t0, ending}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const price = d => (cfg && cfg.prices && cfg.prices[d]) || 0;
const priceText = d => (price(d) ? credits(price(d)) : "Free");

function say(text, err, href, linkText) {
  const m = $("msg");
  m.textContent = text || "";
  if (href) m.append(" ", el("a", { href }, linkText));
  m.className = "card msg" + (err ? " err" : "");
  m.hidden = !text;
}

// ---- machine status ----
function heatMsg() {
  const t = st.tempC == null ? "" : st.tempBelow ? ` (below ${st.tempC}°C)` : ` (about ${st.tempC}°C)`;
  return "The machine is heating up — please wait a moment." + t;
}

function renderStatus() {
  let cls = "", text = "The machine is offline right now.";
  if (online && st.machineState === "ready") [cls, text] = ["ready", "Machine ready"];
  else if (online && st.machineState === "heating") [cls, text] = ["heating", heatMsg()];
  else if (online && st.machineState === "sensor_fault") [cls, text] = ["fault", "Machine temporarily unavailable"];
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
  if (b) b.textContent = `Balance: ${credits(me.credits)}`;
  TC.setCredits(me.credits);
}

function renderAuth() {
  const a = $("auth");
  a.textContent = "";
  $("drinks").hidden = !me;
  if (!me) {
    TC.signInCard(a, cfg, "Sign in with Google to get tea, coffee or hot water with credits.");
    return;
  }
  a.append(el("div", { class: "card who" },
    me.picture && el("img", { class: "avatar", src: me.picture, alt: "", referrerpolicy: "no-referrer" }),
    el("div", {}, el("strong", {}, "Hi, " + (me.name || me.email)), el("div", { class: "muted", id: "meBal" }))));
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
  const secs = cfg && cfg.unlockSeconds ? `${cfg.unlockSeconds} seconds` : "the time limit"; // unlockSeconds is not in /api/config today; the real value arrives with the unlock response
  const ok = await TC.confirmDialog(`Unlock ${DRINKS[d]} for ${price(d) ? credits(price(d)) : "free"}?`, [], {
    note: after < 0 ? `Not enough credits. You have ${credits(me.credits)}, this costs ${credits(price(d))}.`
      : `Your balance will go from ${num(me.credits)} to ${num(after)}. After unlocking, press the ${DRINKS[d]} button on the machine within ${secs} — if you don't, your credits are refunded automatically.`,
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
    say(`Not enough credits. You have ${credits(me.credits)}, this costs ${credits(r.body.price)}.`, true, "recharge.html", "Recharge");
  } else if (r.status === 409 && err === "machine busy") say("The machine is busy — try again in a few seconds.", true);
  else if (r.status === 409 && err === "not_ready") say(heatMsg(), true);
  else if (r.status === 409) say("The machine is offline right now.", true);
  else say(errText(r), true);
  renderDrinks(); poll();
}

// ---- countdown + result ----
function renderActive() {
  const box = $("active");
  box.hidden = false;
  box.textContent = "";
  box.append(el("h2", {}, `Now press the ${DRINKS[active.drink]} button on the machine`), el("div", { class: "big", id: "secs" }), el("p", { class: "muted" }, "If you don't press it in time, your credits are refunded."));
  tick();
}

function tick() {
  const s = $("secs");
  if (active && !active.ending && s) s.textContent = num(Math.max(0, Math.ceil((active.deadline - Date.now()) / 1000)));
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
    el("h2", {}, status === "completed" ? `Enjoy your ${DRINKS[a.drink]}!` : status === "refunded" ? `Time ran out — ${credits(price(a.drink))} refunded.` : "We couldn't confirm your order."),
    status === "refunded" && reason && el("p", { class: "muted" }, reason),
    !status && el("p", { class: "muted" }, el("a", { href: "history.html" }, "Check your History")),
    el("button", { class: "secondary", onclick: () => { box.hidden = true; active = null; renderDrinks(); } }, "OK"));
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
