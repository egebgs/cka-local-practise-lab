import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { saveActiveSession, saveLastQuestion, loadActiveSession, clearActiveSession } from "./persist.js";
import Home from "./components/Home.jsx";
import QuestionList from "./components/QuestionList.jsx";
import QuestionPanel from "./components/QuestionPanel.jsx";
import TerminalPanel from "./components/Terminal.jsx";
import Timer from "./components/Timer.jsx";
import ReviewScreen from "./components/ReviewScreen.jsx";
import ResultsReport from "./components/ResultsReport.jsx";

export default function App() {
  const [health, setHealth] = useState(null);
  const [exams, setExams] = useState([]);
  const [examErrors, setExamErrors] = useState([]);
  const [examQuestions, setExamQuestions] = useState([]); // question metadata for the active session's exam
  const [session, setSession] = useState(null);
  const [view, setView] = useState("home"); // home | working | review | results
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [flags, setFlags] = useState({});
  const [notes, setNotes] = useState({});
  const [results, setResults] = useState({});
  const [report, setReport] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resumable, setResumable] = useState(null); // { session, exam } for a previously-left session, if any
  const [resettingEnv, setResettingEnv] = useState(false);

  const loadExams = useCallback(() => {
    api
      .listExams()
      .then((data) => {
        setExams(data.exams);
        setExamErrors(data.errors || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // On first load, see if there's a session we were previously working on (browser
  // refresh, closed tab, connection drop, ...) that's still alive on the server.
  useEffect(() => {
    const pointer = loadActiveSession();
    if (!pointer) return;
    (async () => {
      try {
        const s = await api.getSession(pointer.sessionId);
        const exam = await api.getExam(s.examId);
        setResumable({ session: s, exam, lastQuestionId: pointer.lastQuestionId });
      } catch {
        clearActiveSession();
      }
    })();
  }, []);

  useEffect(() => {
    if (view !== "home") return;
    let stopped = false;
    const poll = () => {
      api
        .health()
        .then((h) => !stopped && setHealth(h))
        .catch(() => !stopped && setHealth({ docker: false, bastion: false }));
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [view]);

  const sessionQuestions = session
    ? session.questionIds.map((id) => examQuestions.find((q) => q.id === id)).filter(Boolean)
    : [];

  const handleReloadExams = async () => {
    const data = await api.reloadExams();
    setExamErrors(data.errors || []);
    loadExams();
  };

  const enterSession = (s, exam, questionId) => {
    setExamQuestions(exam.questions);
    setSession(s);
    setFlags(s.flags || {});
    setNotes(s.notes || {});
    setResults(s.results || {});
    if (s.report) {
      setReport(s.report);
      setView("results");
    } else {
      const qid = questionId && s.questionIds.includes(questionId) ? questionId : s.questionIds[0];
      setCurrentQuestionId(qid);
      saveActiveSession(s.id, qid);
      setView("working");
    }
  };

  const handleStart = async (examId, mode, opts) => {
    const [s, exam] = await Promise.all([api.createSession(examId, mode, opts), api.getExam(examId)]);
    setResumable(null);
    enterSession(s, exam, s.questionIds[0]);
  };

  const handleResume = () => {
    if (!resumable) return;
    enterSession(resumable.session, resumable.exam, resumable.lastQuestionId);
    setResumable(null);
  };

  const handleDiscardResumable = async () => {
    clearActiveSession();
    setResumable(null);
    // an abandoned session can leave the same kind of leftover cluster state as a
    // finished one (namespaces, cordons, broken kubelet, ...) -- clean it up too.
    setResettingEnv(true);
    try {
      await api.resetEnvironment();
    } catch {
    } finally {
      setResettingEnv(false);
    }
  };

  const selectQuestion = (qid) => {
    setCurrentQuestionId(qid);
    if (session) saveLastQuestion(session.id, qid);
  };

  const handleToggleFlag = async (qid, flag) => {
    setFlags((f) => ({ ...f, [qid]: flag }));
    await api.setFlag(session.id, qid, flag);
  };

  const handleNotesSaved = useCallback((qid, text) => {
    setNotes((n) => ({ ...n, [qid]: text }));
  }, []);

  const handleResult = useCallback((qid, result) => {
    setResults((r) => ({ ...r, [qid]: result }));
  }, []);

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const r = await api.submit(session.id);
      setReport(r);
      setView("results");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackHome = async () => {
    clearActiveSession();
    // settle session/view *before* the async reset starts (rather than after) so
    // there's no window where resettingEnv is false again but session is already null
    // -- the overlay below takes priority over view anyway, but this keeps the two
    // pieces of state from ever being able to render an invalid combination.
    setSession(null);
    setReport(null);
    setView("home");
    setResettingEnv(true);
    try {
      await api.resetEnvironment();
    } catch {
      // best-effort: still return the student to Home even if cleanup hit an error
    } finally {
      setResettingEnv(false);
    }
  };

  if (resettingEnv) {
    return (
      <div className="reset-overlay">
        <div className="reset-spinner" />
        <p>Resetting the practice environment…</p>
        <p className="hint-text">Clearing namespaces, node taints, and any node-level changes.</p>
      </div>
    );
  }

  if (view === "home") {
    return (
      <Home
        health={health}
        exams={exams}
        examErrors={examErrors}
        onReloadExams={handleReloadExams}
        onStart={handleStart}
        resumable={resumable}
        onResume={handleResume}
        onDiscardResumable={handleDiscardResumable}
      />
    );
  }

  if (view === "results" && report) {
    return <ResultsReport report={report} onBackHome={handleBackHome} />;
  }

  if (view === "review") {
    return (
      <ReviewScreen
        questions={sessionQuestions}
        flags={flags}
        notes={notes}
        onJump={(qid) => {
          selectQuestion(qid);
          setView("working");
        }}
        onSubmit={doSubmit}
        submitting={submitting}
      />
    );
  }

  if (!session) return null; // defensive: view/session are always settled together above

  const deadline = session.mode === "exam" ? session.startedAt + session.durationMinutes * 60000 : null;

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="top-bar-left">
          <strong>{session.mode === "exam" ? "Mock Exam" : "Casual Practice"}</strong>
        </div>
        <div className="top-bar-right">
          {session.mode === "exam" && deadline && <Timer deadline={deadline} onExpire={doSubmit} />}
          {session.mode === "exam" ? (
            <button onClick={() => setView("review")}>Review &amp; Submit</button>
          ) : (
            <button onClick={handleBackHome} className="secondary">
              Finish
            </button>
          )}
        </div>
      </div>
      <div className="main-grid">
        <QuestionList
          questions={sessionQuestions}
          currentId={currentQuestionId}
          flags={flags}
          results={results}
          mode={session.mode}
          onSelect={selectQuestion}
          onToggleFlag={handleToggleFlag}
        />
        <QuestionPanel
          key={currentQuestionId}
          sessionId={session.id}
          mode={session.mode}
          questionId={currentQuestionId}
          initialNotes={notes[currentQuestionId]}
          initialResult={results[currentQuestionId]}
          onNotesSaved={handleNotesSaved}
          onResult={handleResult}
        />
        <TerminalPanel sessionId={session.id} />
      </div>
    </div>
  );
}
