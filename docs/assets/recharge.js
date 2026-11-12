"use strict";
(async function () {
const { $, el, api, num, fmtTime, list, payBadge, errText, setCredits } = TC;
const { cfg, me } = await TC.boot();
const app = $("app");
if (!me) return TC.signInCard(app, cfg, "Sign in to recharge your credits.");

if (!cfg || !cfg.rechargeEnabled) {
  return app.append(el("p", { class: "card msg" }, "Online recharge is not available right now. Contact an admin to add credits."));
}

const UNAVAIL = "Payment service is temporarily unavailable. Please try again later.";
const ERR = {
  not_found_yet: "We haven't received this payment yet. Check the TrxID and try again in a minute.",
  already_used: "This TrxID has already been used.",
  not_eligible: "This payment can't be used here. Please contact support.",
  too_old: "This payment is too old to add. Please contact support.",
  invalid_trx: "That doesn't look like a valid TrxID.",
  payment_service_unavailable: UNAVAIL,
  recharge_disabled: UNAVAIL,
};
const claimErr = r => (r && r.body && ERR[r.body.error]) || errText(r);

const msg = el("p", { class: "msg", hidden: true });
const say = (text, err) => { msg.hidden = false; msg.className = "msg" + (err ? " err" : ""); msg.textContent = text; };

// ---- step 1 ----
const numEl = el("div", { class: "big" }, cfg.bkashNumber || "");
const copyBtn = el("button", { type: "button", class: "small secondary", onclick: async () => {
  try { await navigator.clipboard.writeText(cfg.bkashNumber); TC.toast("Copied"); }
  catch (e) { getSelection().selectAllChildren(numEl); TC.toast("Press Ctrl+C to copy"); }
} }, "Copy");

// ---- step 3 ----
const trx = el("input", { type: "text", maxlength: "20", pattern: "[A-Z0-9]{6,20}", title: "Letters and digits only, e.g. DKC5DFEGPR", placeholder: "DKC5DFEGPR", autocomplete: "off", autocapitalize: "characters", required: true, "aria-label": "TrxID" });
trx.addEventListener("input", () => { trx.value = trx.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
const btn = el("button", { type: "submit" }, "Add credits");

function done(credits, balance, already) {
  say(already ? "This payment was already added to your account." : `✓ ${num(credits)} credits added. New balance: ${num(balance)}`);
  if (balance != null) setCredits(balance);
  trx.value = "";
  loadList();
}

async function poll(id) {
  for (let i = 0; i < 24; i++) { // 24 x 5s = 2 minutes
    await new Promise(r => setTimeout(r, 5000));
    const r = await api("/api/me/payments?limit=20");
    const p = r && r.status === 200 && list(r.body).find(x => x.trxId === id);
    if (!p || p.status === "pending") continue;
    loadList();
    if (p.status === "paid") { const m = await TC.getMe(); return done(p.credits, m ? m.credits : null); }
    const text = { not_found: ERR.not_found_yet, used: ERR.already_used, already_used: ERR.already_used, too_old: ERR.too_old, not_eligible: ERR.not_eligible }[p.status];
    return say(text || "This payment needs review. Please contact support.", true);
  }
  say("Still checking. Your credits will be added once the payment is confirmed.");
}

async function submit(e) {
  e.preventDefault();
  const id = trx.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(id)) return say(ERR.invalid_trx, true);
  btn.disabled = true; say("Checking your payment…");
  const r = await api("/api/recharge/claim", { method: "POST", body: { trxId: id } });
  if (r && r.status === 200) done(r.body.credits, r.body.balance, r.body.alreadyCredited);
  else if (r && r.status === 202) { say("Payment is being confirmed. This can take a minute — we'll keep checking."); loadList(); await poll(id); }
  else say(claimErr(r), true);
  btn.disabled = false;
}

// ---- recent recharges ----
const listBox = el("div");
async function loadList() {
  const r = await api("/api/me/payments?limit=20");
  if (!r || r.status !== 200) return listBox.replaceChildren(el("p", { class: "msg err" }, errText(r)));
  const rows = list(r.body);
  listBox.replaceChildren(...(rows.length ? rows.map(p => el("div", { class: "item" },
    el("div", {}, el("div", {}, p.trxId), el("div", { class: "muted" }, fmtTime(p.paidAt || p.createdAt))),
    el("div", { class: "side" }, [p.status === "paid" ? "+" + num(p.credits) + " " : "", payBadge(p.status)]))) : [el("p", { class: "muted center" }, "No recharges yet")]));
}

app.append(
  el("div", { class: "card center" }, el("div", { class: "muted" }, "Your balance"), el("div", { class: "big" }, num(me.credits)), el("div", { class: "muted" }, "1 Taka = 1 credit")),
  el("div", { class: "card" },
    el("h2", {}, "1. Send money with bKash to"), numEl, copyBtn, el("p", { class: "muted" }, "Any amount. 1 Taka = 1 credit."),
    el("h2", {}, "2. Copy the TrxID from the bKash confirmation SMS"), el("p", { class: "muted" }, "Example: ", el("code", {}, "TrxID DKC5DFEGPR")),
    el("h2", {}, "3. Enter the TrxID"),
    el("form", { onsubmit: submit }, trx, btn, msg)),
  el("div", { class: "card" }, el("h2", {}, "Your recent recharges"), listBox));
loadList();
})();
