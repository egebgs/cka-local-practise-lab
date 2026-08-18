const kubectl = require("./kubectl");
const { execInContainer } = require("./nodeExec");
const { BASTION_CONTAINER } = require("./docker");

/** The fixed cluster topology (see exams/SCHEMA.md section 1). Kept here rather than
 * imported from cluster/lib.js since that module drives host-side provisioning scripts
 * run outside the server process, while this needs the per-node shape used for cleanup. */
const TOPOLOGY = [
  {
    context: "k8s-c1",
    nodes: ["cka-main-control-plane", "cka-main-worker", "cka-main-worker2"],
    controlPlaneNode: "cka-main-control-plane",
  },
  {
    context: "k8s-c2",
    nodes: ["cka-ctx2-control-plane"],
    controlPlaneNode: "cka-ctx2-control-plane",
  },
];

const PROTECTED_NAMESPACES = new Set([
  "default",
  "kube-system",
  "kube-public",
  "kube-node-lease",
  "local-path-storage", // kind's built-in dynamic-provisioning namespace
]);

// The standard kubeadm/kind static pod set -- anything else in a control-plane node's
// manifests directory was put there by a question (e.g. a static-pod exercise) and
// should be cleaned up.
const CORE_STATIC_MANIFESTS = new Set([
  "etcd.yaml",
  "kube-apiserver.yaml",
  "kube-controller-manager.yaml",
  "kube-scheduler.yaml",
]);

function isSystemTaint(key) {
  return key.startsWith("node-role.kubernetes.io/") || key.startsWith("node.kubernetes.io/");
}

async function wipeCustomNamespaces(context, log) {
  const list = await kubectl.getJson(context, ["get", "namespaces"]);
  const names = ((list && list.items) || [])
    .map((n) => n.metadata.name)
    .filter((n) => !PROTECTED_NAMESPACES.has(n));
  if (!names.length) return;
  const res = await kubectl.run(context, [
    "delete",
    "namespace",
    ...names,
    "--ignore-not-found",
    "--wait=true",
    "--timeout=60s",
  ]);
  if (res.code !== 0) log(`${context}: namespace cleanup had errors: ${res.stderr}`);
  else log(`${context}: deleted namespaces [${names.join(", ")}]`);
}

async function wipeCustomPVs(context, log) {
  // PersistentVolumes are cluster-scoped, so deleting their namespace doesn't remove
  // them. Nothing in this environment provisions PVs by default, so every PV found is
  // something a question (or a student) created.
  const list = await kubectl.getJson(context, ["get", "pv"]);
  const names = ((list && list.items) || []).map((p) => p.metadata.name);
  if (!names.length) return;
  const res = await kubectl.run(context, [
    "delete",
    "pv",
    ...names,
    "--ignore-not-found",
    "--wait=true",
    "--timeout=30s",
  ]);
  if (res.code !== 0) log(`${context}: PV cleanup had errors: ${res.stderr}`);
  else log(`${context}: deleted PVs [${names.join(", ")}]`);
}

async function resetNodes(context, nodes, log) {
  for (const node of nodes) {
    const obj = await kubectl.getJson(context, ["get", "node", node]);
    if (!obj) continue;

    if (obj.spec.unschedulable) {
      await kubectl.run(context, ["uncordon", node]);
      log(`${context}/${node}: uncordoned`);
    }

    for (const t of obj.spec.taints || []) {
      if (isSystemTaint(t.key)) continue; // e.g. the built-in control-plane taint
      const spec = t.value ? `${t.key}=${t.value}:${t.effect}-` : `${t.key}:${t.effect}-`;
      await kubectl.run(context, ["taint", "node", node, spec]);
      log(`${context}/${node}: removed taint ${t.key}`);
    }
  }
}

async function resetNodeLevelState(nodes, controlPlaneNode, log) {
  for (const node of nodes) {
    try {
      await execInContainer(node, ["sh", "-c", "systemctl is-active --quiet kubelet || systemctl start kubelet"]);
    } catch (err) {
      log(`${node}: kubelet check/start failed: ${err.message}`);
    }
  }

  try {
    const ls = await execInContainer(controlPlaneNode, [
      "sh",
      "-c",
      "ls /etc/kubernetes/manifests/ 2>/dev/null",
    ]);
    const files = ls.output
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);

    const extras = files.filter((f) => !CORE_STATIC_MANIFESTS.has(f));
    if (extras.length) {
      const paths = extras.map((f) => `/etc/kubernetes/manifests/${f}`).join(" ");
      await execInContainer(controlPlaneNode, ["sh", "-c", `rm -f ${paths}`]);
      log(`${controlPlaneNode}: removed extra static manifests [${extras.join(", ")}]`);
    }

    if (!files.includes("kube-scheduler.yaml")) {
      await execInContainer(controlPlaneNode, [
        "sh",
        "-c",
        "test -f /etc/kubernetes/kube-scheduler.yaml.disabled && " +
          "mv /etc/kubernetes/kube-scheduler.yaml.disabled /etc/kubernetes/manifests/kube-scheduler.yaml || true",
      ]);
      log(`${controlPlaneNode}: restored kube-scheduler manifest`);
    }
  } catch (err) {
    log(`${controlPlaneNode}: static manifest cleanup failed: ${err.message}`);
  }
}

/** The bastion is a single, persistent, shared container -- it's never recreated between
 * sessions, so anything a student leaves on its filesystem or in its kubeconfig
 * (`kubectl config set-context --current --namespace=...`, scratch YAML files) sticks
 * around for the next exam too, independent of anything happening on the clusters. */
async function resetBastionWorkspace(log) {
  try {
    // clear out scratch files in the home directory, but keep dotfiles (.bashrc,
    // .kube/, .tmux.conf, ...) intact.
    const res = await execInContainer(BASTION_CONTAINER, [
      "sh",
      "-c",
      "find /root -mindepth 1 -maxdepth 1 ! -name '.*' -exec rm -rf {} +",
    ]);
    if (res.exitCode === 0) log("bastion: cleared scratch files from home directory");
    else log(`bastion: home directory cleanup exited ${res.exitCode}: ${res.output}`);
  } catch (err) {
    log(`bastion: home directory cleanup failed: ${err.message}`);
  }

  try {
    // undo any `kubectl config set-context --current --namespace=...` (very commonly
    // used to avoid typing -n on every command) and land back on the default context.
    await execInContainer(BASTION_CONTAINER, [
      "sh",
      "-c",
      "kubectl config unset contexts.k8s-c1.namespace; " +
        "kubectl config unset contexts.k8s-c2.namespace; " +
        "kubectl config use-context k8s-c1",
    ]);
    log("bastion: reset kubeconfig context namespaces");
  } catch (err) {
    log(`bastion: kubeconfig reset failed: ${err.message}`);
  }
}

async function resetEnvironment() {
  const logs = [];
  const log = (msg) => logs.push(msg);

  for (const cluster of TOPOLOGY) {
    try {
      await wipeCustomNamespaces(cluster.context, log);
      await wipeCustomPVs(cluster.context, log);
      await resetNodes(cluster.context, cluster.nodes, log);
      await resetNodeLevelState(cluster.nodes, cluster.controlPlaneNode, log);
    } catch (err) {
      log(`${cluster.context}: reset failed: ${err.message}`);
    }
  }

  await resetBastionWorkspace(log);

  return logs;
}

module.exports = { resetEnvironment };
