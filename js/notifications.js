/**
 * HerSafe — Notifications page + shared unread-count badge.
 */
(function () {
  const TYPE_ICON = {
    report_reviewed: "📋", rating_confirmed: "✅", points_earned: "⭐", badge_earned: "🎖️",
  };

  async function loadList() {
    const list = document.getElementById("notifications-list");
    if (!list) return;
    if (!HerSafeAPI.isUserAuthed()) {
      list.innerHTML = `<p class="empty-state"><a href="auth.html?next=notifications.html" data-i18n="auth.sign_in">Sign In</a></p>`;
      return;
    }
    try {
      const data = await HerSafeAPI.getNotifications();
      if (!data.notifications.length) {
        list.innerHTML = `<p class="empty-state" data-i18n="notifications.empty">No notifications yet.</p>`;
        return;
      }
      list.innerHTML = data.notifications
        .map(
          (n) => `
        <div class="report-item" data-id="${n.id}" style="opacity:${n.read_at ? "0.6" : "1"}">
          <span>${TYPE_ICON[n.type] || "🔔"} ${escapeHtml(n.message)}</span>
          <div class="report-meta">${new Date(n.created_at).toLocaleString()}</div>
          ${!n.read_at ? `<button class="btn btn-ghost btn-sm" data-mark-read="${n.id}" data-i18n="notifications.mark_read">Mark as read</button>` : ""}
        </div>`
        )
        .join("");
      list.querySelectorAll("[data-mark-read]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await HerSafeAPI.markNotificationRead(btn.dataset.markRead);
          loadList();
        });
      });
    } catch (_) {
      list.innerHTML = `<p class="empty-state" data-i18n="notifications.empty">No notifications yet.</p>`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", loadList);
})();

/**
 * Shared unread-count badge, shown on the Profile drawer button when the
 * signed-in user has unread notifications. No-op for guests.
 */
(function () {
  async function updateBadge() {
    if (!window.HerSafeAPI || !HerSafeAPI.isUserAuthed()) return;
    try {
      const data = await HerSafeAPI.getNotifications();
      if (!data.unread_count) return;
      document.querySelectorAll("#hs-profile-btn").forEach((btn) => {
        if (btn.querySelector(".hs-badge-dot")) return;
        const dot = document.createElement("span");
        dot.className = "hs-badge-dot";
        dot.style.cssText = "position:absolute;top:2px;inset-inline-end:6px;width:9px;height:9px;border-radius:50%;background:var(--status-risk);border:2px solid var(--surface)";
        btn.style.position = "relative";
        btn.appendChild(dot);
      });
    } catch (_) { /* ignore */ }
  }
  document.addEventListener("DOMContentLoaded", () => setTimeout(updateBadge, 150));
})();
