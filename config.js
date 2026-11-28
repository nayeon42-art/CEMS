// ضع هنا بيانات مشروع Supabase الجديد (Project Settings -> API)
window.EDULEDGER_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_PUBLIC_KEY",
  STORAGE_BUCKET: "payment-proofs",   // إيصالات الدفع (خاص)
  AVATAR_BUCKET: "avatars",           // الصور الشخصية (عام)
  CURRENCY: "SDG",
  CURRENCY_LABEL: "ج.س",
  ACADEMY_NAME: "كلية العلوم الهندسية والطبية",
  STUDENT_EMAIL_DOMAIN: "students.cems.app", // لازم يطابق نفس القيمة في الـ Edge Function
  SEMESTERS: ["الأول", "الثاني", "الصيفي"]    // عدّل القائمة هنا لو تريد سمسترات مختلفة
};

window.edulegderReady = !!(
  window.EDULEDGER_CONFIG.SUPABASE_URL.startsWith("https://") &&
  !window.EDULEDGER_CONFIG.SUPABASE_URL.includes("YOUR_") &&
  !window.EDULEDGER_CONFIG.SUPABASE_ANON_KEY.includes("YOUR_")
);

window.edulegderClient = window.edulegderReady && window.supabase
  ? window.supabase.createClient(
      window.EDULEDGER_CONFIG.SUPABASE_URL,
      window.EDULEDGER_CONFIG.SUPABASE_ANON_KEY
    )
  : null;
