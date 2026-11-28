/* مساعدات مشتركة بين بوابة الطالب وبوابة الموظفين: الصور الشخصية، كلمة المرور، الإيصالات */
(() => {
const client = window.edulegderClient, CFG = window.EDULEDGER_CONFIG || {};
const AV = CFG.AVATAR_BUCKET || "avatars";
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EL = window.EL = { recovering: !!window.__recovery, esc };

EL.toast = m => { const t = $("toast"); if (!t) return; t.textContent = m; t.classList.remove("hidden"); clearTimeout(EL.toast._t); EL.toast._t = setTimeout(() => t.classList.add("hidden"), 4200); };
EL.avatarUrl = p => (p && client) ? client.storage.from(AV).getPublicUrl(p).data.publicUrl : "";
EL.avatarHTML = (path, name) => path ? `<img src="${esc(EL.avatarUrl(path))}" alt="" loading="lazy">` : esc(((name || "?").trim()[0]) || "?");
EL.setAvatar = (el, path, name) => { if (el) el.innerHTML = EL.avatarHTML(path, name); };
EL.mini = (path, name) => `<span class="mini-avatar">${EL.avatarHTML(path, name)}</span>`;

/* فتح إيصال الدفع (رابط مؤقت 5 دقائق) */
EL.openProof = async path => {
  if (!path) { EL.toast("لا يوجد إيصال مرفق"); return; }
  const w = window.open("about:blank", "_blank");
  const { data, error } = await client.storage.from(CFG.STORAGE_BUCKET).createSignedUrl(path, 300);
  if (error) { if (w) w.close(); EL.toast("تعذر فتح الإيصال: " + error.message); return; }
  if (w) { try { w.opener = null; } catch (e) { /* ignore */ } w.location.href = data.signedUrl; } else window.location.href = data.signedUrl;
};
document.addEventListener("click", e => { const b = e.target.closest("[data-proof]"); if (b) { e.preventDefault(); EL.openProof(b.dataset.proof); } });

/* قص الصورة مربعة وتصغيرها قبل الرفع */
EL.resizeImage = (file, size = 320) => new Promise((res, rej) => {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const s = Math.min(img.width, img.height), c = document.createElement("canvas");
    c.width = c.height = size;
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    URL.revokeObjectURL(url);
    c.toBlob(b => b ? res(b) : rej(new Error("تعذر معالجة الصورة")), "image/jpeg", 0.86);
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("الملف ليس صورة صالحة")); };
  img.src = url;
});

const pwError = e => {
  const m = ((e && e.message) || "").toLowerCase();
  if (m.includes("different")) return "اختر كلمة مرور مختلفة عن الحالية.";
  if (m.includes("at least") || m.includes("short") || m.includes("weak")) return "كلمة المرور ضعيفة، استخدم 8 خانات على الأقل.";
  if (m.includes("session")) return "انتهت الجلسة، سجّل الدخول من جديد.";
  return "تعذر تغيير كلمة المرور: " + ((e && e.message) || "");
};

/* ---------- نافذة الإعدادات (الصورة + كلمة المرور) ---------- */
function ensureModal() {
  if ($("elModal")) return;
  const d = document.createElement("div");
  d.id = "elModal"; d.className = "modal-backdrop hidden";
  d.innerHTML = '<div class="modal-card"><button class="modal-close" id="elModalClose" aria-label="إغلاق">×</button><div id="elModalBody"></div></div>';
  document.body.appendChild(d);
  const close = () => d.classList.add("hidden");
  d.addEventListener("click", e => { if (e.target === d) close(); });
  $("elModalClose").onclick = close;
}
EL.closeSettings = () => { const d = $("elModal"); if (d) d.classList.add("hidden"); };

