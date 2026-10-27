/* Single source of the app version: the service worker's cache name (sw.js imports this file)
   and the footer label both read it. Bump it with the ?v= cache-bust. */
self.APP_VERSION = "v34";

/**
 * New service worker took control. Reload ONCE so the page runs the new code, but never on the
 * first install (no previous controller) and never twice within 30 s (no reload loops).
 * Returns true when it reloaded.
 */
self.stOnControllerChange = function ({ hadController, storage, reload, now }) {
  if (!hadController) return false;
  const KEY = "st-sw-reloaded-at";
  const last = Number(storage.getItem(KEY) || 0);
  if (now - last < 30000) return false;
  storage.setItem(KEY, String(now));
  reload();
  return true;
};
