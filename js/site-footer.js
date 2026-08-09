/**
 * HerSafe shared footer. Every page already has an empty-ish
 * <footer class="site-footer"><div class="container">...</div></footer>
 * shell; this fills it with the full footer content once, so the layout
 * only needs to be maintained in one place.
 */
(function () {
  const YEAR = new Date().getFullYear();

  function buildFooter() {
    const footerEl = document.querySelector(".site-footer");
    const container = document.querySelector(".site-footer .container");
    if (!container) return;
    footerEl.classList.add("hs-footer");

    // Two columns only — one "Contact" link lives in Legal, on purpose,
    // so it never appears twice on the page.
    container.innerHTML = `
      <div class="hs-footer-grid">
        <div class="hs-footer-col">
          <strong data-i18n="nav.menu">Menu</strong>
          <a href="index.html" data-i18n="nav.home">Home</a>
          <a href="map.html" data-i18n="nav.map">Safety Map</a>
          <a href="safety.html" data-i18n="nav.safety">Safety</a>
          <a href="statistics.html" data-i18n="nav.statistics">Statistics</a>
        </div>
        <div class="hs-footer-col">
          <strong data-i18n="footer.legal">Legal</strong>
          <a href="privacy.html" data-i18n="nav.privacy">Privacy Policy</a>
          <a href="terms.html" data-i18n="nav.terms">Terms</a>
          <a href="contact.html" data-i18n="nav.contact">Contact</a>
        </div>
      </div>
      <div class="hs-footer-social">
        <a href="https://github.com/Hakyor/hersafe" target="_blank" rel="noopener">GitHub</a>
        <span aria-hidden="true">·</span>
        <a href="https://hakyor.github.io/Hamzaforwebsits/" target="_blank" rel="noopener" data-i18n="contact.portfolio">Portfolio</a>
        <span aria-hidden="true">·</span>
        <a href="https://instagram.com/elekiaby_moza" target="_blank" rel="noopener" data-i18n="contact.instagram">Instagram</a>
      </div>
      <hr class="hs-footer-divider" />
      <p class="hint center" data-i18n="footer.rights">All community data is anonymous and aggregated.</p>
      <p class="hint center">© ${YEAR} Hamza Elekiaby — HerSafe</p>
    `;

    if (window.HERSAFE_DICT) {
      const dict = window.HERSAFE_DICT;
      const get = (obj, path) => path.split(".").reduce((acc, key) => (acc && key in acc ? acc[key] : null), obj);
      container.querySelectorAll("[data-i18n]").forEach((el) => {
        const val = get(dict, el.getAttribute("data-i18n"));
        if (val != null) el.textContent = val;
      });
    }
  }

  document.addEventListener("DOMContentLoaded", buildFooter);
})();
