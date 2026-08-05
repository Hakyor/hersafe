/**
 * HerSafe — Statistics page.
 * Renders small, dependency-free canvas bar charts from aggregated data.
 */
(function () {
  function drawBarChart(canvas, labels, values, color) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 320;
    const cssHeight = canvas.clientHeight || 220;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!values.length) return;
    const max = Math.max(...values, 1);
    const padding = 28;
    const chartH = cssHeight - padding * 2;
    const barW = (cssWidth - padding * 2) / values.length;

    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "#8a9a94";
    ctx.textAlign = "center";

    values.forEach((v, i) => {
      const h = (v / max) * chartH;
      const x = padding + i * barW + barW * 0.15;
      const y = cssHeight - padding - h;
      const w = barW * 0.7;
      ctx.fillStyle = color;
      roundRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.fillStyle = "#8a9a94";
      ctx.fillText(String(labels[i]).slice(0, 8), x + w / 2, cssHeight - padding + 14);
      ctx.fillText(String(v), x + w / 2, y - 6);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function load() {
    const totalEl = document.querySelector("[data-total-reports]");
    try {
      const stats = await HerSafeAPI.getStatistics();
      if (totalEl) totalEl.textContent = stats.total_reports ?? "—";

      const byArea = stats.by_area || [];
      const byMonth = stats.by_month || [];
      const byType = stats.by_type || [];

      const areaCanvas = document.getElementById("chart-area");
      const monthCanvas = document.getElementById("chart-month");
      const typeCanvas = document.getElementById("chart-type");

      if (areaCanvas) drawBarChart(areaCanvas, byArea.map((d) => d.city), byArea.map((d) => d.count), "#1b6e62");
      if (monthCanvas) drawBarChart(monthCanvas, byMonth.map((d) => d.month), byMonth.map((d) => d.count), "#d9a24b");
      if (typeCanvas) drawBarChart(typeCanvas, byType.map((d) => d.incident_type), byType.map((d) => d.count), "#4fa696");
    } catch (_) {
      if (totalEl) totalEl.textContent = "—";
    }
  }

  document.addEventListener("DOMContentLoaded", load);
  window.addEventListener("resize", () => {
    clearTimeout(window._hsResizeTimer);
    window._hsResizeTimer = setTimeout(load, 200);
  });
})();
