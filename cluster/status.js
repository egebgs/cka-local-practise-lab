#!/usr/bin/env node
const lib = require("./lib");

function main() {
  let ok = true;
  for (const c of lib.CLUSTERS) {
    const exists = lib.kindClusterExists(c.kindName);
    console.log(`cluster ${c.kindName}: ${exists ? "up" : "MISSING"}`);
    ok = ok && exists;
  }
  const inspect = lib.run("docker", ["inspect", "-f", "{{.State.Running}}", lib.BASTION_CONTAINER], {
    allowFail: true,
    quiet: true,
  });
  const bastionUp = inspect.status === 0 && inspect.stdout.trim() === "true";
  console.log(`bastion container: ${bastionUp ? "up" : "MISSING/STOPPED"}`);
  ok = ok && bastionUp;
  process.exit(ok ? 0 : 1);
}

main();
