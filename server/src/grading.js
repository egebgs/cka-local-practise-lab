const loader = require("./examEngine/loader");
const kubectl = require("./kubectl");
const { runSteps } = require("./examEngine/steps");
const { runChecks } = require("./examEngine/checks");

function getQuestionOrThrow(examId, qid) {
  const question = loader.getQuestion(examId, qid);
  if (!question) throw Object.assign(new Error(`unknown question "${qid}" in exam "${examId}"`), { status: 404 });
  return question;
}

async function initQuestion(session, qid, { force = false } = {}) {
  const question = getQuestionOrThrow(session.examId, qid);
  if (session.initialized[qid] && !force) return;

  const defaultContext = question.contexts[0];
  const log = (msg) => console.warn(`[setup ${session.examId}/${qid}] ${msg}`);

  if (question.namespace) {
    await kubectl.run(defaultContext, ["delete", "namespace", question.namespace, "--ignore-not-found", "--wait=true"]);
    await kubectl.apply(defaultContext, `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${question.namespace}\n`);
  }
  await runSteps(question.setup, { defaultContext, log });

  session.initialized[qid] = true;
  delete session.results[qid]; // stale after (re)setup
}

async function checkQuestion(session, qid) {
  const question = getQuestionOrThrow(session.examId, qid);
  const result = await runChecks(question.checks, question.contexts[0]);
  session.results[qid] = { ...result, checkedAt: Date.now() };
  return session.results[qid];
}

async function gradeAll(session) {
  const report = { gradedAt: Date.now(), questions: [], totalScore: 0, totalMax: 0 };
  for (const qid of session.questionIds) {
    const question = getQuestionOrThrow(session.examId, qid);
    let result;
    try {
      // A question the exam-taker never opened must still be graded against its own
      // clean starting state, not whatever stale/shared cluster state happens to be
      // lying around (which can otherwise vacuously satisfy "nothing bad exists" checks).
      await initQuestion(session, qid);
      result = await runChecks(question.checks, question.contexts[0]);
    } catch (err) {
      result = { passed: false, score: 0, maxScore: 100, criteria: [], error: String(err) };
    }
    session.results[qid] = { ...result, checkedAt: Date.now() };
    report.totalScore += result.score * question.weight;
    report.totalMax += result.maxScore * question.weight;
    report.questions.push({
      id: qid,
      title: question.title,
      domain: question.domain,
      weight: question.weight,
      ...result,
    });
  }
  report.percent = report.totalMax > 0 ? Math.round((report.totalScore / report.totalMax) * 100) : 0;
  report.passed = report.percent >= 66; // real CKA passing threshold
  session.report = report;
  session.submittedAt = Date.now();
  return report;
}

module.exports = { initQuestion, checkQuestion, gradeAll };
