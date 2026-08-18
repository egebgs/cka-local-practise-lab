import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export default function TerminalPanel({ sessionId }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const fitRef = useRef(null);

  useEffect(() => {
    if (!sessionId || !containerRef.current) return;

    const term = new XTerm({
      // A solid, non-blinking, high-contrast block cursor -- vim/nano send frequent
      // redraws that make a *blinking* cursor land in its "off" phase disproportionately
      // often, which is exactly what makes it hard to track your edit position.
      cursorBlink: false,
      cursorStyle: "block",
      cursorInactiveStyle: "block",
      fontSize: 14,
      fontFamily: "Menlo, Consolas, 'Courier New', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        // the glyph color drawn *on top of* the cursor block -- without this it can
        // default to something low-contrast, making the character under the cursor
        // effectively invisible while editing.
        cursorAccent: "#0d1117",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      // container can still have zero size on the very first paint (e.g. React
      // StrictMode's dev-mode double-mount); the ResizeObserver below re-fits shortly after
    }
    termRef.current = term;
    fitRef.current = fit;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "output") term.write(msg.data);
        if (msg.type === "exit") term.write("\r\n\x1b[31m[session ended]\x1b[0m\r\n");
      } catch {}
    };
    ws.onerror = () => {
      term.write("\r\n\x1b[31mConnection error.\x1b[0m\r\n");
    };

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch {}
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  return <div className="terminal-container" ref={containerRef} />;
}
