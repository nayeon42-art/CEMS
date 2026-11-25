
window.EDULEDGER_CONFIG = {
  SUPABASE_URL: "https://scbnwrtnoyqfxaydrjjq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_YeyhrF3otbmjkUU9uP8mGQ_KO_HU1Fs",
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
  ? window.supabase.createClient(
      window.EDULEDGER_CONFIG.SUPABASE_URL,
      window.EDULEDGER_CONFIG.SUPABASE_ANON_KEY
    )
  : null;
