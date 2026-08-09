/**
 * HerSafe i18n
 * Loads translation JSON files and applies them to any element carrying
 * data-i18n="dot.path" (text content) or data-i18n-placeholder="dot.path".
 * No text is ever hardcoded in HTML beyond fallback skeletons.
 */
(function () {
  const SUPPORTED = ["en", "ar"];
  const RTL_LANGS = ["ar"];
  const STORAGE_KEY = "hersafe:lang";

  function getPath(base) {
    // Resolve translations path relative to the page, works for GitHub Pages subpaths.
    const script = document.currentScript || document.querySelector('script[src*="i18n.js"]');
    const srcDir = script ? script.src.replace(/js\/i18n\.js.*$/, "") : "./";
    return srcDir + "translations/" + base + ".json";
  }

  function get(obj, path) {
    return path.split(".").reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj);
  }

  function detectLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
    // HerSafe currently serves Egypt only — default to Arabic regardless of
    // browser locale, but still honor English if the person explicitly
    // switches (persisted above via STORAGE_KEY).
    return "ar";
  }

  async function loadDict(lang) {
    const res = await fetch(getPath(lang));
    if (!res.ok) throw new Error("Failed to load translations for " + lang);
    return res.json();
  }

  function applyDict(dict) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const val = get(dict, el.getAttribute("data-i18n"));
      if (val != null) el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const val = get(dict, el.getAttribute("data-i18n-placeholder"));
      if (val != null) el.setAttribute("placeholder", val);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const val = get(dict, el.getAttribute("data-i18n-aria-label"));
      if (val != null) el.setAttribute("aria-label", val);
    });
    const title = get(dict, "meta.title");
    const desc = get(dict, "meta.description");
    if (title) document.title = title;
    if (desc) {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", desc);
    }
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = "en";
    const isRtl = RTL_LANGS.includes(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    localStorage.setItem(STORAGE_KEY, lang);
    try {
      const dict = await loadDict(lang);
      window.HERSAFE_DICT = dict;
      applyDict(dict);
      document.dispatchEvent(new CustomEvent("hersafe:i18n-ready", { detail: { lang, dict } }));
    } catch (err) {
      console.error(err);
    }
  }

  function t(path) {
    return (window.HERSAFE_DICT && get(window.HERSAFE_DICT, path)) || path;
  }

  function toggleLang() {
    const current = document.documentElement.lang || "en";
    setLang(current === "en" ? "ar" : "en");
  }

  window.HerSafeI18n = { setLang, toggleLang, t, SUPPORTED };

  document.addEventListener("DOMContentLoaded", () => {
    setLang(detectLang());
  });

  // Event delegation instead of querySelectorAll+addEventListener: this
  // works even for buttons injected later (e.g. the mobile drawer, added
  // by bottom-nav.js after this file's own DOMContentLoaded already ran),
  // and can't silently stop working if script load order ever changes.
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='toggle-lang']")) toggleLang();
  });
})();
