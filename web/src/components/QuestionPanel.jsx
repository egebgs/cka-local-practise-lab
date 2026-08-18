import { useEffect, useState } from "react";
import MarkdownLite from "../markdownLite.jsx";
import { api } from "../api.js";

export default function QuestionPanel({ sessionId, mode, questionId, initialNotes, initialResult, onNotesSaved, onResult }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState(initialNotes || "");
  const [result, setResult] = useState(initialResult || null);
  const [checking, setChecking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setShowHint(false);
    setShowSolution(false);
    api.getSessionQuestion(sessionId, questionId).then((data) => {
      if (cancelled) return;
      setDetail(data.question);
      setNotes(data.notes || "");
      setResult(data.result || null);
      onResult && onResult(questionId, data.result || null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, questionId]);

  if (loading || !detail) return <div className="question-panel loading">Loading question…</div>;

  const saveNotes = (text) => {
    setNotes(text);
    api.setNotes(sessionId, questionId, text).then(() => onNotesSaved && onNotesSaved(questionId, text));
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const r = await api.checkQuestion(sessionId, questionId);
      setResult(r);
      onResult && onResult(questionId, r);
    } finally {
      setChecking(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetQuestion(sessionId, questionId);
      setResult(null);
      onResult && onResult(questionId, null);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="question-panel">
      <div className="question-header">
        <span className="domain-tag">{detail.domain}</span>
        <span className="context-tag">context: {detail.contexts.join(", ")}</span>
      </div>

      <MarkdownLite text={detail.prompt} />

      {mode === "casual" && (
        <div className="casual-tools">
          <button onClick={handleCheck} disabled={checking}>
            {checking ? "Checking…" : "Check My Answer"}
          </button>
          <button onClick={handleReset} disabled={resetting} className="secondary">
            {resetting ? "Resetting…" : "Reset Question"}
          </button>
          <button onClick={() => setShowHint((v) => !v)} className="secondary">
            {showHint ? "Hide Hint" : "Show Hint"}
          </button>
          <button onClick={() => setShowSolution((v) => !v)} className="secondary">
            {showSolution ? "Hide Solution" : "Show Solution"}
          </button>
        </div>
      )}

      {mode === "exam" && (
        <div className="exam-tools">
          <button onClick={handleReset} disabled={resetting} className="secondary">
            {resetting ? "Resetting…" : "Reset Question"}
          </button>
        </div>
      )}

      {showHint && (
        <div className="hint-box">
          <strong>Hint</strong>
          <MarkdownLite text={detail.hint} />
        </div>
      )}
      {showSolution && (
        <div className="solution-box">
          <strong>Reference solution</strong>
          <pre>{detail.solution}</pre>
        </div>
      )}

      {result && (
        <div className={"result-box " + (result.passed ? "pass" : "fail")}>
          <div className="result-header">
            {result.passed ? "✓ Passed" : "✗ Not yet"} — {result.score}/{result.maxScore}
          </div>
          <ul>
            {result.criteria.map((c, i) => (
              <li key={i} className={c.passed ? "crit-pass" : "crit-fail"}>
                {c.passed ? "✓" : "✗"} {c.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="notes-box">
        <label>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="Scratch notes for this question…"
        />
      </div>
    </div>
  );
}
