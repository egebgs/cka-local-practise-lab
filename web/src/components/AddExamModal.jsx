import { useRef, useState } from "react";
import { api } from "../api.js";

export default function AddExamModal({ onClose, onImported }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [success, setSuccess] = useState(null);
  const fileInputRef = useRef(null);

  const handleFilePick = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result));
      setErrors(null);
      setSuccess(null);
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-picking the same file later
  };

  const handleSave = async () => {
    setSaving(true);
    setErrors(null);
    setSuccess(null);
    try {
      const result = await api.importExam(content);
      if (result.imported) {
        setSuccess(`Saved as exams/${result.fileName} — "${result.examId}" is ready to use.`);
        onImported && onImported();
      } else {
        setErrors(result.errors && result.errors.length ? result.errors : ["Import failed for an unknown reason."]);
      }
    } catch (err) {
      setErrors([err.message || "Request failed."]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Exam</h2>
          <button className="secondary" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="hint-text">
          Paste a full exam YAML (see <code>exams/SCHEMA.md</code> for the format — or ask
          an AI to generate one for you) or load a <code>.yaml</code> file from disk, then
          save.
        </p>

        <div className="modal-toolbar">
          <button className="secondary" onClick={() => fileInputRef.current.click()}>
            Load from file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
            style={{ display: "none" }}
            onChange={handleFilePick}
          />
        </div>

        <textarea
          className="yaml-textarea"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setErrors(null);
            setSuccess(null);
          }}
          placeholder={"apiVersion: cka-practice/v1\nkind: Exam\nmetadata:\n  id: ...\n..."}
          spellCheck={false}
        />

        {errors && (
          <div className="result-box fail">
            <div className="result-header">
              {errors.length} error{errors.length === 1 ? "" : "s"} — nothing was saved
            </div>
            <ul>
              {errors.map((e, i) => (
                <li key={i} className="crit-fail">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {success && (
          <div className="result-box pass">
            <div className="result-header">{success}</div>
          </div>
        )}

        <div className="modal-footer">
          <button className="secondary" onClick={onClose}>
            {success ? "Close" : "Cancel"}
          </button>
          <button onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : "Save Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
