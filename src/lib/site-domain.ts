// Cookerist's original hosting URL. Left enabled indefinitely alongside the
// cookerist.com custom domain (see CLAUDE.md's "Custom domain added" note —
// a hard redirect would orphan anyone's localStorage-only data and kick an
// installed PWA out of standalone mode, since both are origin-scoped) but
// slated to be retired eventually. `OldSiteMigrationNotice` shows only when
// a visitor is actually on this hostname.
export const OLD_SITE_HOSTNAME = "cookerist.jameseuangel-limpiado.workers.dev";
export const NEW_SITE_URL = "https://cookerist.com";
