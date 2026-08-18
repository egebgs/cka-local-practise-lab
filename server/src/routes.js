const express = require("express");
const fs = require("fs");
const path = require("path");
const loader = require("./examEngine/loader");
const sessionStore = require("./session");
const grading = require("./grading");
const { ping, getBastion } = require("./docker");
const { resetEnvironment } = require("./environmentReset");

const router = express.Router();

function questionListMeta(q) {
  return { id: q.id, domain: q.domain, weight: q.weight, title: q.title, points: q.points };
}

function questionDetail(q) {
  return {
    id: q.id,
    domain: q.domain,
    weight: q.weight,
    points: q.points,
    title: q.title,
    contexts: q.contexts,
    prompt: q.prompt,
    hint: q.hint,
    solution: q.solution,
  };
}

function publicSession(s) {
  return {
    id: s.id,
    examId: s.examId,
    mode: s.mode,
    questionIds: s.questionIds,
    durationMinutes: s.durationMinutes,
    startedAt: s.startedAt,
    submittedAt: s.submittedAt,
    timeRemainingMs: sessionStore.timeRemainingMs(s),
    expired: sessionStore.isExpired(s),
    flags: s.flags,
    notes: s.notes,
    initialized: s.initialized,
    results: s.mode === "exam" && !s.submittedAt ? {} : s.results, // no peeking mid-exam
    report: s.report,
  };
}

router.get("/health", async (req, res) => {
  const status = { docker: false, bastion: false };
  try {
    await ping();
    status.docker = true;
  } catch {}
  try {
    await getBastion();
    status.bastion = true;
  } catch {}
  status.examLoadErrors = loader.loadErrors();
  res.json(status);
});

router.post("/environment/reset", async (req, res, next) => {
  try {
    const logs = await resetEnvironment();
    res.json({ ok: true, logs });
  } catch (err) {
    next(err);
  }
});

router.get("/exams", (req, res) => {
  const exams = loader.listExams().map((exam) => ({
    id: exam.id,
    title: exam.title,
    description: exam.description,
    defaultDurationMinutes: exam.defaultDurationMinutes,
    questionCount: exam.questions.length,
    totalWeight: exam.questions.reduce((sum, q) => sum + q.weight, 0),
  }));
  res.json({ exams, errors: loader.loadErrors() });
});

router.post("/exams/reload", (req, res) => {
  loader.reload();
  const exams = loader.listExams().map((e) => ({ id: e.id, title: e.title }));
  res.json({ exams, errors: loader.loadErrors() });
});

router.post("/exams/import", (req, res) => {
  const content = (req.body && req.body.content) || "";
  if (!content.trim()) return res.status(400).json({ errors: ["No YAML content provided"] });

  // Validate before touching disk -- a bad paste should never leave a broken file behind.
  const result = loader.parseAndValidate(content, "(pasted exam)");
  if (result.errors) return res.status(400).json({ errors: result.errors });

  const slug = result.exam.id
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "exam";
  const fileName = `${slug}.yaml`;
  fs.writeFileSync(path.join(loader.EXAMS_DIR, fileName), content, "utf8");

  loader.reload();
  const savedExam = loader.getExam(result.exam.id);
  const imported = !!savedExam && savedExam.sourceFile === fileName;
  res.json({
    imported,
    fileName,
    examId: result.exam.id,
    exams: loader.listExams().map((e) => ({ id: e.id, title: e.title })),
    errors: loader.loadErrors(),
  });
});

router.get("/exams/:examId", (req, res) => {
  const exam = loader.getExam(req.params.examId);
  if (!exam) return res.status(404).json({ error: "exam not found" });
  res.json({
    id: exam.id,
    title: exam.title,
    description: exam.description,
    defaultDurationMinutes: exam.defaultDurationMinutes,
    questions: exam.questions.map(questionListMeta),
  });
});

router.post("/sessions", (req, res) => {
  const { examId, mode, questionIds, durationMinutes } = req.body || {};
  if (mode !== "casual" && mode !== "exam") {
    return res.status(400).json({ error: "mode must be 'casual' or 'exam'" });
  }
  const exam = loader.getExam(examId);
  if (!exam) return res.status(404).json({ error: `exam "${examId}" not found` });

  const allIds = exam.questions.map((q) => q.id);
  const ids = Array.isArray(questionIds) && questionIds.length ? questionIds : allIds;
  const duration = mode === "exam" ? durationMinutes || exam.defaultDurationMinutes : null;
  const session = sessionStore.createSession({ examId, mode, questionIds: ids, durationMinutes: duration });
  res.json(publicSession(session));
});

router.get("/sessions/:id", (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  res.json(publicSession(session));
});

router.get("/sessions/:id/questions/:qid", async (req, res, next) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    const question = loader.getQuestion(session.examId, req.params.qid);
    if (!question) return res.status(404).json({ error: "not found" });
    await grading.initQuestion(session, req.params.qid);
    res.json({
      question: questionDetail(question),
      flag: !!session.flags[req.params.qid],
      notes: session.notes[req.params.qid] || "",
      result: session.mode === "casual" ? session.results[req.params.qid] || null : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/:id/questions/:qid/reset", async (req, res, next) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (!loader.getQuestion(session.examId, req.params.qid)) return res.status(404).json({ error: "not found" });
    await grading.initQuestion(session, req.params.qid, { force: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/:id/questions/:qid/check", async (req, res, next) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (session.mode === "exam" && !session.submittedAt) {
      return res.status(403).json({ error: "No live grading during the exam. Submit to see your results." });
    }
    if (!loader.getQuestion(session.examId, req.params.qid)) return res.status(404).json({ error: "not found" });
    const result = await grading.checkQuestion(session, req.params.qid);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/:id/questions/:qid/flag", (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  session.flags[req.params.qid] = !!(req.body && req.body.flag);
  res.json({ ok: true });
});

router.post("/sessions/:id/questions/:qid/notes", (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  session.notes[req.params.qid] = (req.body && req.body.text) || "";
  res.json({ ok: true });
});

router.post("/sessions/:id/submit", async (req, res, next) => {
  try {
    const session = sessionStore.getSession(req.params.id);
    if (session.submittedAt) return res.json(session.report);
    const report = await grading.gradeAll(session);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

router.get("/sessions/:id/report", (req, res) => {
  const session = sessionStore.getSession(req.params.id);
  if (!session.report) return res.status(404).json({ error: "not submitted yet" });
  res.json(session.report);
});

module.exports = router;
