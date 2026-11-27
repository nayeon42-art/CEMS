(() => {
const $ = id => document.getElementById(id);
const client = window.edulegderClient;
const CFG = window.EDULEDGER_CONFIG;
const STUDENT_DOMAIN = CFG.STUDENT_EMAIL_DOMAIN || "students.cems.app";
let currentUser = null, profile = null, charges = [], payments = [], notifications = [], pollTimer = null, knownUnread = null;
const fmt = n => `${Number(n||0).toLocaleString("en-US",{maximumFractionDigits:2})} ${CFG.CURRENCY_LABEL}`;
const statusText = s => ({pending:"قيد المراجعة",confirmed:"مؤكد",rejected:"مرفوض"}[s]||s);
const METHODS = {bankak:"بنكك",fawry:"فوري",other:"أخرى"};
const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add("hidden"),3500)}
function authMessage(msg){$("studentAuthMessage").textContent=msg}
function showView(name){document.querySelectorAll("#studentApp .view-section").forEach(x=>x.classList.add("hidden"));$("view-"+name).classList.remove("hidden");document.querySelectorAll("#studentApp .nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===name));const titles={overview:"نظرة عامة",statement:"كشف الحساب",payments:"مدفوعاتي",notifications:"الإشعارات"};$("studentPageTitle").textContent=titles[name];$("studentBreadcrumb").textContent="الحساب المالي / "+titles[name];if(name==="notifications")openNotifications()}
function statusPill(s){return `<span class="status-pill ${s}">${statusText(s)}</span>`}
async function loadAccount(){
 const [pRes,cRes,payRes]=await Promise.all([
  client.from("profiles").select("id,student_number,full_name,college_id,major,academic_year,colleges(name)").eq("id",currentUser.id).single(),
  client.from("charges").select("id,amount,description,term_label,created_at,fee_types(name)").eq("student_id",currentUser.id).order("created_at",{ascending:false}),
  client.from("payments").select("id,amount,method,transaction_ref,payment_date,status,created_at,rejection_reason").eq("student_id",currentUser.id).order("created_at",{ascending:false})
 ]);
 if(pRes.error) throw pRes.error; profile=pRes.data;charges=cRes.data||[];payments=payRes.data||[];
 const total=charges.reduce((a,x)=>a+Number(x.amount),0),paid=payments.filter(x=>x.status==="confirmed").reduce((a,x)=>a+Number(x.amount),0),pending=payments.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount),0);
 const name=profile.full_name||"الطالب";$("studentName").textContent=name;$("welcomeName").textContent=name.split(" ")[0];$("studentNumber").textContent=profile.student_number||"—";$("studentAvatar").textContent=name[0]||"ط";
 $("studentRemaining").textContent=fmt(Math.max(0,total-paid));$("studentTotalFees").textContent=fmt(total);$("studentPaid").textContent=fmt(paid);$("studentPending").textContent=fmt(pending);
 renderStatement();renderPayments();renderOverview(total,paid);
}
function renderStatement(){
 const feeRows=charges.map(c=>`<tr><td>${esc(c.fee_types?.name||c.description||"رسوم")}</td><td>${esc(c.term_label||"—")}</td><td>${new Date(c.created_at).toLocaleDateString("ar")}</td><td>${fmt(c.amount)}</td><td><span class="status-pill">مستحق</span></td></tr>`);
 const payRows=payments.map(p=>`<tr><td>دفعة · ${esc(METHODS[p.method]||p.method)}</td><td>—</td><td>${new Date(p.created_at).toLocaleDateString("ar")}</td><td>${fmt(p.amount)}</td><td>${statusPill(p.status)}</td></tr>`);
 $("statementRows").innerHTML=[...feeRows,...payRows].join("")||'<tr><td colspan="5" class="empty-state">لا توجد حركات مالية مسجلة.</td></tr>';
}
function renderPayments(){
 $("paymentHistory").innerHTML=payments.map(p=>`<div class="activity-item"><div class="activity-symbol">↗</div><div class="activity-copy"><b>${fmt(p.amount)} · ${esc(METHODS[p.method]||p.method)}</b><small>${esc(p.transaction_ref)} · ${new Date(p.created_at).toLocaleDateString("ar")}</small>${p.status==="rejected"&&p.rejection_reason?`<small>سبب الرفض: ${esc(p.rejection_reason)}</small>`:""}</div>${statusPill(p.status)}</div>`).join("")||'<div class="empty-state">لم ترسل أي إثبات دفع بعد.</div>';
}
const dLong=d=>new Date(d).toLocaleDateString("ar",{day:"numeric",month:"long",year:"numeric"});
function ago(d){const m=Math.round((new Date(d)-Date.now())/60000),r=new Intl.RelativeTimeFormat("ar",{numeric:"auto"}),a=Math.abs(m);if(a<1)return "الآن";if(a<60)return r.format(m,"minute");if(a<1440)return r.format(Math.round(m/60),"hour");if(a<43200)return r.format(Math.round(m/1440),"day");return dLong(d)}
function renderOverview(total,paid){
 const pct=total>0?Math.min(100,Math.round(paid/total*100)):0;
 $("donutChart").style.setProperty("--p",pct);$("donutPct").textContent=pct+"%";
 $("payLogRows").innerHTML=payments.slice(0,4).map(p=>`<tr><td>${statusPill(p.status)}</td><td>${fmt(p.amount)}</td><td>${esc(p.transaction_ref)}</td><td>${dLong(p.payment_date||p.created_at)}</td></tr>`).join("")||'<tr><td colspan="4" class="empty-state">لا توجد دفعات مسجلة بعد.</td></tr>';
}
function renderOverviewNotifs(){
 const cls=k=>k==="fee"?"":k==="payment"?"n-payment":"n-other",ic=k=>k==="fee"?"📢":k==="payment"?"✓":"i";
 $("overviewNotifs").innerHTML=notifications.slice(0,3).map(n=>`<div class="notice-item ${cls(n.kind)}"><div class="activity-symbol">${ic(n.kind)}</div><b>${esc(n.title)}</b><small>${ago(n.created_at)}</small></div>`).join("")||'<div class="empty-state">لا توجد إشعارات.</div>';
}

