// ضع بيانات مشروع Supabase الخاص بـ EduLedger هنا.
// استخدم Project URL وPublishable (anon) key فقط. لا تضع service_role key في ملفات المتصفح.
window.EDULEDGER_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  STORAGE_BUCKET: "payment-proofs",
  CURRENCY: "SDG",
  CURRENCY_LABEL: "ج.س",
  ACADEMY_NAME: "الأكاديمية"
};
window.edulegderReady = !!(
  window.EDULEDGER_CONFIG.SUPABASE_URL.startsWith("https://") &&
  !window.EDULEDGER_CONFIG.SUPABASE_URL.includes("YOUR_") &&
  !window.EDULEDGER_CONFIG.SUPABASE_ANON_KEY.includes("YOUR_")
);
window.edulegderClient = window.edulegderReady && window.supabase
  ? window.supabase.createClient(window.EDULEDGER_CONFIG.SUPABASE_URL, window.EDULEDGER_CONFIG.SUPABASE_ANON_KEY)
  : null;
