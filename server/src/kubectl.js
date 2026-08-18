const { spawn } = require("child_process");
const path = require("path");

const HOST_KUBECONFIG = path.join(__dirname, "..", "..", "cluster", "kubeconfigs", "host-config");

/** Parses a Go-style duration string (as accepted by kubectl's --timeout flag), e.g.
 * "60s", "2m", "1h30m", into milliseconds. */
function parseDurationMs(str) {
  const re = /(\d+)(h|m|s)/g;
  let ms = 0;
  let match;
  while ((match = re.exec(str))) {
    const val = Number(match[1]);
    ms += match[2] === "h" ? val * 3600000 : match[2] === "m" ? val * 60000 : val * 1000;
  }
  return ms;
}

/** child_process's own `timeout` option would otherwise SIGTERM-kill kubectl before a
 * `--timeout=Ns` flag passed *to kubectl itself* gets a chance to fire -- auto-detect it
 * here so every call site gets a correctly-sized process timeout for free, with headroom
 * for kubectl's own timeout to win the race and produce a real error message. */
function resolveTimeoutMs(args, explicitTimeoutMs) {
  if (explicitTimeoutMs) return explicitTimeoutMs;
  const flag = args.find((a) => typeof a === "string" && a.startsWith("--timeout="));
  if (flag) {
    const parsed = parseDurationMs(flag.slice("--timeout=".length));
    if (parsed > 0) return parsed + 15000;
  }
  return 20000;
}

function run(context, args, opts = {}) {
  return new Promise((resolve) => {
    const fullArgs = ["--context", context, ...args];
    const child = spawn("kubectl", fullArgs, {
      env: { ...process.env, KUBECONFIG: HOST_KUBECONFIG },
      shell: process.platform === "win32",
      timeout: resolveTimeoutMs(args, opts.timeoutMs),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on("error", (err) => resolve({ code: -1, stdout: "", stderr: String(err) }));
  });
}

/** Runs `kubectl get <resource> -o json`, returns parsed JSON or null on failure. */
async function getJson(context, args) {
  const res = await run(context, [...args, "-o", "json"]);
  if (res.code !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

async function apply(context, yaml) {
  return new Promise((resolve) => {
    const child = spawn("kubectl", ["--context", context, "apply", "-f", "-"], {
      env: { ...process.env, KUBECONFIG: HOST_KUBECONFIG },
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.write(yaml);
    child.stdin.end();
  });
}

module.exports = { run, getJson, apply, HOST_KUBECONFIG };
