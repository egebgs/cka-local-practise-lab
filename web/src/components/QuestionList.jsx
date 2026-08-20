export default function QuestionList({
  questions,
  currentId,
  flags,
  results,
  mode,
  onSelect,
  onToggleFlag,
  collapsed,
  onToggleCollapsed,
}) {
  if (collapsed) {
    return (
      <div className="question-list collapsed">
        <button className="fold-btn" onClick={onToggleCollapsed} title="Expand question list">
          »
        </button>
      </div>
    );
  }

  return (
    <div className="question-list">
      <div className="question-list-header">
        <span>Questions</span>
        <button className="fold-btn" onClick={onToggleCollapsed} title="Collapse question list">
          «
        </button>
      </div>
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