/* ctx: { profile:{id,full_name,avatar_path,must_change_password}, details:[نصوص], forced, onAvatar(path) } */
EL.openSettings = ctx => {
  ensureModal();
  const p = ctx.profile, uid = p.id;
  $("elModalBody").innerHTML = `<span class="eyebrow">الإعدادات</span><h2>حسابي</h2>
  <div class="settings-avatar"><div class="avatar xl" id="elAvPreview"></div>
    <div class="settings-avatar-actions"><button class="btn btn-soft" id="elAvPick" type="button">تغيير الصورة</button><button class="table-action reject" id="elAvDel" type="button">إزالة الصورة</button><input type="file" id="elAvFile" accept="image/*" class="hidden"></div></div>
  <p class="form-note" id="elAvMsg">الصورة تُقصّ وتُصغّر تلقائيًا. يمكنك تغييرها في أي وقت.</p>
  <div class="detail-lines"><b>${esc(p.full_name || "")}</b>${(ctx.details || []).filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div>
  <h3 style="margin:22px 0 8px">تغيير كلمة المرور</h3>
  ${ctx.forced ? '<p class="form-note warn">كلمة مرورك الحالية مؤقتة من الإدارة. اختر كلمة مرور جديدة تحفظها بنفسك.</p>' : ""}
  <form id="elPwForm" class="stack-form"><label>كلمة المرور الجديدة<input type="password" id="elPw1" minlength="8" autocomplete="new-password" required></label>
  <label>تأكيد كلمة المرور<input type="password" id="elPw2" minlength="8" autocomplete="new-password" required></label>
  <button class="btn btn-primary" type="submit">حفظ كلمة المرور</button><p class="form-note" id="elPwMsg">8 خانات على الأقل.</p></form>`;
  const prev = () => EL.setAvatar($("elAvPreview"), p.avatar_path, p.full_name);
  prev();
  const avMsg = m => { $("elAvMsg").textContent = m; };
  const old = () => p.avatar_path;
  const done = path => { p.avatar_path = path; prev(); if (ctx.onAvatar) ctx.onAvatar(path); };
  $("elAvPick").onclick = () => $("elAvFile").click();
  $("elAvFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      avMsg("جارٍ رفع الصورة...");
      const blob = await EL.resizeImage(f), path = `${uid}/${crypto.randomUUID()}.jpg`, before = old();
      const up = await client.storage.from(AV).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const r = await client.rpc("set_my_avatar", { p_path: path }); if (r.error) throw r.error;
      if (before) client.storage.from(AV).remove([before]);
      done(path); avMsg("تم تحديث الصورة.");
    } catch (err) { avMsg("تعذر رفع الصورة: " + (err.message || err)); }
  };
  $("elAvDel").onclick = async () => {
    if (!old()) { avMsg("لا توجد صورة لإزالتها."); return; }
    const before = old();
    const r = await client.rpc("set_my_avatar", { p_path: null });
    if (r.error) { avMsg("تعذر إزالة الصورة."); return; }
    client.storage.from(AV).remove([before]); done(null); avMsg("تمت إزالة الصورة.");
  };
  $("elPwForm").onsubmit = async e => {
    e.preventDefault();
    const a = $("elPw1").value, b = $("elPw2").value, m = $("elPwMsg");
    if (a.length < 8) { m.textContent = "كلمة المرور 8 خانات على الأقل."; return; }
    if (a !== b) { m.textContent = "كلمتا المرور غير متطابقتين."; return; }
    m.textContent = "جارٍ الحفظ...";
    const { error } = await client.auth.updateUser({ password: a });
    if (error) { m.textContent = pwError(error); return; }
    await client.rpc("password_changed"); p.must_change_password = false;
    $("elPwForm").reset(); m.textContent = "تم تغيير كلمة المرور بنجاح.";
    EL.toast("تم تغيير كلمة المرور");
  };
  $("elModal").classList.remove("hidden");
};

/* ---------- نسيت كلمة المرور + رابط الاستعادة ---------- */
EL.setupAuth = ({ screenId, loginFormId, noteId }) => {
  const login = $(loginFormId), forgot = $("forgotForm"), rec = $("recoveryForm"), note = $(noteId), screen = $(screenId);
  if (!login || !forgot || !rec) return;
  const show = f => { [login, forgot, rec].forEach(x => x.classList.add("hidden")); f.classList.remove("hidden"); };
  $("forgotLink").onclick = e => { e.preventDefault(); show(forgot); };
  $("forgotBack").onclick = e => { e.preventDefault(); show(login); };
  forgot.onsubmit = async e => {
    e.preventDefault();
    const m = $("forgotMsg"), em = $("forgotEmail").value.trim();
    if (!client) { m.textContent = "لم يتم إعداد Supabase بعد."; return; }
    if (!em.includes("@")) { m.textContent = "لا يمكن إرسال رابط للرقم الجامعي. إن لم يكن حسابك مرتبطًا ببريد إلكتروني فتواصل مع الإدارة لإعادة تعيين كلمة المرور."; return; }
    m.textContent = "جارٍ الإرسال...";
    const { error } = await client.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    m.textContent = error ? (/rate|seconds|limit/i.test(error.message) ? "تم إرسال عدد كبير من الطلبات، انتظر قليلًا ثم حاول مجددًا." : "تعذر إرسال الرابط. تأكد من البريد وحاول لاحقًا.")
      : "إذا كان البريد مسجّلًا لدينا فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة. تفقّد البريد غير الهام أيضًا.";
  };
  const enterRecovery = () => {
    EL.recovering = true;
    document.querySelectorAll(".app-shell").forEach(x => x.classList.add("hidden"));
    if (screen) screen.classList.remove("hidden");
    show(rec);
  };
  rec.onsubmit = async e => {
    e.preventDefault();
    const a = $("recPw1").value, b = $("recPw2").value, m = $("recMsg");
    if (a.length < 8) { m.textContent = "كلمة المرور 8 خانات على الأقل."; return; }
    if (a !== b) { m.textContent = "كلمتا المرور غير متطابقتين."; return; }
    m.textContent = "جارٍ الحفظ...";
    const { error } = await client.auth.updateUser({ password: a });
    if (error) { m.textContent = pwError(error); return; }
    await client.rpc("password_changed");
    await client.auth.signOut();
    EL.recovering = false; history.replaceState(null, "", location.pathname + location.search);
    rec.reset(); show(login); if (note) note.textContent = "تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.";
  };
  if (client) client.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") enterRecovery(); });
  if (window.__recovery) enterRecovery();
  if (/error_code=otp_expired|error=access_denied/.test(location.hash)) { show(forgot); $("forgotMsg").textContent = "انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطًا جديدًا."; history.replaceState(null, "", location.pathname + location.search); }
};
})();
