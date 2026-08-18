/** Tokenizes a path like `metadata.annotations['kubernetes.io/config.mirror']` or
 * `spec.containers[0].image` into ["metadata","annotations","kubernetes.io/config.mirror"]
 * or ["spec","containers","0","image"]. Bracket-quoted segments are needed for keys that
 * themselves contain dots (very common in Kubernetes annotation/label keys). */
function tokenize(path) {
  const s = String(path);
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ".") {
      i++;
      continue;
    }
    if (s[i] === "[") {
      const quote = s[i + 1] === "'" || s[i + 1] === '"' ? s[i + 1] : null;
      if (quote) {
        const end = s.indexOf(quote + "]", i + 2);
        if (end === -1) throw new Error(`Unterminated bracket segment in path "${path}"`);
        tokens.push(s.slice(i + 2, end));
        i = end + 2;
      } else {
        const end = s.indexOf("]", i + 1);
        if (end === -1) throw new Error(`Unterminated bracket segment in path "${path}"`);
        tokens.push(s.slice(i + 1, end));
        i = end + 1;
      }
      continue;
    }
    let j = i;
    while (j < s.length && s[j] !== "." && s[j] !== "[") j++;
    tokens.push(s.slice(i, j));
    i = j;
  }
  return tokens;
}

/** Resolves a path against an object. Returns undefined if any segment along the way is
 * missing. Numeric segments work for both array indices and (Kubernetes doesn't use these,
 * but for completeness) object keys that happen to look numeric. */
function getPath(obj, path) {
  if (obj === undefined || obj === null) return undefined;
  let cur = obj;
  for (const seg of tokenize(path)) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

module.exports = { getPath, tokenize };
