"use strict";
(async function () {
const { $, el, api, bn, errText } = TC;
const { cfg, me } = await TC.boot();
const app = $("app");
if (!me) return TC.signInCard(app, cfg, "রিচার্জ করতে সাইন ইন করুন।");

const msg = el("p", { class: "msg", hidden: true });

// TODO(payment): when the payment gateway is live, /api/recharge/checkout will return a
// checkout URL; redirect to it here. This is the only place that needs to change.
function handleCheckout(r) {
  if (r && r.status === 501) return "অনলাইন পেমেন্ট শিগগিরই আসছে। এখন ক্রেডিট নিতে অ্যাডমিনের সাথে যোগাযোগ করুন।";
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
  el("div", { class: "card center" }, el("div", { class: "muted" }, "বর্তমান ব্যালান্স"), el("div", { class: "big" }, bn(me.credits)), el("div", { class: "muted" }, "১ ক্রেডিট = ১ টাকা")),
  el("div", { class: "pkgs" }, pkgs.map(p => {
    const b = el("button", { onclick: () => choose(p, b) }, el("span", {}, bn(p.credits) + " ক্রেডিট"), el("small", {}, "৳ " + bn(p.bdt)));
    return b;
  })),
  pkgs.length ? null : el("p", { class: "muted center" }, "কোনো প্যাকেজ পাওয়া যায়নি"),
  el("div", { class: "card", style: "margin-top:16px" }, msg));
})();
