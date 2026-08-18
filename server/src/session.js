const crypto = require("crypto");

/** In-memory session store. This is a single-user local tool, so no persistence needed. */
const sessions = new Map();

function createSession({ examId, mode, questionIds, durationMinutes }) {
  const id = crypto.randomUUID();
  const session = {
    id,
    examId,
    mode, // 'casual' | 'exam'
    questionIds,
    durationMinutes: durationMinutes || null,
    startedAt: Date.now(),
    submittedAt: null,
    flags: {},
    notes: {},
    initialized: {},
    results: {},
    report: null,
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) throw Object.assign(new Error("session not found"), { status: 404 });
  return s;
}

function timeRemainingMs(session) {
  if (session.mode !== "exam" || !session.durationMinutes) return null;
  const elapsed = Date.now() - session.startedAt;
  return Math.max(0, session.durationMinutes * 60 * 1000 - elapsed);
}

function isExpired(session) {
  const remaining = timeRemainingMs(session);
  return remaining !== null && remaining <= 0;
}

module.exports = { createSession, getSession, timeRemainingMs, isExpired, sessions };
