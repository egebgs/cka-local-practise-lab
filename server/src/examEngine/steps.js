const kubectl = require("../kubectl");
const { execInContainer } = require("../nodeExec");
const { BASTION_CONTAINER } = require("../docker");

function resolveShellTarget(target) {
  if (target === "bastion") return BASTION_CONTAINER;
  if (typeof target === "string" && target.startsWith("node:")) return target.slice("node:".length);
  throw new Error(`Invalid shell target "${target}" (expected "bastion" or "node:<container-name>")`);
}

/** Runs a question's setup steps in order. Setup is best-effort/idempotent by design (most
 * steps are resets like uncordon/untaint that legitimately no-op or "fail" when already in
 * the target state) so individual step failures are logged, not thrown -- a truly broken
 * exam file will simply show up as failing checks, which is what an author needs to see. */
async function runSteps(steps, { defaultContext, log }) {
  for (const [i, step] of (steps || []).entries()) {
    const context = step.context || defaultContext;
    try {
      if ("apply" in step) {
        const res = await kubectl.apply(context, step.apply);
        if (res.code !== 0) log(`setup step ${i} (apply) exited ${res.code}: ${res.stderr}`);
      } else if ("kubectl" in step) {
        const res = await kubectl.run(context, step.kubectl);
        if (res.code !== 0) log(`setup step ${i} (kubectl) exited ${res.code}: ${res.stderr}`);
      } else if ("shell" in step) {
        const containerName = resolveShellTarget(step.shell.target);
        const res = await execInContainer(containerName, ["sh", "-c", step.shell.run]);
        if (res.exitCode !== 0) log(`setup step ${i} (shell) exited ${res.exitCode}: ${res.output}`);
      } else {
        log(`setup step ${i} has no recognized action (apply/kubectl/shell): ${JSON.stringify(step)}`);
      }
    } catch (err) {
      log(`setup step ${i} threw: ${err.message}`);
    }
  }
}

module.exports = { runSteps, resolveShellTarget };
