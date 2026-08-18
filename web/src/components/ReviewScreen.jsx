export default function ReviewScreen({ questions, flags, notes, onJump, onSubmit, submitting }) {
  const flaggedCount = questions.filter((q) => flags[q.id]).length;
  const notedCount = questions.filter((q) => (notes[q.id] || "").trim().length > 0).length;

  return (
    <div className="review-screen">
      <h2>Review before you submit</h2>
      <p>
        {flaggedCount} question{flaggedCount === 1 ? "" : "s"} flagged for review,{" "}
        {notedCount} with notes. Once you submit, the exam ends and every question is graded.
      </p>
      <div className="review-list">
        {questions.map((q, i) => (
          <button key={q.id} className="review-row" onClick={() => onJump(q.id)}>
            <span className="q-num">{i + 1}</span>
            <span className="q-title">{q.title}</span>
            <span className="q-domain">{q.domain}</span>
            {flags[q.id] && <span className="flag-pill">flagged</span>}
          </button>
        ))}
      </div>
      <button className="submit-btn" onClick={onSubmit} disabled={submitting}>
        {submitting ? "Grading…" : "Submit Exam"}
      </button>
    </div>
  );
}
