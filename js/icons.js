/**
 * HerSafe icon set — small hand-drawn line icons (24x24, currentColor).
 * Replaces emoji everywhere so icons inherit the surrounding text color,
 * stay crisp at any size, and look identical on every device/OS.
 * Usage: HerSafeIcons.get("shield", 20)  ->  "<svg ...>...</svg>"
 */
(function () {
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/>',
    map: '<path d="M9 4 3 6.5v14L9 18l6 2.5L21 18V4l-6 2.5"/><path d="M9 4v14"/><path d="M15 6.5v14"/>',
    shield: '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/>',
    badge: '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
    person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
    users: '<circle cx="9" cy="8.5" r="3"/><path d="M3 19.5c.8-3.3 3.1-5 6-5s5.2 1.7 6 5"/><path d="M16 5.8a3 3 0 0 1 0 5.4"/><path d="M18 14.8c1.6.6 2.7 2 3 4.2"/>',
    key: '<circle cx="8" cy="14.5" r="3.5"/><path d="M10.8 12 19 3.8"/><path d="M15.5 7.3l2.3 2.3"/><path d="M13 9.8l2 2"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    star: '<path d="M12 3.5 14.5 9l6 .8-4.3 4.2 1 6-5.2-2.9L7.8 20l1-6L4.5 9.8l6-.8Z"/>',
    heart: '<path d="M12 20s-7-4.4-9.3-9A5 5 0 0 1 12 6.5 5 5 0 0 1 21.3 11c-2.3 4.6-9.3 9-9.3 9Z"/>',
    laptop: '<rect x="4" y="5" width="16" height="10.5" rx="1.5"/><path d="M2.5 19.5h19"/>',
    megaphone: '<path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H6l1 4.5h2L8 15h2l7 4V5l-7 4H4.5A1.5 1.5 0 0 0 3 10.5Z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 0 4 23.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 1 2.5 2.5Z"/>',
    cross: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>',
    pill: '<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-30 12 12)"/><path d="M9.5 8.5l5 7"/>',
    graduation: '<path d="M2 9 12 4l10 5-10 5-10-5Z"/><path d="M6 11.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.5"/>',
    pin: '<path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/>',
    store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.5 2.5L16 9.3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    phone: '<path d="M6 3h3l1.5 4.5-2 1.5a11 11 0 0 0 5 5l1.5-2L19 13.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 4.5 4.6 1.5 1.5 0 0 1 6 3Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
    camera: '<rect x="3" y="6" width="18" height="14" rx="3.5"/><circle cx="12" cy="13" r="3.6"/><circle cx="17.2" cy="9.6" r=".6" fill="currentColor"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5"/><path d="M3 13h18"/>',
    up: '<path d="M8 10v10H4V10Z"/><path d="M8 10l3.5-6.5a1.6 1.6 0 0 1 3 .7L14 8h4.3a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17 19H8"/>',
    down: '<path d="M8 14V4H4v10Z"/><path d="M8 14l3.5 6.5a1.6 1.6 0 0 0 3-.7L14 16h4.3a2 2 0 0 0 2-2.4l-1.4-7A2 2 0 0 0 17 5H8"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".7" fill="currentColor"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4.5h11l-2 4 2 4H5"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5"/><path d="M9 11h6M9 15h4"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="M14.5 7.5l3 3"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16v4M17 18h4"/>',
    medal: '<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 3.5 10.5 10M15.5 3.5 13.5 10"/><path d="m12 12.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2L9.1 14.3l2-.3Z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H4.5v1.5A3 3 0 0 0 8 10.5M16 6h3.5v1.5A3 3 0 0 1 16 10.5"/><path d="M12 13v4M8.5 20.5h7M9.5 17h5"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  };

  function get(name, size, extra) {
    const body = P[name];
    if (!body) return "";
    const s = size || 20;
    return (
      '<svg class="hs-ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false"' + (extra ? " " + extra : "") + ">" + body + "</svg>"
    );
  }

  window.HerSafeIcons = { get, names: Object.keys(P) };
})();
