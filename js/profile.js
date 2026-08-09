/**
 * HerSafe — Profile page.
 */
(function () {
  const BADGE_ICON = {
    first_report: "📝", street_explorer: "🧭", trusted_reporter: "🛡️",
    safety_helper: "🤝", top_contributor: "🌟", points_100: "💯",
    points_500: "🏅", points_1000: "🏆",
  };

  async function load() {
    const guestBox = document.getElementById("profile-guest");
    const content = document.getElementById("profile-content");

    if (!HerSafeAPI.isUserAuthed()) {
      guestBox.hidden = false;
      content.hidden = true;
      return;
    }

    try {
      const profile = await HerSafeAPI.getProfile();
      guestBox.hidden = true;
      content.hidden = false;

      document.getElementById("profile-name").textContent = profile.name;
      document.getElementById("profile-email").textContent = profile.email;
      document.getElementById("profile-since").textContent = new Date(profile.member_since).toLocaleDateString();
      document.getElementById("stat-points").textContent = profile.points;
      document.getElementById("stat-trust").textContent = `${profile.trust_score}/100`;
      document.getElementById("stat-level").textContent = HerSafeI18n.t("profile.level_" + profile.trust_level);
      document.getElementById("stat-reports").textContent = profile.reports_submitted;
      document.getElementById("stat-ratings").textContent = profile.street_ratings_submitted;
      document.getElementById("stat-helpful").textContent = profile.helpful_votes_received;

      const badgesBox = document.getElementById("badges-list");
      if (!profile.badges.length) {
        badgesBox.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p data-i18n="profile.no_badges">No badges yet.</p></div>`;
      } else {
        badgesBox.innerHTML = profile.badges
          .map(
            (key) => `<div class="card center">
              <div style="font-size:1.8rem">${BADGE_ICON[key] || "🎖️"}</div>
              <strong>${HerSafeI18n.t("badges." + key) || key}</strong>
            </div>`
          )
          .join("");
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        HerSafeAPI.logout();
        guestBox.hidden = false;
        content.hidden = true;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
