const { WebSocketServer } = require("ws");
const url = require("url");
const { getBastion } = require("./docker");

const WS_PATH = "/ws/terminal";

function attachTerminalServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = url.parse(req.url);
    if (pathname !== WS_PATH) return; // let other handlers (or none) deal with it
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", async (ws, req) => {
    const { query } = url.parse(req.url, true);
    const sessionId = query.sessionId;
    if (!sessionId) {
      ws.send(JSON.stringify({ type: "output", data: "\r\nMissing sessionId\r\n" }));
      return ws.close();
    }

    let stream;
    let exec;
    try {
      const bastion = await getBastion();
      exec = await bastion.exec({
        Cmd: ["tmux", "new-session", "-A", "-s", `sess-${sessionId}`],
        Env: ["TERM=xterm-256color"],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });
      stream = await exec.start({ hijack: true, stdin: true, Tty: true });
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "output",
          data:
            "\r\n\x1b[31mCould not attach to the practice environment.\x1b[0m\r\n" +
            "Is Docker running and has `npm run cluster:up` completed? \r\n" +
            String(err.message || err) +
            "\r\n",
        })
      );
      return ws.close();
    }

    stream.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "output", data: chunk.toString("utf8") }));
      }
    });
    stream.on("end", () => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "exit" }));
    });
    stream.on("error", () => {});

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "input") {
        stream.write(msg.data);
      } else if (msg.type === "resize" && msg.cols && msg.rows) {
        exec.resize({ h: msg.rows, w: msg.cols }).catch(() => {});
      }
    });

    ws.on("close", () => {
      try {
        stream.end();
      } catch {}
    });
  });

  return wss;
}

module.exports = { attachTerminalServer };