/* ---------- الإشعارات ---------- */
async function loadNotifications(){
 const {data,error}=await client.from("notifications").select("id,title,body,kind,created_at,notification_recipients!inner(read_at,student_id)").eq("notification_recipients.student_id",currentUser.id).order("created_at",{ascending:false}).limit(50);
 if(error)return;
 notifications=(data||[]).map(n=>({id:n.id,title:n.title,body:n.body,kind:n.kind,created_at:n.created_at,unread:!(n.notification_recipients&&n.notification_recipients[0]&&n.notification_recipients[0].read_at)}));
 const unread=notifications.filter(n=>n.unread).length;
 $("notifBadge").textContent=unread;$("notifBadge").classList.toggle("hidden",!unread);
 if(knownUnread!==null&&unread>knownUnread)toast("وصلك إشعار جديد من الإدارة المالية");
 knownUnread=unread;
 renderNotifications();renderOverviewNotifs();
}
function renderNotifications(){
 $("notificationList").innerHTML=notifications.map(n=>`<div class="activity-item"><div class="activity-symbol">${n.kind==="fee"?"▤":"✉"}</div><div class="activity-copy"><b>${esc(n.title)}${n.unread?' <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--blue);margin-inline-start:6px"></span>':""}</b><small style="white-space:normal;line-height:1.9">${esc(n.body)}</small><small>${new Date(n.created_at).toLocaleDateString("ar")}</small></div></div>`).join("")||'<div class="empty-state">لا توجد إشعارات.</div>';
}
async function openNotifications(){
 renderNotifications();
 if(!notifications.some(n=>n.unread))return;
 await client.rpc("mark_notifications_read");
 knownUnread=0;$("notifBadge").classList.add("hidden");
 // نترك علامة غير المقروء ظاهرة حتى يغادر الطالب الصفحة ثم تتحدّث عند الجلب التالي
 setTimeout(()=>loadNotifications(),1500);
}
function startPolling(){clearInterval(pollTimer);knownUnread=null;loadNotifications();pollTimer=setInterval(()=>{if(currentUser)loadNotifications()},60000)}

