#!/usr/bin/env node
const lib = require("./lib");

function main() {
  console.log("[bastion] removing container ...");
  lib.run("docker", ["rm", "-f", lib.BASTION_CONTAINER], { allowFail: true });

  for (const c of lib.CLUSTERS) {
    if (lib.kindClusterExists(c.kindName)) {
      console.log(`[cluster] deleting ${c.kindName} ...`);
      lib.run("kind", ["delete", "cluster", "--name", c.kindName]);
    } else {
      console.log(`[cluster] ${c.kindName} not found, skipping`);
    }
  }
  console.log("\nEnvironment torn down.");
}

main();
