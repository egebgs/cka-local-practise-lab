export default function ResultsReport({ report, onBackHome }) {
  const domains = {};
  for (const q of report.questions) {
    if (!domains[q.domain]) domains[q.domain] = { earned: 0, max: 0 };
    domains[q.domain].earned += q.score * q.weight;
    domains[q.domain].max += q.maxScore * q.weight;
  }

  return (
    <div className="results-report">
      <div className={"score-banner " + (report.passed ? "pass" : "fail")}>
        <div className="score-percent">{report.percent}%</div>
        <div className="score-verdict">{report.passed ? "PASS" : "FAIL"} (66% required)</div>
      </div>

      <h3>By domain</h3>
      <div className="domain-breakdown">
        {Object.entries(domains).map(([domain, { earned, max }]) => (
          <div className="domain-row" key={domain}>
            <span className="domain-name">{domain}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${max ? (earned / max) * 100 : 0}%` }} />
            </div>
            <span className="domain-pct">{max ? Math.round((earned / max) * 100) : 0}%</span>
          </div>
        ))}
      </div>

      <h3>By question</h3>
      <div className="question-breakdown">
        {report.questions.map((q, i) => (
          <details key={q.id} className={"q-detail " + (q.passed ? "pass" : "fail")}>
            <summary>
              {i + 1}. {q.title} — {q.score}/{q.maxScore} ({q.weight}% weight)
            </summary>
            <ul>
              {(q.criteria || []).map((c, j) => (
                <li key={j} className={c.passed ? "crit-pass" : "crit-fail"}>
                  {c.passed ? "✓" : "✗"} {c.description}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <button onClick={onBackHome}>Back to Home</button>
    </div>
  );
}
