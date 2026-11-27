(() => {
const $ = id => document.getElementById(id);
const client = window.edulegderClient, CFG = window.EDULEDGER_CONFIG;
const PERMS = {
  view_students: "الاطلاع على حسابات الطلاب وسجلاتهم المالية",
  manage_students: "إضافة وحذف حسابات الطلاب",
  review_payments: "مراجعة المدفوعات",
  manage_charges: "فرض الرسوم",
  manage_fee_types: "إدارة أنواع الرسوم",
  send_notifications: "إرسال الإشعارات",
  view_reports: "عرض التقارير"
};
const DEFAULT_PERMS = ["view_students", "review_payments", "manage_charges", "send_notifications", "view_reports"];
const YEARS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"];
const METHODS = { bankak: "بنكك", fawry: "فوري", other: "أخرى" };
const STATUS = { pending: "قيد المراجعة", confirmed: "مؤكد", rejected: "مرفوض" };
const TITLES = { dashboard: "لوحة التحكم", students: "سجلات الطلاب", accounts: "الحسابات والصلاحيات", charges: "الرسوم المفروضة", notifications: "الإشعارات", payments: "مراجعة المدفوعات", reports: "التقارير المالية" };
const VIEW_ACCESS = { students: "view_students", accounts: "@admin", charges: "manage_charges", notifications: "send_notifications", payments: "review_payments", reports: "view_reports" };
const PAGE = 25;

let staff = null, colleges = [], myCollegeIds = [], feeTypes = [];
let sPage = 0, sTotal = 0, pPage = 0, pTotal = 0, reportRows = [];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => `${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${CFG.CURRENCY_LABEL}`;
const dt = d => new Date(d).toLocaleDateString("ar");
const msgOf = e => (e && e.message) || String(e);
const isAdmin = () => staff && staff.role === "admin";
const can = p => isAdmin() || (staff && (staff.permissions || []).includes(p));
const pill = s => `<span class="status-pill ${s}">${STATUS[s] || s}</span>`;
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(msgOf(e)); } };
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 4200); }
function msg(id, m) { $(id).textContent = m; }
function openModal(html) { $("modalContent").innerHTML = html; $("modal").classList.remove("hidden"); }
function closeModal() { $("modal").classList.add("hidden"); $("modalContent").innerHTML = ""; }
async function rpc(name, args) { const { data, error } = await client.rpc(name, args || {}); if (error) throw error; return data; }
async function adminFn(body) {
  const { data, error } = await client.functions.invoke("admin-users", { body });
  if (error) {
    let m = error.message;
    try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { /* ignore */ }
    throw new Error(m);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
function download(name, rows) {
  const csv = "﻿" + rows.map(r => r.map(x => '"' + String(x ?? "").replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false; text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

/* ---------- الدخول والجلسة ---------- */
async function fetchProfile(uid) {
  const { data, error } = await client.from("profiles").select("id,full_name,role,active,permissions").eq("id", uid).single();
  if (error) throw error; return data;
}
async function enter(p) {
  staff = p;
  $("adminAuthScreen").classList.add("hidden"); $("adminApp").classList.remove("hidden");
  $("staffName").textContent = p.full_name; $("staffRole").textContent = p.role === "admin" ? "المدير الرئيسي" : "محاسب";
  $("adminUserName").textContent = p.full_name; $("adminWelcomeName").textContent = p.full_name.split(" ")[0];
  await loadBase();
  document.querySelectorAll("#adminApp [data-perm]").forEach(el => el.classList.toggle("hidden", !can(el.dataset.perm)));
  document.querySelectorAll("#adminApp [data-admin]").forEach(el => el.classList.toggle("hidden", !isAdmin()));
  $("adminUserScope").textContent = isAdmin() ? "كل الكليات" : (colleges.map(c => c.name).join("، ") || "لا توجد كلية مسندة");
  populateFilters(); mountTarget("chargeTarget", "ch"); mountTarget("notifTarget", "nt");
  showView("dashboard");
}
async function login(e) {
  e.preventDefault();
  if (!client) { msg("adminAuthMessage", "أكمل إعداد config.js وتشغيل schema.sql أولًا."); return; }
  msg("adminAuthMessage", "جارٍ التحقق...");
  const { data, error } = await client.auth.signInWithPassword({ email: $("adminEmail").value.trim(), password: $("adminPassword").value });
  if (error) { msg("adminAuthMessage", "تعذر تسجيل الدخول. تحقق من البيانات."); return; }
  try {
    const p = await fetchProfile(data.user.id);
    if (!p.active || !["admin", "accountant"].includes(p.role)) throw new Error("no access");
    await enter(p);
  } catch (err) {
    await client.auth.signOut(); msg("adminAuthMessage", "هذا الحساب لا يملك صلاحية دخول بوابة الإدارة أو تم تعطيله.");
  }
}
async function logout() { await client.auth.signOut(); staff = null; $("adminApp").classList.add("hidden"); $("adminAuthScreen").classList.remove("hidden"); }
async function loadBase() {
  const [c, f, sc] = await Promise.all([
    client.from("colleges").select("id,name").order("name"),
    client.from("fee_types").select("id,name,active").order("name"),
    isAdmin() ? Promise.resolve({ data: [] }) : client.from("staff_colleges").select("college_id").eq("staff_id", staff.id)
  ]);
  if (c.error) throw c.error; if (f.error) throw f.error;
  myCollegeIds = (sc.data || []).map(r => r.college_id);
  colleges = isAdmin() ? (c.data || []) : (c.data || []).filter(x => myCollegeIds.includes(x.id));
  feeTypes = (f.data || []).filter(x => x.active);
}
function collegeOptions(allLabel) { return `<option value="">${allLabel}</option>` + colleges.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(""); }
function populateFilters() {
  $("collegeFilter").innerHTML = collegeOptions(isAdmin() ? "كل الكليات" : "كل كلياتي");
  $("feeType").innerHTML = '<option value="">اختر نوع الرسوم</option>' + feeTypes.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("");
  $("feeTypesList").innerHTML = feeTypes.map(f => `<span class="fee-chip">${esc(f.name)}</span>`).join("") || '<span class="muted">لم تتم إضافة أنواع رسوم بعد.</span>';
}

/* ---------- التنقل ---------- */
function allowedView(name) { const need = VIEW_ACCESS[name]; if (!need) return true; return need === "@admin" ? isAdmin() : can(need); }
function showView(name) {
  if (!allowedView(name)) name = "dashboard";
  document.querySelectorAll("#adminApp .view-section").forEach(x => x.classList.add("hidden"));
  $("view-" + name).classList.remove("hidden");
  document.querySelectorAll("#adminApp .nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $("adminPageTitle").textContent = TITLES[name];
  const run = { dashboard: renderDashboard, students: () => loadStudents(0), accounts: renderAccounts, charges: renderCharges, notifications: renderNotifications, payments: () => loadPayments(0), reports: renderReports }[name];
  if (run) run().catch(e => toast(msgOf(e)));
}

/* ---------- لوحة التحكم ---------- */
async function renderDashboard() {
  const s = (await rpc("finance_summary"))[0];
  $("statStudents").textContent = Number(s.students).toLocaleString("en-US");
  $("statCollected").textContent = fmt(s.total_paid); $("statPending").textContent = s.pending_count;
  $("statOutstanding").textContent = fmt(Math.max(0, Number(s.total_charged) - Number(s.total_paid)));
  $("pendingBadge").textContent = s.pending_count; $("pendingBadge").classList.toggle("hidden", !(Number(s.pending_count) && can("review_payments")));
  if (can("review_payments")) {
    const { data } = await client.from("payments").select("id,amount,transaction_ref,created_at,profiles!payments_student_id_fkey(full_name)").eq("status", "pending").order("created_at", { ascending: false }).limit(5);
    $("dashboardPayments").innerHTML = (data || []).map(p => `<div class="activity-item"><div class="activity-symbol">↗</div><div class="activity-copy"><b>${esc(p.profiles?.full_name || "طالب")}</b><small>${esc(p.transaction_ref)} · ${dt(p.created_at)}</small></div><span class="activity-amount">${fmt(p.amount)}</span>${pill("pending")}</div>`).join("") || '<div class="empty-state">لا توجد دفعات تنتظر المراجعة.</div>';
  }
}

/* ---------- الطلاب ---------- */
async function loadStudents(page) {
  sPage = page;
  const rows = await rpc("list_students", { p_search: $("studentSearch").value.trim() || null, p_college_id: $("collegeFilter").value || null, p_year: $("yearFilter").value || null, p_major: null, p_limit: PAGE, p_offset: page * PAGE });
  sTotal = rows.length ? Number(rows[0].total_count) : 0;
  if (!rows.length && page > 0) return loadStudents(page - 1);
  $("studentsRows").innerHTML = rows.map(s => {
    const rem = Math.max(0, Number(s.total_charged) - Number(s.total_paid));
    return `<tr><td><div class="student-cell"><b>${esc(s.full_name)}</b><small>${s.active ? esc(s.email || "") : "حساب معطّل"}</small></div></td><td>${esc(s.student_number || "—")}</td><td>${esc(s.college_name || "—")} / ${esc(s.major || "—")}</td><td>${esc(s.academic_year || "—")}</td><td>${fmt(s.total_charged)}</td><td>${fmt(s.total_paid)}</td><td><b>${fmt(rem)}</b></td><td><button class="table-action" data-student="${s.id}">فتح السجل</button>${can("manage_students") ? `<button class="table-action reject" data-del="${s.id}" data-name="${esc(s.full_name)}">حذف</button>` : ""}</td></tr>`;
  }).join("") || '<tr><td colspan="8" class="empty-state">لا توجد نتائج مطابقة.</td></tr>';
  const from = sTotal ? page * PAGE + 1 : 0, to = Math.min(sTotal, page * PAGE + rows.length);
  $("studentsPageInfo").textContent = `${from}–${to} من ${sTotal}`;
  $("studentsPrev").disabled = page === 0; $("studentsNext").disabled = (page + 1) * PAGE >= sTotal;
  document.querySelectorAll("[data-student]").forEach(b => b.onclick = safe(() => openStudent(b.dataset.student)));
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = safe(() => deleteAccount(b.dataset.del, b.dataset.name, "student")));
}
async function openStudent(id) {
  const [s, ch, py] = await Promise.all([
    client.from("profiles").select("id,student_number,full_name,email,major,academic_year,active,colleges(name)").eq("id", id).single(),
    client.from("charges").select("id,amount,term_label,created_at,fee_types(name)").eq("student_id", id).order("created_at", { ascending: false }),
    client.from("payments").select("id,amount,method,transaction_ref,status,created_at").eq("student_id", id).order("created_at", { ascending: false })
  ]);
  if (s.error) throw s.error;
  const st = s.data, sc = ch.data || [], sp = py.data || [];
  const due = sc.reduce((a, c) => a + Number(c.amount), 0), paid = sp.filter(p => p.status === "confirmed").reduce((a, p) => a + Number(p.amount), 0);
  openModal(`<span class="eyebrow">السجل المالي للطالب</span><h2>${esc(st.full_name)}</h2><p class="muted">${esc(st.student_number || "")} · ${esc(st.colleges?.name || "")} · ${esc(st.major || "")} · ${esc(st.academic_year || "")}</p><div class="detail-grid"><div class="detail-box"><small>الرسوم المفروضة</small><b>${fmt(due)}</b></div><div class="detail-box"><small>المدفوع المؤكد</small><b>${fmt(paid)}</b></div><div class="detail-box"><small>المتبقي</small><b>${fmt(Math.max(0, due - paid))}</b></div></div><h3 style="margin:20px 0 10px">الحركات المالية</h3><div class="table-wrap"><table><thead><tr><th>البيان</th><th>الفصل / رقم العملية</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${sc.map(c => `<tr><td>${esc(c.fee_types?.name || "رسم")}</td><td>${esc(c.term_label || "—")}</td><td>${fmt(c.amount)}</td><td>${dt(c.created_at)}</td><td>مستحق</td></tr>`).join("")}${sp.map(p => `<tr><td>دفعة ${esc(METHODS[p.method] || p.method)}</td><td>${esc(p.transaction_ref)}</td><td>${fmt(p.amount)}</td><td>${dt(p.created_at)}</td><td>${pill(p.status)}</td></tr>`).join("")}</tbody></table></div>${can("manage_students") ? `<p style="margin-top:14px"><button class="table-action" id="resetPwBtn">إعادة تعيين كلمة المرور</button></p>` : ""}`);
  if ($("resetPwBtn")) $("resetPwBtn").onclick = safe(() => resetPassword(id));
}
function secretModal(title, line, secret) {
  openModal(`<span class="eyebrow">تم بنجاح</span><h2>${esc(title)}</h2><p class="muted">${esc(line)}</p><div class="secret-box">${esc(secret)}</div><p class="form-note">انسخها الآن وسلّمها للشخص المعني. لن تظهر مرة أخرى.</p>`);
}
async function resetPassword(id) {
  const pw = prompt("كلمة مرور جديدة (8 خانات على الأقل). اتركها فارغة لتوليد كلمة تلقائيًا:");
  if (pw === null) return;
  const r = await adminFn({ action: "reset_password", user_id: id, password: pw.trim() || undefined });
  if (r.password) secretModal("كلمة المرور الجديدة", "تم تغيير كلمة المرور.", r.password); else toast("تم تغيير كلمة المرور");
}
async function deleteAccount(id, name, kind) {
  if (!confirm(`حذف حساب "${name}"؟\nإذا كان للحساب سجلات مالية سيتم تعطيله بدل حذفه حفاظًا على السجلات.`)) return;
  const r = await adminFn({ action: "delete_user", user_id: id });
  toast(r.mode === "deleted" ? "تم حذف الحساب نهائيًا" : "للحساب سجلات مالية، لذلك تم تعطيله ولم يُحذف");
  if (kind === "student") await loadStudents(sPage); else await renderAccounts();
}
function addStudentModal() {
  openModal(`<span class="eyebrow">حساب جديد</span><h2>إضافة طالب</h2><form id="studentForm" class="stack-form"><div class="form-row"><label>الاسم الكامل<input id="sfName" required></label><label>الرقم الجامعي<input id="sfNumber" required></label></div><div class="form-row"><label>الكلية<select id="sfCollege" required>${collegeOptions("اختر الكلية").replace('<option value="">', '<option value="" disabled selected>')}</select></label><label>السنة<select id="sfYear"><option value="">—</option>${YEARS.map(y => `<option>${y}</option>`).join("")}</select></label></div><div class="form-row"><label>التخصص<input id="sfMajor"></label><label>البريد (اختياري)<input id="sfEmail" type="email" placeholder="يدخل بالرقم الجامعي إن تُرك فارغًا"></label></div><label>كلمة المرور (اختياري)<input id="sfPassword" minlength="8" placeholder="تُولَّد تلقائيًا إن تُركت فارغة"></label><button class="btn btn-primary" type="submit">إنشاء الحساب</button></form>`);
  $("studentForm").onsubmit = safe(async e => {
    e.preventDefault();
    const r = await adminFn({ action: "create_user", role: "student", full_name: $("sfName").value, student_number: $("sfNumber").value, college_id: $("sfCollege").value, academic_year: $("sfYear").value, major: $("sfMajor").value, email: $("sfEmail").value, password: $("sfPassword").value || undefined });
    secretModal("تم إنشاء حساب الطالب", `الدخول بـ: ${r.login}`, r.password || "(كلمة المرور التي كتبتها)");
    await loadStudents(0);
  });
}
async function importStudents(file) {
  const rows = parseCsv(await file.text()); const header = rows.shift().map(x => x.trim());
  const idx = k => header.indexOf(k);
  if (idx("student_number") < 0 || idx("full_name") < 0 || idx("college") < 0) { toast("الأعمدة المطلوبة: student_number,full_name,college وهناك اختيارية: major,academic_year,email,password"); return; }
  const get = (r, k) => idx(k) >= 0 ? (r[idx(k)] || "").trim() : "";
  const list = rows.map(r => ({ student_number: get(r, "student_number"), full_name: get(r, "full_name"), college: get(r, "college"), major: get(r, "major"), academic_year: get(r, "academic_year"), email: get(r, "email"), password: get(r, "password") || undefined })).filter(x => x.student_number && x.full_name);
  if (!list.length) { toast("لم يتم العثور على صفوف صالحة"); return; }
  if (!confirm(`سيتم إنشاء ${list.length} حساب طالب. متابعة؟`)) return;
  const out = [["الرقم الجامعي", "الاسم", "اسم الدخول", "كلمة المرور", "النتيجة"]]; let ok = 0;
  for (let i = 0; i < list.length; i += 100) {
    toast(`جارٍ الاستيراد... ${Math.min(i + 100, list.length)} / ${list.length}`);
    const r = await adminFn({ action: "bulk_create_students", students: list.slice(i, i + 100) });
    r.results.forEach(x => { if (x.ok) ok++; out.push([x.student_number, x.full_name, x.login || "", x.password || "", x.ok ? "تم" : x.error]); });
  }
  download("student-accounts.csv", out);
  toast(`تم إنشاء ${ok} من ${list.length}. نُزّل ملف فيه بيانات الدخول، احتفظ به بأمان.`);
  await loadStudents(0);
}

/* ---------- الحسابات والصلاحيات (للمدير) ---------- */
function permChecks(selected) { return Object.entries(PERMS).map(([k, v]) => `<label><input type="checkbox" value="${k}" ${selected.includes(k) ? "checked" : ""}> ${esc(v)}</label>`).join(""); }
function collegeChecks(selected) { return colleges.map(c => `<label><input type="checkbox" value="${c.id}" ${selected.includes(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("") || '<span class="muted">أضف كلية أولًا.</span>'; }
const checked = box => [...$(box).querySelectorAll("input:checked")].map(i => i.value);
async function renderAccounts() {
  $("accColleges").innerHTML = collegeChecks([]); $("accPerms").innerHTML = permChecks(DEFAULT_PERMS);
  $("collegesList").innerHTML = colleges.map(c => `<span class="fee-chip">${esc(c.name)}</span>`).join("") || '<span class="muted">لا توجد كليات بعد.</span>';
  const [p, sc] = await Promise.all([
    client.from("profiles").select("id,full_name,email,role,active,permissions").in("role", ["admin", "accountant"]).order("role").order("full_name"),
    client.from("staff_colleges").select("staff_id,college_id")
  ]);
  if (p.error) throw p.error;
  const cname = Object.fromEntries(colleges.map(c => [c.id, c.name]));
  $("staffRows").innerHTML = (p.data || []).map(u => {
    const cols = (sc.data || []).filter(x => x.staff_id === u.id).map(x => cname[x.college_id]).filter(Boolean);
    const acct = u.role === "accountant";
    return `<tr><td><div class="student-cell"><b>${esc(u.full_name)}</b><small>${esc(u.email || "")}</small></div></td><td><span class="role-badge ${u.role}">${acct ? "محاسب" : "مدير"}</span></td><td class="wrap-cell">${acct ? (cols.map(esc).join("، ") || "—") : "كل الكليات"}</td><td class="wrap-cell">${acct ? ((u.permissions || []).map(k => `<span class="perm-chip">${esc(PERMS[k] || k)}</span>`).join("") || "—") : "كل الصلاحيات"}</td><td>${u.active ? '<span class="status-pill confirmed">مفعّل</span>' : '<span class="status-pill off">معطّل</span>'}</td><td>${acct ? `<button class="table-action" data-acc-edit="${u.id}">الصلاحيات</button><button class="table-action" data-acc-toggle="${u.id}" data-active="${u.active}">${u.active ? "تعطيل" : "تفعيل"}</button><button class="table-action" data-acc-pw="${u.id}">كلمة المرور</button><button class="table-action reject" data-acc-del="${u.id}" data-name="${esc(u.full_name)}">حذف</button>` : "—"}</td></tr>`;
  }).join("") || '<tr><td colspan="6" class="empty-state">لا توجد حسابات.</td></tr>';
  const byId = Object.fromEntries((p.data || []).map(u => [u.id, u]));
  document.querySelectorAll("[data-acc-edit]").forEach(b => b.onclick = () => editAccess(byId[b.dataset.accEdit], (sc.data || []).filter(x => x.staff_id === b.dataset.accEdit).map(x => x.college_id)));
  document.querySelectorAll("[data-acc-toggle]").forEach(b => b.onclick = safe(async () => { await adminFn({ action: "set_active", user_id: b.dataset.accToggle, active: b.dataset.active !== "true" }); toast("تم تحديث الحالة"); await renderAccounts(); }));
  document.querySelectorAll("[data-acc-pw]").forEach(b => b.onclick = safe(() => resetPassword(b.dataset.accPw)));
  document.querySelectorAll("[data-acc-del]").forEach(b => b.onclick = safe(() => deleteAccount(b.dataset.accDel, b.dataset.name, "staff")));
}
function editAccess(u, collegeIds) {
  openModal(`<span class="eyebrow">تعديل الصلاحيات</span><h2>${esc(u.full_name)}</h2><form id="accessForm" class="stack-form"><label>الكليات المسؤول عنها</label><div class="check-grid" id="axColleges">${collegeChecks(collegeIds)}</div><label>الصلاحيات</label><div class="check-grid" id="axPerms">${permChecks(u.permissions || [])}</div><button class="btn btn-primary" type="submit">حفظ</button></form>`);
  $("accessForm").onsubmit = safe(async e => { e.preventDefault(); await rpc("set_staff_access", { p_staff_id: u.id, p_permissions: checked("axPerms"), p_college_ids: checked("axColleges") }); closeModal(); toast("تم حفظ الصلاحيات"); await renderAccounts(); });
}
const createAccountant = safe(async e => {
  e.preventDefault();
  const cols = checked("accColleges"); if (!cols.length && !confirm("لم تحدد أي كلية، فلن يرى هذا المحاسب أي طالب. متابعة؟")) return;
  const r = await adminFn({ action: "create_user", role: "accountant", full_name: $("accName").value, email: $("accEmail").value, password: $("accPassword").value || undefined, permissions: checked("accPerms"), college_ids: cols });
  $("accountantForm").reset(); $("accColleges").innerHTML = collegeChecks([]); $("accPerms").innerHTML = permChecks(DEFAULT_PERMS);
  if (r.password) secretModal("تم إنشاء حساب المحاسب", `الدخول بالبريد: ${r.login}`, r.password); else toast("تم إنشاء حساب المحاسب");
  await renderAccounts();
});
const addCollege = safe(async e => {
  e.preventDefault(); const name = $("newCollege").value.trim(); if (!name) return;
  const { error } = await client.from("colleges").insert({ name }); if (error) throw error;
  $("newCollege").value = ""; await loadBase(); populateFilters(); mountTarget("chargeTarget", "ch"); mountTarget("notifTarget", "nt"); await renderAccounts(); toast("تمت إضافة الكلية");
});

/* ---------- اختيار الفئة المستهدفة (للرسوم والإشعارات) ---------- */
function mountTarget(box, p) {
  $(box).innerHTML = `<label>الكلية<select id="${p}College">${collegeOptions(isAdmin() ? "كل الكليات" : "كل كلياتي")}</select></label><div class="form-row"><label>السنة الدراسية<select id="${p}Year"><option value="">كل السنوات</option>${YEARS.map(y => `<option>${y}</option>`).join("")}</select></label><label>التخصص (اختياري)<input id="${p}Major" placeholder="اسم التخصص كما هو مسجل"></label></div><label>أرقام جامعية محددة (اختياري)<textarea id="${p}Ids" rows="3" placeholder="الصق أرقام الطلاب هنا، كل رقم في سطر أو مفصولة بفاصلة. عند تعبئتها تُرسل لهؤلاء فقط."></textarea></label><div class="target-count" id="${p}Count"></div>`;
  let t; const upd = () => { clearTimeout(t); t = setTimeout(() => refreshCount(p), 350); };
  ["College", "Year", "Major", "Ids"].forEach(k => { $(p + k).addEventListener("input", upd); $(p + k).addEventListener("change", upd); });
  refreshCount(p);
}
async function resolveTarget(p) {
  const nums = [...new Set($(p + "Ids").value.split(/[\s,;،]+/).map(x => x.trim()).filter(Boolean))];
  let ids = null, missing = [];
  if (nums.length) {
    ids = []; const found = new Set();
    for (let i = 0; i < nums.length; i += 150) {
      const { data, error } = await client.from("profiles").select("id,student_number").eq("role", "student").in("student_number", nums.slice(i, i + 150));
      if (error) throw error; (data || []).forEach(r => { ids.push(r.id); found.add(r.student_number); });
    }
    missing = nums.filter(n => !found.has(n));
    if (!ids.length) throw new Error("لم يُعثر على أي رقم جامعي من القائمة ضمن نطاقك");
  }
  return { args: { p_college_id: $(p + "College").value || null, p_major: $(p + "Major").value.trim() || null, p_year: $(p + "Year").value || null, p_student_ids: ids }, missing };
}
async function refreshCount(p) {
  const el = $(p + "Count"); if (!el) return;
  try { const { args, missing } = await resolveTarget(p); const n = await rpc("count_targets", args); el.textContent = `عدد الطلاب المستهدفين: ${n}` + (missing.length ? ` · أرقام غير موجودة أو خارج نطاقك: ${missing.length}` : ""); }
  catch (e) { el.textContent = msgOf(e); }
}

/* ---------- الرسوم ---------- */
async function renderCharges() {
  const { data, error } = await client.from("charges").select("id,amount,term_label,created_at,fee_types(name),profiles!charges_student_id_fkey(full_name,student_number)").order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  $("chargesRows").innerHTML = (data || []).map(c => `<tr><td>${esc(c.fee_types?.name || "رسم")}</td><td>${esc(c.profiles?.full_name || "")} <small class="muted">${esc(c.profiles?.student_number || "")}</small></td><td>${esc(c.term_label || "—")}</td><td>${fmt(c.amount)}</td><td>${dt(c.created_at)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">لا توجد رسوم مضافة بعد.</td></tr>';
}
const addCharges = safe(async e => {
  e.preventDefault();
  const fee = $("feeType").value, amount = Number($("chargeAmount").value), term = $("chargeTerm").value.trim(), notify = $("chargeNotify").checked;
  if (!fee || !(amount > 0) || !term) { toast("أكمل بيانات الرسم"); return; }
  const { args } = await resolveTarget("ch"); const n = await rpc("count_targets", args);
  if (!n) { toast("لا يوجد طلاب مطابقون للفئة المحددة"); return; }
  if (!confirm(`سيتم فرض الرسم (${fmt(amount)}) على ${n} طالب${notify ? " وإرسال إشعار لهم" : ""}. هل تريد المتابعة؟`)) return;
  const done = await rpc("add_charges", { p_fee_type_id: fee, p_amount: amount, p_term_label: term, ...args, p_notify: notify });
  $("chargeAmount").value = ""; mountTarget("chargeTarget", "ch"); await renderCharges();
  toast(`تم فرض الرسم على ${done} طالب${notify ? " وأُرسل لهم إشعار" : ""}`);
});
const addFeeType = safe(async e => {
  e.preventDefault(); const name = $("newFeeType").value.trim(); if (!name) return;
  const { error } = await client.from("fee_types").insert({ name }); if (error) throw error;
  $("newFeeType").value = ""; await loadBase(); populateFilters(); toast("تمت إضافة نوع الرسوم");
});

/* ---------- الإشعارات ---------- */
async function renderNotifications() {
  const { data, error } = await client.from("notifications").select("id,title,body,kind,created_at,recipient_count,profiles!notifications_created_by_fkey(full_name)").order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  $("notifHistory").innerHTML = (data || []).map(n => `<div class="activity-item"><div class="activity-symbol">${n.kind === "fee" ? "▤" : "✉"}</div><div class="activity-copy"><b>${esc(n.title)}</b><small>${esc((n.body || "").slice(0, 90))}</small><small>${dt(n.created_at)} · ${esc(n.profiles?.full_name || "")} · وصل إلى ${n.recipient_count} طالب</small></div></div>`).join("") || '<div class="empty-state">لا توجد إشعارات مرسلة.</div>';
}
const sendNotif = safe(async e => {
  e.preventDefault();
  const { args } = await resolveTarget("nt"); const n = await rpc("count_targets", args);
  if (!n) { toast("لا يوجد طلاب مطابقون للفئة المحددة"); return; }
  if (!confirm(`سيصل الإشعار إلى ${n} طالب. هل تريد الإرسال؟`)) return;
  const sent = await rpc("send_notification", { p_title: $("notifTitle").value, p_body: $("notifBody").value, ...args });
  $("notifForm").reset(); mountTarget("notifTarget", "nt"); await renderNotifications(); toast(`تم إرسال الإشعار إلى ${sent} طالب`);
});

/* ---------- المدفوعات ---------- */
async function loadPayments(page) {
  pPage = page; const f = $("paymentStatusFilter").value;
  let q = client.from("payments").select("id,student_id,amount,method,transaction_ref,payment_date,status,proof_path,rejection_reason,created_at,profiles!payments_student_id_fkey(full_name,student_number)", { count: "exact" }).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (f) q = q.eq("status", f);
  const { data, count, error } = await q; if (error) throw error;
  pTotal = count || 0; const rows = data || [];
  if (!rows.length && page > 0) return loadPayments(page - 1);
  $("adminPaymentsRows").innerHTML = rows.map(p => `<tr><td><div class="student-cell"><b>${esc(p.profiles?.full_name || "طالب")}</b><small>${esc(p.profiles?.student_number || "")}</small></div></td><td>${esc(p.transaction_ref)}</td><td>${esc(METHODS[p.method] || p.method)}</td><td>${esc(p.payment_date || "—")}</td><td>${fmt(p.amount)}</td><td>${pill(p.status)}</td><td>${p.status === "pending" ? `<button class="table-action" data-review="${p.id}">مراجعة</button>` : "—"}</td></tr>`).join("") || '<tr><td colspan="7" class="empty-state">لا توجد مدفوعات بهذه الحالة.</td></tr>';
  $("paymentsPageInfo").textContent = `${pTotal ? page * PAGE + 1 : 0}–${Math.min(pTotal, page * PAGE + rows.length)} من ${pTotal}`;
  $("paymentsPrev").disabled = page === 0; $("paymentsNext").disabled = (page + 1) * PAGE >= pTotal;
  const byId = Object.fromEntries(rows.map(p => [p.id, p]));
  document.querySelectorAll("[data-review]").forEach(b => b.onclick = () => reviewModal(byId[b.dataset.review]));
}
function reviewModal(p) {
  openModal(`<span class="eyebrow">مراجعة دفعة</span><h2>${esc(p.profiles?.full_name || "")}</h2><div class="detail-grid"><div class="detail-box"><small>المبلغ</small><b>${fmt(p.amount)}</b></div><div class="detail-box"><small>الطريقة</small><b>${esc(METHODS[p.method] || p.method)}</b></div><div class="detail-box"><small>رقم العملية</small><b>${esc(p.transaction_ref)}</b></div></div><p style="margin:14px 0"><button class="table-action" id="proofBtn">عرض إشعار التحويل</button></p><div class="stack-form"><button class="btn btn-primary" id="confirmBtn">اعتماد الدفعة</button><label>سبب الرفض<input id="rejectReason" placeholder="مثال: المبلغ غير مطابق"></label><button class="btn btn-soft" id="rejectBtn">رفض الدفعة</button></div>`);
  $("proofBtn").onclick = safe(async () => {
    if (!p.proof_path) { toast("لا يوجد إثبات مرفق"); return; }
    const { data, error } = await client.storage.from(CFG.STORAGE_BUCKET).createSignedUrl(p.proof_path, 300); if (error) throw error; window.open(data.signedUrl, "_blank", "noopener");
  });
  const review = (status, reason) => safe(async () => { await rpc("review_payment", { p_payment_id: p.id, p_new_status: status, p_rejection_reason: reason ? reason() : null }); closeModal(); toast("تم تحديث حالة الدفعة وإشعار الطالب"); await loadPayments(pPage); renderDashboard().catch(() => {}); });
  $("confirmBtn").onclick = review("confirmed");
  $("rejectBtn").onclick = safe(async () => { const r = $("rejectReason").value.trim(); if (!r) { toast("اكتب سبب الرفض"); return; } await review("rejected", () => r)(); });
}

/* ---------- التقارير ---------- */
async function renderReports() {
  reportRows = await rpc("college_report");
  const fees = reportRows.reduce((a, r) => a + Number(r.total_charged), 0), paid = reportRows.reduce((a, r) => a + Number(r.total_paid), 0);
  $("reportFees").textContent = fmt(fees); $("reportPaid").textContent = fmt(paid); $("reportRemaining").textContent = fmt(Math.max(0, fees - paid));
  $("collegeReportRows").innerHTML = reportRows.map(r => `<tr><td>${esc(r.college_name)}</td><td>${r.students}</td><td>${fmt(r.total_charged)}</td><td>${fmt(r.total_paid)}</td><td>${fmt(Math.max(0, Number(r.total_charged) - Number(r.total_paid)))}</td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">لا توجد بيانات.</td></tr>';
}

/* ---------- الربط ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("adminLoginForm").addEventListener("submit", login); $("adminLogout").addEventListener("click", safe(logout));
  document.querySelectorAll("#adminApp [data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.querySelectorAll("#adminApp [data-go]").forEach(b => b.addEventListener("click", () => showView(b.dataset.go)));
  let st; $("studentSearch").addEventListener("input", () => { clearTimeout(st); st = setTimeout(() => loadStudents(0).catch(e => toast(msgOf(e))), 350); });
  $("collegeFilter").addEventListener("change", () => loadStudents(0).catch(e => toast(msgOf(e)))); $("yearFilter").addEventListener("change", () => loadStudents(0).catch(e => toast(msgOf(e))));
  $("studentsPrev").addEventListener("click", safe(() => loadStudents(sPage - 1))); $("studentsNext").addEventListener("click", safe(() => loadStudents(sPage + 1)));
  $("paymentsPrev").addEventListener("click", safe(() => loadPayments(pPage - 1))); $("paymentsNext").addEventListener("click", safe(() => loadPayments(pPage + 1)));
  $("paymentStatusFilter").addEventListener("change", safe(() => loadPayments(0)));
  $("addStudentBtn").addEventListener("click", addStudentModal);
  $("importStudentsBtn").addEventListener("click", () => $("studentCsv").click());
  $("studentCsv").addEventListener("change", safe(async e => { const f = e.target.files[0]; e.target.value = ""; if (f) await importStudents(f); }));
  $("accountantForm").addEventListener("submit", createAccountant); $("collegeForm").addEventListener("submit", addCollege);
  $("chargeForm").addEventListener("submit", addCharges); $("feeTypeForm").addEventListener("submit", addFeeType); $("notifForm").addEventListener("submit", sendNotif);
  $("exportReport").addEventListener("click", () => download("EduLedger-colleges.csv", [["الكلية", "عدد الطلاب", "المفروض", "المحصّل", "المتبقي"], ...reportRows.map(r => [r.college_name, r.students, r.total_charged, r.total_paid, Math.max(0, Number(r.total_charged) - Number(r.total_paid))])]));
  $("closeModal").addEventListener("click", closeModal); $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  if (!client) { msg("adminAuthMessage", "لم يتم إعداد Supabase. اتبع خطوات README لتشغيل المشروع."); return; }
  client.auth.getSession().then(async ({ data }) => {
    if (!data.session) return;
    try { const p = await fetchProfile(data.session.user.id); if (p.active && ["admin", "accountant"].includes(p.role)) await enter(p); } catch (e) { /* يبقى على شاشة الدخول */ }
  });
});
})();
