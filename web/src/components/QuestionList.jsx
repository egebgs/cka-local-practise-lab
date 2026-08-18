export default function QuestionList({ questions, currentId, flags, results, mode, onSelect, onToggleFlag }) {
  return (
    <div className="question-list">
      {questions.map((q, i) => {
        const flagged = !!flags[q.id];
        const result = results && results[q.id];
        let statusClass = "status-none";
        if (mode === "casual" && result) statusClass = result.passed ? "status-pass" : "status-fail";
        return (
          <div key={q.id} className={"q-row" + (q.id === currentId ? " active" : "")}>
            <button className="q-row-main" onClick={() => onSelect(q.id)}>
              <span className={"status-dot " + statusClass} />
              <span className="q-num">{i + 1}</span>
              <span className="q-title">{q.title}</span>
              <span className="q-weight">{q.weight}%</span>
            </button>
            <button
              className={"flag-btn" + (flagged ? " flagged" : "")}
              title="Flag for review"
              onClick={() => onToggleFlag(q.id, !flagged)}
            >
              {flagged ? "⚑" : "⚐"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
