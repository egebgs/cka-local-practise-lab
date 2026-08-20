const KEY = "cka-practice.activeSession";

/** Tracks the browser's "last known session" pointer in localStorage so a page
 * reload/reconnect can offer to resume exactly where you left off. This is purely a
 * client-side breadcrumb -- the actual session state always lives on the server. */

export function saveActiveSession(sessionId, lastQuestionId) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sessionId, lastQuestionId }));
  } catch {}
}

export function saveLastQuestion(sessionId, qid) {
  const current = loadActiveSession();
  if (!current || current.sessionId !== sessionId) return;
  saveActiveSession(sessionId, qid);
}

export function loadActiveSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

const LAYOUT_KEY = "cka-practice.layout";

export function loadLayoutPrefs() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLayoutPrefs(prefs) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...loadLayoutPrefs(), ...prefs }));
  } catch {}
}
