"use strict";
(async function () {
const { $, el, api, num, pick, list, fmtTime, DRINKS, KIND, badge, table, toast, errText, confirmDialog } = TC;
const { cfg, me } = await TC.boot();
const app = $("app");
if (!me) return TC.signInCard(app, cfg, "Sign in to view the admin page.");
const denied = () => app.replaceChildren(el("p", { class: "card msg err" }, "You don't have permission to view this page."));
if (!me.isAdmin) return denied();

const nb = v => (v == null ? "" : num(v));
const yn = v => (v ? "Yes" : "No");
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
const usersBox = el("div"), q = el("input", { type: "search", placeholder: "Email or name", "aria-label": "Search" });

async function loadUsers() {
  const rows = await get("/api/admin/users?limit=50&q=" + encodeURIComponent(q.value.trim()));
  if (!rows) return;
  usersBox.replaceChildren(rows.length ? table(
    ["Email", "Name", "Credits", "Admin", "Disabled", "Joined", "Last login", ""],
    rows.map(u => [u.email, u.name || "", num(u.credits), yn(u.isAdmin), yn(u.disabled),
      t(pick(u, "createdAt", "created_at")), t(pick(u, "lastLoginAt", "last_login_at")),
      el("span", {},
        el("button", { class: "small", onclick: () => { emailIn.value = u.email; amtIn.focus(); } }, "Credits"),
        u.email !== me.email && el("button", { class: "small secondary", onclick: () => toggleDisabled(u) }, u.disabled ? "Enable" : "Disable"))]))
    : el("p", { class: "muted" }, "No users found"));
}

async function toggleDisabled(u) {
  const disabled = !u.disabled;
  if (!(await confirmDialog(disabled ? "Disable this user?" : "Enable this user?", [["Email", u.email]]))) return;
  const r = await api("/api/admin/users/disable", { method: "POST", body: { email: u.email, disabled } });
  if (r && r.status === 200) { toast("Done"); loadUsers(); } else toast(errText(r), true);
}

// ---- adjust credits ----
const emailIn = el("input", { type: "email", required: true, autocomplete: "off" });
const amtIn = el("input", { type: "number", step: "1", required: true, placeholder: "e.g. 50 or -10" });
const noteIn = el("input", { type: "text", required: true });
const adjMsg = el("p", { class: "msg", hidden: true });

async function adjust(e) {
  e.preventDefault();
  const email = emailIn.value.trim(), amount = parseInt(amtIn.value, 10), note = noteIn.value.trim();
  if (!email || !amount || !note) return toast("Please enter an email, an amount and a note.", true);
  const found = (await get("/api/admin/users?limit=5&q=" + encodeURIComponent(email)) || []).find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!found) return toast("No user found with that email.", true);
  const after = found.credits + amount;
  if (!(await confirmDialog("Adjust credits", [["User", found.email], ["Amount", (amount > 0 ? "+" : "−") + num(Math.abs(amount))],
    ["Current balance", num(found.credits)], ["New balance", num(after)]], { note: "Note: " + note }))) return;
  const r = await api("/api/admin/credits", { method: "POST", body: { email: found.email, amount, note } });
  if (!r || r.status !== 200) return toast(errText(r), true);
  const nbal = pick(r.body, "credits", "balance", "newBalance", "balanceAfter");
  adjMsg.hidden = false; adjMsg.textContent = `New balance: ${num(nbal != null ? nbal : after)}`;
  amtIn.value = ""; noteIn.value = "";
  loadUsers(); loadTx();
}

// ---- recent transactions / orders ----
const txBox = el("div"), ordBox = el("div");
const statusSel = el("select", { "aria-label": "Status" }, [["", "All"], ["pending", "Pending"], ["completed", "Completed"], ["refunded", "Refunded"]].map(([v, l]) => el("option", { value: v }, l)));
statusSel.addEventListener("change", loadOrders);

async function loadTx() {
  const rows = await get("/api/admin/transactions?limit=50");
  if (rows) txBox.replaceChildren(table(["Time", "Email", "Type", "Amount", "Balance", "Note"],
    rows.map(x => [t(pick(x, "createdAt", "created_at")), mail(x), KIND[x.kind] || x.kind, num(x.amount), nb(pick(x, "balanceAfter", "balance_after")), x.note || ""])));
}

async function loadOrders() {
  const rows = await get("/api/admin/orders?limit=50&status=" + encodeURIComponent(statusSel.value));
  if (rows) ordBox.replaceChildren(table(["Time", "Email", "Drink", "Price", "Status", "Refund reason"],
    rows.map(o => [t(pick(o, "createdAt", "created_at")), mail(o), DRINKS[o.drink] || o.drink, num(pick(o, "price", "cost", "credits") ?? 0), badge(o.status), pick(o, "refundReason", "refund_reason") || ""])));
}

const card = (title, ...kids) => el("section", { class: "card" }, el("h2", {}, title), ...kids);
app.append(
  card("Users", el("div", { class: "row" }, q, el("button", { onclick: loadUsers }, "Search")), usersBox),
  card("Adjust credits", el("form", { onsubmit: adjust },
    el("label", {}, "Email", emailIn), el("label", {}, "Amount (+ or −)", amtIn), el("label", {}, "Note (required)", noteIn),
    el("button", { type: "submit" }, "Apply"), adjMsg)),
  card("Recent transactions", txBox),
  card("Recent orders", el("label", {}, "Status", statusSel), ordBox));
q.addEventListener("keydown", e => e.key === "Enter" && loadUsers());
loadUsers(); loadTx(); loadOrders();
})();
