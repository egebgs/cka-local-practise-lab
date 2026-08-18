const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const KUBECONFIG_DIR = path.join(__dirname, "kubeconfigs");
const HOST_KUBECONFIG = path.join(KUBECONFIG_DIR, "host-config");
const BASTION_KUBECONFIG = path.join(KUBECONFIG_DIR, "bastion-config");

const CLUSTERS = [
  { kindName: "cka-main", context: "k8s-c1", configFile: "kind-config-main.yaml" },
  { kindName: "cka-ctx2", context: "k8s-c2", configFile: "kind-config-ctx2.yaml" },
];

const BASTION_IMAGE = "cka-bastion:latest";
const BASTION_CONTAINER = "cka-bastion";
const KIND_NETWORK = "kind";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: opts.quiet ? "pipe" : "inherit",
    shell: process.platform === "win32",
    encoding: "utf8",
    ...opts,
  });
  if (res.status !== 0 && !opts.allowFail) {
    const out = opts.quiet ? `\n${res.stdout || ""}\n${res.stderr || ""}` : "";
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}${out}`);
  }
  return res;
}

function capture(cmd, args, opts = {}) {
  const res = run(cmd, args, { ...opts, quiet: true });
  return (res.stdout || "").trim();
}

function kindClusterExists(name) {
  const out = capture("kind", ["get", "clusters"], { allowFail: true });
  return out.split("\n").map((s) => s.trim()).includes(name);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

module.exports = {
  run,
  capture,
  kindClusterExists,
  ensureDir,
  KUBECONFIG_DIR,
  HOST_KUBECONFIG,
  BASTION_KUBECONFIG,
  CLUSTERS,
  BASTION_IMAGE,
  BASTION_CONTAINER,
  KIND_NETWORK,
};
