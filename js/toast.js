/**
 * HerSafe toast notifications — extracted into its own file so every page
 * has HerSafeToast() available, regardless of which other scripts it loads.
 */
(function () {
  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
  }
  window.HerSafeToast = showToast;
})();
