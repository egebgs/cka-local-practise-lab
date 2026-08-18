import { useState } from "react";

// Minimal markdown renderer for question prompts: supports `code` (click-to-copy,
// mirroring the real exam UI's copy buttons for resource names), **bold**, ordered/
// unordered lists, ">" blockquotes (used for notes), and paragraphs. Intentionally
// tiny — no dependency needed for this scope.

function CopyableCode({ children }) {
  const [copied, setCopied] = useState(false);
  const text = children;
  return (
    <code
      className={"copy-code" + (copied ? " copied" : "")}
      title="Click to copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 900);
        });
      }}
    >
      {copied ? "✓ copied" : text}
    </code>
  );
}

function parseInline(line, keyPrefix) {
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = [];
  let lastIndex = 0;
  let m;
  let key = 0;
  while ((m = re.exec(line))) {
    if (m.index > lastIndex) parts.push(line.slice(lastIndex, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      parts.push(<CopyableCode key={`${keyPrefix}-${key++}`}>{token.slice(1, -1)}</CopyableCode>);
    } else {
      parts.push(<strong key={`${keyPrefix}-${key++}`}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts;
}

function parseBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let currentList = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      currentList = null;
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!currentList || currentList.type !== "ol") {
        currentList = { type: "ol", items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(trimmed.replace(/^\d+\.\s+/, ""));
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!currentList || currentList.type !== "ul") {
        currentList = { type: "ul", items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }
    currentList = null;
    if (trimmed.startsWith(">")) {
      blocks.push({ type: "quote", text: trimmed.replace(/^>\s?/, "") });
      continue;
    }
    blocks.push({ type: "p", text: trimmed });
  }

  return blocks.map((b, i) => {
    if (b.type === "ol")
      return (
        <ol key={i}>
          {b.items.map((it, j) => (
            <li key={j}>{parseInline(it, `${i}-${j}`)}</li>
          ))}
        </ol>
      );
    if (b.type === "ul")
      return (
        <ul key={i}>
          {b.items.map((it, j) => (
            <li key={j}>{parseInline(it, `${i}-${j}`)}</li>
          ))}
        </ul>
      );
    if (b.type === "quote")
      return <blockquote key={i}>{parseInline(b.text, `${i}`)}</blockquote>;
    return <p key={i}>{parseInline(b.text, `${i}`)}</p>;
  });
}

export default function MarkdownLite({ text }) {
  return <div className="md-lite">{parseBlocks(text || "")}</div>;
}
