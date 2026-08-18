const kubectl = require("../kubectl");
const { execInContainer } = require("../nodeExec");
const { evaluateAll, evaluateCondition, evaluateStringAssert } = require("./assert");
const { resolveShellTarget } = require("./steps");

function buildGetArgs(spec) {
  const args = ["get", spec.kind, spec.name];
  if (spec.namespace) args.push("-n", spec.namespace);
  return args;
}

function buildListArgs(spec) {
  const args = ["get", spec.kind];
  if (spec.namespace) args.push("-n", spec.namespace);
  if (spec.labelSelector) args.push("-l", spec.labelSelector);
  return args;
}

function evaluateCmdResult(stdout, exitCode, assertion) {
  if (!assertion) return exitCode === 0;
  let ok = true;
  if (assertion.stdout) ok = ok && evaluateStringAssert(stdout, assertion.stdout);
  if (assertion.exitCode) {
    ok = ok && evaluateCondition({ __code__: exitCode }, { field: "__code__", ...assertion.exitCode });
  }
  return ok;
}

/** Runs one check entry and returns whether it passed. Throws on malformed check shapes
 * (caught by the caller) so authoring mistakes surface clearly rather than silently passing.
 * `cache` memoizes `get` fetches within one runChecks() call, since a question's checks
 * routinely re-inspect the same resource field-by-field. */
async function evaluateCheck(check, defaultContext, cache) {
  if (check.get) {
    const context = check.get.context || defaultContext;
    const key = JSON.stringify(["get", context, check.get.kind, check.get.name, check.get.namespace]);
    let obj;
    if (cache.has(key)) {
      obj = cache.get(key);
    } else {
      obj = await kubectl.getJson(context, buildGetArgs(check.get));
      cache.set(key, obj);
    }
    if (!obj) return false;
    return evaluateAll(obj, check.assert);
  }

  if (check.list) {
    const context = check.list.context || defaultContext;
    const listObj = await kubectl.getJson(context, buildListArgs(check.list));
    const items = (listObj && listObj.items) || [];
    const matched = check.filter ? items.filter((item) => evaluateAll(item, check.filter)) : items;
    if (!check.count) return matched.length > 0;
    return evaluateCondition({ __count__: matched.length }, { field: "__count__", ...check.count });
  }

  if (check.kubectl) {
    const context = check.kubectl.context || defaultContext;
    const res = await kubectl.run(context, check.kubectl.args);
    return evaluateCmdResult(res.stdout, res.code, check.assert);
  }

  if (check.shell) {
    const containerName = resolveShellTarget(check.shell.target);
    const res = await execInContainer(containerName, ["sh", "-c", check.shell.run]);
    return evaluateCmdResult(res.output, res.exitCode, check.assert);
  }

  throw new Error(`Check has no recognized type (get/list/kubectl/shell): ${JSON.stringify(check)}`);
}

/** Runs every check for a question and produces a graded result, weighting by each check's
 * optional `points` (default 1) -- mirrors the exam's overall weighted-percent scheme but at
 * the per-question criterion level. */
async function runChecks(checks, defaultContext) {
  const criteria = [];
  const cache = new Map();
  let earned = 0;
  let total = 0;

  for (const check of checks || []) {
    const points = check.points || 1;
    total += points;
    let passed = false;
    try {
      passed = await evaluateCheck(check, defaultContext, cache);
    } catch (err) {
      passed = false;
      criteria.push({ description: check.description, passed: false, error: err.message });
      continue;
    }
    if (passed) earned += points;
    criteria.push({ description: check.description, passed });
  }

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { passed: total > 0 && earned === total, score, maxScore: 100, criteria };
}

module.exports = { evaluateCheck, runChecks };
