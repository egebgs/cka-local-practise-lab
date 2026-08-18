#!/usr/bin/env node
/*
 * Brings up the full practice environment:
 *   1. Two kind clusters (main 3-node, ctx2 1-node) if not already present.
 *   2. Host-side kubeconfig (for setup/checker scripts run by the backend on the host).
 *   3. Bastion-side kubeconfig (points at the clusters' *internal* addresses, reachable
 *      only from inside the `kind` docker network) baked into the bastion container.
 *   4. The bastion container itself: a small jumpbox image with kubectl/vim/etc,
 *      exactly what the terminal panel in the UI attaches to.
 */
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

function createClusters() {
  for (const c of lib.CLUSTERS) {
    if (lib.kindClusterExists(c.kindName)) {
      console.log(`[cluster] ${c.kindName} already exists, skipping create`);
      continue;
    }
    console.log(`[cluster] creating ${c.kindName} ...`);
    lib.run("kind", [
      "create",
      "cluster",
      "--name",
      c.kindName,
      "--config",
      path.join(__dirname, c.configFile),
      "--wait",
      "120s",
    ]);
  }
}

function writeKubeconfig(clusterName, internal, outFile, contextName) {
  const args = ["get", "kubeconfig", "--name", clusterName];
  if (internal) args.push("--internal");
  const yaml = lib.capture("kind", args);
  fs.writeFileSync(outFile, yaml);
  // rename the auto-generated "kind-<name>" context/cluster/user to a friendly exam-style name
  lib.run("kubectl", [
    "--kubeconfig",
    outFile,
    "config",
    "rename-context",
    `kind-${clusterName}`,
    contextName,
  ]);
}

function mergeKubeconfigs(files, outFile, defaultContext) {
  const env = { ...process.env, KUBECONFIG: files.join(path.delimiter) };
  const flattened = lib.capture("kubectl", ["config", "view", "--flatten", "--merge"], { env });
  fs.writeFileSync(outFile, flattened);
  lib.run("kubectl", ["--kubeconfig", outFile, "config", "use-context", defaultContext]);
}

function buildKubeconfigs() {
  lib.ensureDir(lib.KUBECONFIG_DIR);
  const externalFiles = [];
  const internalFiles = [];
  for (const c of lib.CLUSTERS) {
    const ext = path.join(lib.KUBECONFIG_DIR, `${c.kindName}-external.yaml`);
    const intl = path.join(lib.KUBECONFIG_DIR, `${c.kindName}-internal.yaml`);
    writeKubeconfig(c.kindName, false, ext, c.context);
    writeKubeconfig(c.kindName, true, intl, c.context);
    externalFiles.push(ext);
    internalFiles.push(intl);
  }
  mergeKubeconfigs(externalFiles, lib.HOST_KUBECONFIG, lib.CLUSTERS[0].context);
  mergeKubeconfigs(internalFiles, lib.BASTION_KUBECONFIG, lib.CLUSTERS[0].context);
  console.log(`[kubeconfig] host config:    ${lib.HOST_KUBECONFIG}`);
  console.log(`[kubeconfig] bastion config: ${lib.BASTION_KUBECONFIG}`);
}

function buildBastionImage() {
  console.log("[bastion] building image ...");
  lib.run("docker", ["build", "-t", lib.BASTION_IMAGE, path.join(__dirname, "..", "bastion")]);
}

function startBastionContainer() {
  console.log("[bastion] (re)starting container ...");
  lib.run("docker", ["rm", "-f", lib.BASTION_CONTAINER], { allowFail: true });
  lib.run("docker", [
    "run",
    "-d",
    "--name",
    lib.BASTION_CONTAINER,
    "--network",
    lib.KIND_NETWORK,
    "--label",
    "cka-practice=bastion",
    // Grants "docker exec into a node" as the local equivalent of SSH-ing into a
    // real exam node (used by the static-pod / kubelet / control-plane questions).
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    lib.BASTION_IMAGE,
    "sleep",
    "infinity",
  ]);
  lib.run("docker", ["cp", lib.BASTION_KUBECONFIG, `${lib.BASTION_CONTAINER}:/root/.kube/config`]);
  lib.run("docker", ["exec", lib.BASTION_CONTAINER, "chmod", "600", "/root/.kube/config"]);
  console.log(`[bastion] container "${lib.BASTION_CONTAINER}" ready`);
}

function main() {
  createClusters();
  buildKubeconfigs();
  buildBastionImage();
  startBastionContainer();
  console.log("\nEnvironment is up. Contexts available inside the bastion terminal:");
  for (const c of lib.CLUSTERS) console.log(`  - ${c.context}  (${c.kindName})`);
  console.log("\nNow run: npm run dev");
}

main();
