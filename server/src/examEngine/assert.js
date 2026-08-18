const { getPath } = require("./paths");

function isPlainObj(v) {
  return v !== null && typeof v === "object";
}

/** Loose equality that tolerates YAML/JSON scalar-type mismatches (e.g. `equals: 4` against
 * a field that's really the string "4", or vice versa) while still doing structural
 * comparison for objects/arrays. */
function looseEquals(a, b) {
  if (isPlainObj(a) && isPlainObj(b)) return JSON.stringify(a) === JSON.stringify(b);
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

/** Evaluates a single field condition, e.g. { field: "spec.replicas", equals: 4 }, against
 * a JSON object. Exactly one operator key (besides `field`) is expected. */
function evaluateCondition(target, cond) {
  const value = getPath(target, cond.field);

  if ("exists" in cond) {
    const present = value !== undefined && value !== null;
    return cond.exists ? present : !present;
  }
  if ("equals" in cond) return looseEquals(value, cond.equals);
  if ("notEquals" in cond) return !looseEquals(value, cond.notEquals);
  if ("contains" in cond) {
    if (Array.isArray(value)) return value.some((v) => looseEquals(v, cond.contains));
    if (typeof value === "string") return value.includes(String(cond.contains));
    return false;
  }
  if ("matches" in cond) {
    if (typeof value !== "string" && typeof value !== "number") return false;
    try {
      return new RegExp(cond.matches).test(String(value));
    } catch {
      return false;
    }
  }
  if ("in" in cond) {
    if (!Array.isArray(cond.in)) return false;
    return cond.in.some((v) => looseEquals(v, value));
  }
  if ("gte" in cond) return value !== undefined && Number(value) >= Number(cond.gte);
  if ("lte" in cond) return value !== undefined && Number(value) <= Number(cond.lte);
  if ("containsMatch" in cond || "notContainsMatch" in cond) {
    // For array-of-objects fields (e.g. node taints): does any item match all the given
    // key: value pairs? `notContainsMatch` is the negation (e.g. "this taint must be absent").
    const wantMatch = "containsMatch" in cond;
    const spec = cond.containsMatch || cond.notContainsMatch;
    const found =
      Array.isArray(value) &&
      value.some((item) => Object.entries(spec).every(([k, v]) => looseEquals(item && item[k], v)));
    return wantMatch ? found : !found;
  }
  if ("nonEmpty" in cond) {
    const len = Array.isArray(value) || typeof value === "string" ? value.length : value ? 1 : 0;
    return cond.nonEmpty ? len > 0 : len === 0;
  }

  throw new Error(`Unrecognized condition on field "${cond.field}": ${JSON.stringify(cond)}`);
}

/** AND of a list of field conditions. An empty/missing list is vacuously true. */
function evaluateAll(target, conditions) {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => evaluateCondition(target, cond));
}

/** Evaluates a string assertion block against a raw string, e.g. stdout from a shell/kubectl
 * check: { equals } | { startsWith } | { contains } | { matches }. */
function evaluateStringAssert(value, assertion) {
  if (!assertion) return true;
  const v = (value ?? "").toString();
  if ("equals" in assertion) return v.trim() === String(assertion.equals);
  if ("startsWith" in assertion) return v.startsWith(String(assertion.startsWith));
  if ("contains" in assertion) return v.includes(String(assertion.contains));
  if ("matches" in assertion) return new RegExp(assertion.matches).test(v);
  throw new Error(`Unrecognized string assertion: ${JSON.stringify(assertion)}`);
}

module.exports = { evaluateCondition, evaluateAll, evaluateStringAssert, looseEquals };
