import { useState } from "react";
import AddExamModal from "./AddExamModal.jsx";

export default function Home({
  health,
  exams,
  examErrors,
  onReloadExams,
  onStart,
  resumable,
  onResume,
  onDiscardResumable,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const ready = health && health.docker && health.bastion;
  const selected = exams.find((e) => e.id === selectedId);

  return (
    <div className="home">
      <h1>CKA Practice</h1>
      <p className="subtitle">
        A local, exam-style Kubernetes practice environment — real kind clusters, a real
        terminal, and auto-graded questions.
      </p>

      <div className={"health-banner " + (ready ? "ok" : "warn")}>
        {ready ? (
          <>Environment ready — Docker and the practice cluster are up.</>
        ) : (
          <>
            Environment not ready yet.{" "}
            {health && !health.docker
              ? "Docker doesn't seem to be running."
              : "Bastion container not found — run `npm run cluster:up` first."}
          </>
        )}
      </div>

      {resumable && (
        <div className="resume-banner">
          <div>
            <strong>Continue where you left off</strong>
            <p>
              {resumable.exam.title} — {resumable.session.mode === "exam" ? "Mock Exam" : "Casual Practice"}
              {resumable.session.report ? " — submitted, view results" : ""}
            </p>
            <p className="hint-text resume-progress">
              {Object.keys(resumable.session.initialized || {}).length} of{" "}
              {resumable.session.questionIds.length} questions visited
              {resumable.session.mode === "exam" &&
                !resumable.session.report &&
                resumable.session.timeRemainingMs != null &&
                ` — ${Math.max(0, Math.round(resumable.session.timeRemainingMs / 60000))} min left`}
            </p>
          </div>
          <div className="resume-actions">
            <button onClick={onResume}>Resume</button>
            <button className="secondary" onClick={onDiscardResumable}>
              Discard
            </button>
          </div>
        </div>
      )}

      {examErrors && examErrors.length > 0 && (
        <div className="health-banner warn exam-errors">
          <strong>{examErrors.length} exam file{examErrors.length === 1 ? "" : "s"} failed to load:</strong>
          <ul>
            {examErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!selected && (
        <>
          <div className="exam-picker-header">
            <h2>Choose an exam</h2>
            <div className="exam-picker-actions">
              <button onClick={() => setShowAddModal(true)}>+ Add Exam</button>
              <button className="secondary" onClick={onReloadExams}>
                ⟳ Reload exams
              </button>
            </div>
          </div>
          <p className="hint-text">
            Paste a YAML file with <strong>+ Add Exam</strong>, or drop one straight into{" "}
            <code>exams/</code> and click reload — no restart needed either way.
          </p>
          <div className="exam-cards">
            {exams.map((exam) => (
              <button key={exam.id} className="exam-card" onClick={() => setSelectedId(exam.id)}>
                <h3>{exam.title}</h3>
                {exam.description && <p>{exam.description}</p>}
                <div className="exam-facts">
                  <span>{exam.questionCount} questions</span>
                  <span>{exam.totalWeight}% total weight</span>
                  <span>~{exam.defaultDurationMinutes} min</span>
                </div>
              </button>
            ))}
            {exams.length === 0 && <p className="hint-text">No exams found in the exams/ folder.</p>}
          </div>
        </>
      )}

      {selected && (
        <>
          <div className="exam-picker-header">
            <button className="secondary" onClick={() => setSelectedId(null)}>
              ← Back to exams
            </button>
          </div>
          <h2>{selected.title}</h2>
          {selected.description && <p className="subtitle">{selected.description}</p>}

          <div className="mode-cards">
            <div className="mode-card">
              <h2>Casual Practice</h2>
              <p>Pick any question, work at your own pace, no clock. Check your answer any time.</p>
              <ul className="mode-facts">
                <li>{selected.questionCount} questions across all CKA domains</li>
                <li>Instant grading with partial credit</li>
                <li>Hints and reference solutions available</li>
              </ul>
              <button disabled={!ready} onClick={() => onStart(selected.id, "casual", {})}>
                Start Casual Practice
              </button>
            </div>

            <div className="mode-card exam">
              <h2>Timed Mock Exam</h2>
              <p>The real thing: a countdown clock, flagging, notes, and no feedback until you submit.</p>
              <ul className="mode-facts">
                <li>
                  {selected.questionCount} questions, {selected.defaultDurationMinutes} minutes
                </li>
                <li>Flag questions for review, add notes</li>
                <li>Full score report on submit, 66% to pass</li>
              </ul>
              <button
                disabled={!ready}
                onClick={() =>
                  onStart(selected.id, "exam", { durationMinutes: selected.defaultDurationMinutes })
                }
              >
                Start Mock Exam
              </button>
            </div>
          </div>
        </>
      )}

      {showAddModal && (
        <AddExamModal
          onClose={() => setShowAddModal(false)}
          onImported={onReloadExams}
        />
      )}
    </div>
  );
}
