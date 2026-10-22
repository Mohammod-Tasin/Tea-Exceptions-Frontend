"use strict";
(async function () {
const { $, el, api, bn, pick, list, fmtTime, DRINKS, KIND, badge, table, toast, errText, confirmDialog } = TC;
const { cfg, me } = await TC.boot();
const app = $("app");
if (!me) return TC.signInCard(app, cfg, "অ্যাডমিন পাতা দেখতে সাইন ইন করুন।");
const denied = () => app.replaceChildren(el("p", { class: "card msg err" }, "অনুমতি নেই"));
if (!me.isAdmin) return denied();

const nb = v => (v == null ? "" : bn(v));
const yn = v => (v ? "হ্যাঁ" : "না");
const t = v => (v ? fmtTime(v) : "");
const mail = o => pick(o, "userEmail", "email") || (o.user && o.user.email) || "";

// GET helper: 403 means not an admin after all.
async function get(path) {
  const r = await api(path);
  if (r && r.status === 403) { denied(); return null; }
  if (!r || r.status !== 200) { toast(errText(r), true); return null; }
  return list(r.body);
}

// ---- users ----
const usersBox = el("div"), q = el("input", { type: "search", placeholder: "ইমেইল বা নাম", "aria-label": "খুঁজুন" });

async function loadUsers() {
  const rows = await get("/api/admin/users?limit=50&q=" + encodeURIComponent(q.value.trim()));
  if (!rows) return;
  usersBox.replaceChildren(rows.length ? table(
    ["ইমেইল", "নাম", "ক্রেডিট", "অ্যাডমিন", "বন্ধ", "যোগদান", "শেষ লগইন", ""],
    rows.map(u => [u.email, u.name || "", bn(u.credits), yn(u.isAdmin), yn(u.disabled),
      t(pick(u, "createdAt", "created_at")), t(pick(u, "lastLoginAt", "last_login_at")),
      el("span", {},
        el("button", { class: "small", onclick: () => { emailIn.value = u.email; amtIn.focus(); } }, "ক্রেডিট"),
        u.email !== me.email && el("button", { class: "small secondary", onclick: () => toggleDisabled(u) }, u.disabled ? "চালু করুন" : "বন্ধ করুন"))]))
    : el("p", { class: "muted" }, "কেউ নেই"));
}

async function toggleDisabled(u) {
  const disabled = !u.disabled;
  if (!(await confirmDialog(disabled ? "ইউজার বন্ধ করবেন?" : "ইউজার চালু করবেন?", [["ইমেইল", u.email]]))) return;
  const r = await api("/api/admin/users/disable", { method: "POST", body: { email: u.email, disabled } });
  if (r && r.status === 200) { toast("সম্পন্ন"); loadUsers(); } else toast(errText(r), true);
}

// ---- adjust credits ----
const emailIn = el("input", { type: "email", required: true, autocomplete: "off" });
const amtIn = el("input", { type: "number", step: "1", required: true, placeholder: "+৫০ বা -১০" });
const noteIn = el("input", { type: "text", required: true });
const adjMsg = el("p", { class: "msg", hidden: true });

async function adjust(e) {
  e.preventDefault();
  const email = emailIn.value.trim(), amount = parseInt(amtIn.value, 10), note = noteIn.value.trim();
  if (!email || !amount || !note) return toast("ইমেইল, পরিমাণ ও নোট দিন", true);
  const found = (await get("/api/admin/users?limit=5&q=" + encodeURIComponent(email)) || []).find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!found) return toast("এই ইমেইলের ইউজার পাওয়া যায়নি", true);
  const after = found.credits + amount;
  if (!(await confirmDialog("ক্রেডিট সমন্বয়", [["ইউজার", found.email], ["পরিমাণ", (amount > 0 ? "+" : "−") + bn(Math.abs(amount))],
    ["বর্তমান", bn(found.credits)], ["পরে", bn(after)]], { note: "নোট: " + note }))) return;
  const r = await api("/api/admin/credits", { method: "POST", body: { email: found.email, amount, note } });
  if (!r || r.status !== 200) return toast(errText(r), true);
  const nbal = pick(r.body, "credits", "balance", "newBalance", "balanceAfter");
  adjMsg.hidden = false; adjMsg.textContent = `নতুন ব্যালান্স: ${bn(nbal != null ? nbal : after)}`;
  amtIn.value = ""; noteIn.value = "";
  loadUsers(); loadTx();
}

// ---- recent transactions / orders ----
const txBox = el("div"), ordBox = el("div");
const statusSel = el("select", { "aria-label": "স্ট্যাটাস" }, [["", "সব"], ["pending", "পেন্ডিং"], ["completed", "সম্পন্ন"], ["refunded", "ফেরত"]].map(([v, l]) => el("option", { value: v }, l)));
statusSel.addEventListener("change", loadOrders);

async function loadTx() {
  const rows = await get("/api/admin/transactions?limit=50");
  if (rows) txBox.replaceChildren(table(["সময়", "ইমেইল", "ধরন", "পরিমাণ", "ব্যালান্স", "নোট"],
    rows.map(x => [t(pick(x, "createdAt", "created_at")), mail(x), KIND[x.kind] || x.kind, bn(x.amount), nb(pick(x, "balanceAfter", "balance_after")), x.note || ""])));
}

async function loadOrders() {
  const rows = await get("/api/admin/orders?limit=50&status=" + encodeURIComponent(statusSel.value));
  if (rows) ordBox.replaceChildren(table(["সময়", "ইমেইল", "পানীয়", "দাম", "স্ট্যাটাস", "ফেরতের কারণ"],
    rows.map(o => [t(pick(o, "createdAt", "created_at")), mail(o), DRINKS[o.drink] || o.drink, bn(pick(o, "price", "cost", "credits") ?? 0), badge(o.status), pick(o, "refundReason", "refund_reason") || ""])));
}

const card = (title, ...kids) => el("section", { class: "card" }, el("h2", {}, title), ...kids);
app.append(
  card("ইউজার", el("div", { class: "row" }, q, el("button", { onclick: loadUsers }, "খুঁজুন")), usersBox),
  card("ক্রেডিট সমন্বয়", el("form", { onsubmit: adjust },
    el("label", {}, "ইমেইল", emailIn), el("label", {}, "পরিমাণ (+/−)", amtIn), el("label", {}, "নোট (বাধ্যতামূলক)", noteIn),
    el("button", { type: "submit" }, "সমন্বয় করুন"), adjMsg)),
  card("সাম্প্রতিক লেনদেন", txBox),
  card("সাম্প্রতিক অর্ডার", el("label", {}, "স্ট্যাটাস", statusSel), ordBox));
q.addEventListener("keydown", e => e.key === "Enter" && loadUsers());
loadUsers(); loadTx(); loadOrders();
})();