async function enterApp(){
 await loadAccount();
 $("authScreen").classList.add("hidden");$("studentApp").classList.remove("hidden");
 startPolling();
}
async function handleLogin(e){e.preventDefault();if(!client){authMessage("أكمل إعداد config.js وملف قاعدة البيانات أولًا.");return}authMessage("جارٍ التحقق من بيانات الدخول...");
 const id=$("studentEmail").value.trim();const email=id.includes("@")?id:`${id}@${STUDENT_DOMAIN}`.toLowerCase();
 const {data,error}=await client.auth.signInWithPassword({email,password:$("studentPassword").value});if(error){authMessage("تعذر تسجيل الدخول. تحقق من البيانات أو تواصل مع الإدارة.");return}
 currentUser=data.user;try{await enterApp();showView("overview")}catch(err){await client.auth.signOut();authMessage("تعذر تحميل السجل: "+err.message)}}
async function submitPayment(e){e.preventDefault();if(!client)return;const file=$("paymentProof").files[0];if(!file||file.size>5*1024*1024){$("paymentMessage").textContent="اختر ملفًا لا يتجاوز 5MB.";return}if(!["image/png","image/jpeg","application/pdf"].includes(file.type)){toast("نوع الملف غير مدعوم");return}
 const ref=$("transactionRef").value.trim();
 const dup=await client.rpc("transaction_ref_exists",{p_ref:ref});if(dup.data===true){$("paymentMessage").textContent="رقم العملية مستخدم من قبل.";return}
 $("paymentMessage").textContent="جارٍ رفع الإثبات...";const ext=file.name.split(".").pop().toLowerCase(),path=`${currentUser.id}/${crypto.randomUUID()}.${ext}`;
 const up=await client.storage.from(CFG.STORAGE_BUCKET).upload(path,file,{upsert:false,contentType:file.type});if(up.error){$("paymentMessage").textContent="تعذر رفع الملف: "+up.error.message;return}
 const ins=await client.from("payments").insert({student_id:currentUser.id,amount:Number($("paymentAmount").value),method:$("paymentMethod").value,transaction_ref:ref,payment_date:$("paymentDate").value,proof_path:path,status:"pending"});
 if(ins.error){$("paymentMessage").textContent="تعذر تسجيل الدفعة: "+ins.error.message;return}
 $("paymentForm").reset();$("paymentMessage").textContent="تم إرسال إثبات الدفع للمراجعة.";await loadAccount();toast("تم إرسال إثبات الدفع");
}
async function logout(){clearInterval(pollTimer);if(client)await client.auth.signOut();currentUser=null;profile=null;notifications=[];$("studentApp").classList.add("hidden");$("authScreen").classList.remove("hidden")}
document.addEventListener("DOMContentLoaded",()=>{
 $("studentLoginForm").addEventListener("submit",handleLogin);$("paymentForm").addEventListener("submit",submitPayment);$("studentLogout").addEventListener("click",logout);$("printStatement").addEventListener("click",()=>window.print());
 document.querySelectorAll("#studentApp [data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));document.querySelectorAll("#studentApp [data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
 if(!client)authMessage("لم يتم إعداد Supabase بعد. راجع README قبل تجربة تسجيل الدخول.");
 if(client)client.auth.getSession().then(({data})=>{if(data.session){currentUser=data.session.user;enterApp().catch(()=>client.auth.signOut())}});
});
