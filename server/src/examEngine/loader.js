const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const EXAMS_DIR = path.join(__dirname, "..", "..", "..", "exams");

function validateExam(doc, fileName) {
  const errors = [];
  const prefix = (msg) => errors.push(`${fileName}: ${msg}`);

  if (doc.kind !== "Exam") prefix(`top-level "kind" must be "Exam" (got ${JSON.stringify(doc.kind)})`);
  if (!doc.metadata || !doc.metadata.id) prefix(`missing required "metadata.id"`);
  if (!doc.metadata || !doc.metadata.title) prefix(`missing required "metadata.title"`);
  if (!Array.isArray(doc.questions) || doc.questions.length === 0) {
    prefix(`"questions" must be a non-empty array`);
    return errors; // nothing more we can safely check
  }

  const seenIds = new Set();
  doc.questions.forEach((q, i) => {
    const loc = `questions[${i}]${q && q.id ? ` (${q.id})` : ""}`;
    if (!q.id) prefix(`${loc}: missing required "id"`);
    else if (seenIds.has(q.id)) prefix(`${loc}: duplicate question id "${q.id}" within this exam`);
    else seenIds.add(q.id);

    if (!q.domain) prefix(`${loc}: missing required "domain"`);
    if (typeof q.weight !== "number") prefix(`${loc}: missing/invalid "weight" (must be a number)`);
    if (!q.title) prefix(`${loc}: missing required "title"`);
    if (!Array.isArray(q.contexts) || q.contexts.length === 0) {
      prefix(`${loc}: "contexts" must be a non-empty array, e.g. ["k8s-c1"]`);
    }
    if (!q.prompt) prefix(`${loc}: missing required "prompt"`);

    (q.checks || []).forEach((c, ci) => {
      const cloc = `${loc}.checks[${ci}]`;
      if (!c.description) prefix(`${cloc}: missing required "description"`);
      const types = ["get", "list", "kubectl", "shell"].filter((t) => t in c);
      if (types.length !== 1) {
        prefix(`${cloc}: must have exactly one of get/list/kubectl/shell (found: ${types.join(", ") || "none"})`);
      }
    });

    (q.setup || []).forEach((s, si) => {
      const sloc = `${loc}.setup[${si}]`;
      const types = ["apply", "kubectl", "shell"].filter((t) => t in s);
      if (types.length !== 1) {
        prefix(`${sloc}: must have exactly one of apply/kubectl/shell (found: ${types.join(", ") || "none"})`);
      }
    });
  });

  return errors;
}

function normalizeExam(doc, fileName) {
  const meta = doc.metadata;
  const questions = doc.questions.map((q) => ({
    id: q.id,
    examId: meta.id,
    domain: q.domain,
    weight: q.weight,
    points: q.weight,
    title: q.title,
    contexts: q.contexts,
    prompt: q.prompt,
    hint: q.hint || "",
    solution: q.solution || "",
    namespace: q.namespace || null,
    setup: q.setup || [],
    checks: q.checks || [],
  }));

  return {
    id: meta.id,
    title: meta.title,
    description: meta.description || "",
    defaultDurationMinutes: meta.defaultDurationMinutes || questions.length * 6,
    sourceFile: fileName,
    questions,
    questionsById: new Map(questions.map((q) => [q.id, q])),
  };
}

/** Parses + validates raw YAML text (from disk or from an in-memory upload) without
 * touching any global state. Returns { exam } on success or { errors } on failure. */
function parseAndValidate(rawYaml, fileName) {
  let doc;
  try {
    doc = yaml.load(rawYaml);
  } catch (err) {
    return { errors: [`${fileName}: failed to parse YAML: ${err.message}`] };
  }
  if (!doc || typeof doc !== "object") {
    return { errors: [`${fileName}: empty or invalid document`] };
  }

  const fileErrors = validateExam(doc, fileName);
  if (fileErrors.length > 0) return { errors: fileErrors };

  return { exam: normalizeExam(doc, fileName) };
}

function loadAll() {
  const exams = new Map();
  const errors = [];

  if (!fs.existsSync(EXAMS_DIR)) {
    errors.push(`exams directory not found: ${EXAMS_DIR}`);
    return { exams, errors };
  }

  const files = fs
    .readdirSync(EXAMS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  for (const file of files) {
    const full = path.join(EXAMS_DIR, file);
    const result = parseAndValidate(fs.readFileSync(full, "utf8"), file);
    if (result.errors) {
      errors.push(...result.errors);
      continue;
    }

    const exam = result.exam;
    if (exams.has(exam.id)) {
      errors.push(`${file}: duplicate exam id "${exam.id}" (already loaded from ${exams.get(exam.id).sourceFile})`);
      continue;
    }
    exams.set(exam.id, exam);
  }

  return { exams, errors };
}

let _state = null;
function state() {
  if (!_state) _state = loadAll();
  return _state;
}

function reload() {
  _state = loadAll();
  return _state;
}

function listExams() {
  return Array.from(state().exams.values());
}

function getExam(examId) {
  return state().exams.get(examId);
}

function getQuestion(examId, qid) {
  const exam = getExam(examId);
  return exam && exam.questionsById.get(qid);
}

function loadErrors() {
  return state().errors;
}

module.exports = { listExams, getExam, getQuestion, reload, loadErrors, parseAndValidate, EXAMS_DIR };
