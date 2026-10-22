"use strict";
(async function () {
const { $, el, api, num, credits, pick, list, fmtTime, DRINKS, KIND, badge, errText } = TC;
const { cfg, me } = await TC.boot();
const app = $("app");
if (!me) return TC.signInCard(app, cfg, "Sign in to see your history.");

const item = (title, meta, side) => el("div", { class: "item" }, el("div", {}, el("div", {}, title), el("div", { class: "muted" }, meta)), el("div", { class: "side" }, side));

const views = {
  orders: {
    label: "Orders", path: "/api/me/orders?limit=20", empty: "No orders yet",
    row: o => {
      const p = pick(o, "price", "cost", "credits") || 0, reason = pick(o, "refundReason", "refund_reason");
      return item(DRINKS[o.drink] || o.drink,
        [fmtTime(pick(o, "createdAt", "created_at")), reason && "· " + reason].filter(Boolean).join(" "),
        [p ? credits(p) + " " : "Free ", badge(o.status)]);
    },
  },
  tx: {
    label: "Transactions", path: "/api/me/transactions?limit=50", empty: "No transactions yet",
    row: t => {
      const amt = Number(t.amount) || 0, bal = pick(t, "balanceAfter", "balance_after");
      return item(KIND[t.kind] || t.kind,
        [fmtTime(pick(t, "createdAt", "created_at")), bal != null && `Balance ${num(bal)}`, t.note].filter(Boolean).join(" · "),
        el("span", { class: amt < 0 ? "minus" : "plus" }, (amt < 0 ? "−" : "+") + num(Math.abs(amt))));
    },
  },
};

const tabs = el("div", { class: "tabs", role: "tablist" });
const body = el("div", { class: "card" });
app.append(tabs, body);

async function show(key) {
  tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.k === key)));
  const v = views[key];
  body.textContent = "Loading…";
  const r = await api(v.path);
  body.textContent = "";
  if (!r || r.status !== 200) return body.append(el("p", { class: "msg err" }, errText(r)));
  const rows = list(r.body);
  if (!rows.length) body.append(el("p", { class: "muted center" }, v.empty));
  rows.forEach(x => body.append(v.row(x)));
}

for (const [k, v] of Object.entries(views)) tabs.append(el("button", { role: "tab", "data-k": k, onclick: () => show(k) }, v.label));
show("orders");
})();
