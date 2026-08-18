const BASE = "/api";

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => req("GET", "/health"),

  listExams: () => req("GET", "/exams"),
  getExam: (examId) => req("GET", `/exams/${examId}`),
  reloadExams: () => req("POST", "/exams/reload"),
  // Returns the parsed body even on 400 (validation failure) instead of throwing, so the
  // caller can show the structured `errors` list rather than just a generic message.
  importExam: async (content) => {
    const res = await fetch(BASE + "/exams/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return res.json();
  },

  createSession: (examId, mode, opts = {}) => req("POST", "/sessions", { examId, mode, ...opts }),
  getSession: (id) => req("GET", `/sessions/${id}`),

  getSessionQuestion: (sid, qid) => req("GET", `/sessions/${sid}/questions/${qid}`),
  resetQuestion: (sid, qid) => req("POST", `/sessions/${sid}/questions/${qid}/reset`),
  checkQuestion: (sid, qid) => req("POST", `/sessions/${sid}/questions/${qid}/check`),
  setFlag: (sid, qid, flag) => req("POST", `/sessions/${sid}/questions/${qid}/flag`, { flag }),
  setNotes: (sid, qid, text) => req("POST", `/sessions/${sid}/questions/${qid}/notes`, { text }),

  submit: (sid) => req("POST", `/sessions/${sid}/submit`),
  getReport: (sid) => req("GET", `/sessions/${sid}/report`),

  resetEnvironment: () => req("POST", "/environment/reset"),
};
