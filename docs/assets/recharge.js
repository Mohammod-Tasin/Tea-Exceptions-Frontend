"use strict";
(async function () {
const { $, el, api, num, credits, errText } = TC;
const { cfg, me } = await TC.boot();
const app = $("app");
if (!me) return TC.signInCard(app, cfg, "Sign in to recharge your credits.");

const msg = el("p", { class: "msg", hidden: true });

// TODO(payment): when the payment gateway is live, /api/recharge/checkout will return a
// checkout URL; redirect to it here. This is the only place that needs to change.
function handleCheckout(r) {
  if (r && r.status === 501) return "Online payment is coming soon. For now, contact an admin to add credits.";
  return errText(r);
}

async function choose(p, btn) {
  btn.disabled = true;
  const r = await api("/api/recharge/checkout", { method: "POST", body: { credits: p.credits } });
  btn.disabled = false;
  msg.hidden = false; msg.className = "msg err"; msg.textContent = handleCheckout(r);
}

const pkgs = (cfg && cfg.rechargePackages) || [];
app.append(
  el("div", { class: "card center" }, el("div", { class: "muted" }, "Your balance"), el("div", { class: "big" }, num(me.credits)), el("div", { class: "muted" }, "1 credit = 1 BDT")),
  el("div", { class: "pkgs" }, pkgs.map(p => {
    const b = el("button", { onclick: () => choose(p, b) }, el("span", {}, credits(p.credits)), el("small", {}, num(p.bdt) + " BDT"));
    return b;
  })),
  pkgs.length ? null : el("p", { class: "muted center" }, "No recharge packages available right now"),
  el("div", { class: "card", style: "margin-top:16px" }, msg));
})();
