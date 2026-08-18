# CKA Practice — Exam YAML Authoring Guide

**Purpose of this document:** you (an AI agent, or a human) are writing a new *exam* for
a self-hosted CKA (Certified Kubernetes Administrator) practice tool. An exam is a single
YAML file. This document is fully self-contained — everything needed to write a correct,
working exam file is below. No other context is required. Paste this whole document into
a prompt along with a request like *"write a new exam about \<topic\>"* and the output
should be a complete, ready-to-use YAML file.

**What happens to the file you produce:** it gets saved as `exams/<some-id>.yaml` in the
tool's project folder, the app rescans that folder, and the exam immediately appears as
a selectable card on the tool's home screen — real `kind`-based Kubernetes clusters get
created/broken/graded exactly as your YAML describes, live, in Docker.

---

## 1. The fixed environment (do not deviate from these facts)

The tool always provides exactly two Kubernetes clusters, already running, with these
exact names. **Do not invent other cluster/node/context names — these are the only ones
that exist:**

| Context name | Cluster | Nodes (container names) |
|---|---|---|
| `k8s-c1` | 3-node "main" cluster | `cka-main-control-plane`, `cka-main-worker`, `cka-main-worker2` |
| `k8s-c2` | 1-node lightweight "second" cluster (for multi-cluster / context-switching questions) | `cka-ctx2-control-plane` |

Other fixed facts:

- The student's terminal runs inside a **bastion** container that has `kubectl`
  (pre-configured with both contexts above), `vim`/`nano`, `jq`, `tmux`, and the Docker
  CLI. The Docker CLI lets the student run `docker exec -it <node-container-name> bash`
  to reach a node directly — this is the practice-environment's equivalent of SSH-ing
  into a real exam node, and is how "node-level" troubleshooting (kubelet, static pods,
  control-plane components) is meant to be solved.
- The default CNI (`kindnet`) does **not** enforce `NetworkPolicy` objects at runtime.
  Any check involving a NetworkPolicy must grade the *spec* of the policy object, not
  live traffic blocking.
- Both clusters are real, disposable `kind` clusters — any node-level or cluster-level
  operation (cordon, taint, drain, stopping kubelet, moving a static-pod manifest,
  RBAC, PVs, etc.) behaves exactly like it would on a real cluster.
- Node-level state (cordons, taints, kubelet, control-plane manifests) is **shared and
  persistent across the whole session** — if one question's solution cordons a node, that
  node stays cordoned for every other question too, until something un-cordons it. This
  mirrors real cluster behavior and is expected, not a bug.

---

## 2. Top-level file structure

```yaml
apiVersion: cka-practice/v1
kind: Exam
metadata:
  id: my-exam-id               # required, unique across every file in exams/
  title: "My Exam Title"       # required, shown on the home screen
  description: "One or two sentences shown under the title."   # optional
  defaultDurationMinutes: 60   # optional; if omitted, defaults to questionCount * 6
questions:
  - id: q1
    # ... see section 3
  - id: q2
    # ...
```

Rules:
- `metadata.id`: unique kebab-case string across **every** exam file in the folder (two
  files with the same id will fail to load — the second one is rejected).
- `questions[].id`: unique **within this file only**. Different exam files may safely
  reuse ids like `q1`, `q2`, etc. — convention is `q1`, `q2`, `q3`, ... in the order they
  should appear.
- Save the file as `exams/<metadata.id>.yaml` (matching the id keeps things easy to find,
  though it isn't strictly required).

---

## 3. Question fields

```yaml
- id: q1                              # required, unique within this exam
  domain: "Workloads & Scheduling"    # required, free text, shown as a tag in the UI
  weight: 15                          # required, number. This question's share of the
                                       #   exam's total score. Across one exam's questions,
                                       #   weights should sum to 100 so the final score
                                       #   reads as a clean percentage (not enforced, but
                                       #   do it anyway).
  title: "Short title shown in the sidebar"   # required, keep it under ~8 words
  contexts: [k8s-c1]                  # required, non-empty array of context names from
                                       #   section 1 (usually just one; use both only if
                                       #   the question genuinely spans two clusters)
  prompt: |                           # required — see "Prompt formatting" below
    The full question text shown to the student.
  hint: |                             # optional, shown only in Casual mode, on demand
    A nudge in the right direction — not the full answer.
  solution: |                         # optional, shown only in Casual mode, on demand
    A reference command-line solution a real student could paste and run.
  namespace: cka-q1                   # optional — see "Namespace auto-reset" below
  setup: [ ... ]                      # optional, list of steps — see section 4
  checks: [ ... ]                     # required, non-empty list of graded criteria — see section 5
```

### Prompt formatting

`prompt`, `hint`, and every check's `description` support a tiny markdown subset:
`` `backtick code` `` (rendered as click-to-copy chips in the UI, mirroring the real
exam's copy-paste helpers for resource names — use them for every resource name, path,
and command you mention), `**bold**`, `- ` / `1. ` lists, and `> ` blockquotes (rendered
as a highlighted callout — good for caveats like the NetworkPolicy limitation).

Write prompts in the voice of a real CKA exam task: state the task weight, the context to
work in, and precise, unambiguous requirements (exact names, exact values). Example
opening lines, always include these two lines at the top of every prompt:

```
Task weight: 15%

Context: `k8s-c1`
```

### Namespace auto-reset

If a question sets `namespace: <name>`, the engine automatically does this **before**
running the question's own `setup` steps, every time the question is (re)initialized:

1. `kubectl delete namespace <name> --ignore-not-found --wait=true`
2. Recreates it fresh: applies a plain `Namespace` manifest for `<name>`

So: **do not** write your own delete/recreate-namespace steps in `setup` — just set
`namespace:` and assume it exists (empty) by the time your `setup` steps run. Omit
`namespace` entirely for questions that don't need one (e.g. node-level-only questions
like restarting a kubelet).

**Naming convention (important once you have many exams):** all exams share the *same*
two live clusters. Prefix every `namespace` value with a short tag unique to this exam
so namespaces from different exams never collide, e.g. an exam about Services could use
`svcex-q1`, `svcex-q2`, ... rather than the generic `cka-q1` pattern. If two different
exam files both used `namespace: cka-q1`, opening question 1 of one exam would silently
wipe question 1's progress in the other.

---

## 4. Setup steps

`setup` is a list of steps executed **in order**, once, the first time a student opens
the question (and again whenever they click "Reset Question"). Setup is **best-effort**:
if an individual step fails (e.g. `kubectl uncordon` on a node that's already
uncordoned), it's logged on the server and execution continues — most setup steps are
idempotent resets by nature, so this is intentional. (This also means: a genuine typo in
your YAML won't loudly crash anything — it'll just silently fail to set up the intended
state, and the question's checks will never pass. Double-check your `apply` manifests
carefully.)

Each step object has **exactly one** of these three keys:

### `apply` — apply a raw Kubernetes manifest

```yaml
- apply: |
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: web
      namespace: cka-q1
    spec:
      replicas: 3
      selector:
        matchLabels: {app: web}
      template:
        metadata:
          labels: {app: web}
        spec:
          containers:
          - name: web
            image: nginx:1.25
```

Multiple documents in one `apply` are fine, `---`-separated, standard YAML multi-doc.
Optional `context:` key on the step (defaults to the question's first `contexts` entry).

### `kubectl` — run a raw kubectl subcommand

For anything that isn't a plain `apply`: cordon, drain, taint, rollout status, label,
annotate, scale, delete-a-specific-thing, etc.

```yaml
- kubectl: ["cordon", "cka-main-worker2"]
- kubectl: ["taint", "node", "cka-main-worker", "dedicated=infra:NoSchedule"]
- kubectl: ["rollout", "status", "deployment/web", "-n", "cka-q1", "--timeout=60s"]
```

Optional `context:` key per step. If a step creates Pods and a later `checks` entry
depends on those pods having *real node placement* (not just existing), add a
`rollout status ... --timeout=60s` step at the end of setup so the check doesn't run
against a still-`Pending` deployment (see the node-maintenance recipe in section 7).

### `shell` — run a shell command inside a container

For node-level breakage that has nothing to do with the Kubernetes API: stopping
kubelet, moving a static-pod manifest out of its watched directory, etc. This is the
practice-environment's equivalent of SSH-ing into a real node and doing something to it
directly.

```yaml
- shell:
    target: "node:cka-main-control-plane"   # or any node name from section 1,
                                             #   prefixed "node:", or "bastion"
    run: "systemctl stop kubelet"
```

`run` is a single shell command string (executed via `sh -c`), so chain with `&&`/`||`
as needed, e.g.:

```yaml
run: >-
  test -f /etc/kubernetes/manifests/kube-scheduler.yaml &&
  mv /etc/kubernetes/manifests/kube-scheduler.yaml /etc/kubernetes/kube-scheduler.yaml.disabled || true
```

---

## 5. Checks

`checks` is a **non-empty** list of graded criteria, shown to the student in order
(after "Check My Answer" in Casual mode, or in the results report after an exam
submit). Each entry requires a `description` (student-facing — write it as a clear,
specific pass/fail statement, e.g. `"Deployment \`web\` exists in namespace \`cka-q1\`"`,
not `"check deployment"`) and **exactly one** of `get` / `list` / `kubectl` / `shell`.

An optional `points: N` (default `1`) weights that criterion relative to the question's
other criteria — the question's own score is `(sum of points earned) / (sum of all
points) * 100`. Most questions should just leave every check at the default weight of 1.

### `get` — fetch one resource, assert on its fields

```yaml
- description: "Deployment `web` exists in namespace `cka-q1`"
  get: { kind: deployment, name: web, namespace: cka-q1 }
  # no `assert` key at all = pure existence check (passes iff the object exists)

- description: "Replicas set to 4"
  get: { kind: deployment, name: web, namespace: cka-q1 }
  assert:
    - { field: "spec.replicas", equals: 4 }
```

`get` takes `kind`, `name`, optional `namespace` (omit entirely for cluster-scoped
resources: `node`, `pv`, `clusterrole`, `clusterrolebinding`, `storageclass`, ...),
optional `context` (defaults to the question's first context). If the object doesn't
exist, the check simply fails — you don't need a separate "handle missing" branch.

`assert` is a list of field conditions; **all must pass** (logical AND) for the check to
pass. It's fine to bundle several related field checks into one `assert` list under one
`description` if they represent one conceptual requirement (see the worked example).

### `list` — fetch many resources, optionally filter, then assert a count

```yaml
- description: "No `filler` Pods running on `cka-main-worker2` (drained)"
  list: { kind: pods, namespace: cka-q4 }
  filter:                              # optional — items not matching ALL of these are excluded
    - { field: "spec.nodeName", equals: "cka-main-worker2" }
    - { field: "status.phase", equals: "Running" }
  count: { equals: 0 }                 # equals / notEquals / gte / lte
```

`list` takes `kind`, optional `namespace`, optional `labelSelector` (a string like
`"app=broken-app"`), optional `context`. Without a `count` block, the check just passes
if at least one item survives the `filter`.

### `kubectl` — run a raw kubectl command, assert on its output

The escape hatch for anything not covered by `get`/`list` — most notably RBAC checks via
`auth can-i`:

```yaml
- description: "ServiceAccount can get pods in `cka-q2`"
  kubectl:
    args: ["auth", "can-i", "get", "pods", "-n", "cka-q2", "--as", "system:serviceaccount:cka-q2:pipeline-runner"]
  assert:
    stdout: { equals: "yes" }          # kubectl auth can-i prints exactly "yes" or "no"
```

Here `assert` is a **single object** (not a list!) with optional `stdout` (a string
assertion: `equals`/`startsWith`/`contains`/`matches`) and/or `exitCode` (a condition
object using `equals`/`notEquals`). Omit `assert` entirely to just check `exitCode == 0`.
Optional `context` inside the `kubectl` block.

### `shell` — run a shell command in a container, assert on its output

Same `assert` shape as `kubectl` above, but runs inside a container:

```yaml
- description: "kubelet service is active on the node"
  shell:
    target: "node:cka-ctx2-control-plane"
    run: "systemctl is-active kubelet"
  assert:
    stdout: { equals: "active" }
```

---

## 6. Field paths and operators

**Field path syntax:** dot-separated, with `[n]` for array indices, e.g.
`spec.template.spec.containers[0].image`. Keys that themselves contain a dot or slash
(very common for annotations/labels, e.g. `kubernetes.io/config.mirror`) must be
bracket-quoted with single quotes *inside* the field path string:

```yaml
{ field: "metadata.annotations['kubernetes.io/config.mirror']", exists: true }
```

**Critical YAML gotcha — always double-quote the whole `field` value:**

```yaml
# WRONG — YAML tries to parse the unquoted [0] as starting a flow sequence and
# fails with a parse error like "missed comma between flow collection entries":
- { field: spec.containers[0].image, matches: "nginx" }

# RIGHT:
- { field: "spec.containers[0].image", matches: "nginx" }
```

Quote **every** `field` value in double quotes, every time, even if it has no brackets —
it's always safe and removes an entire class of mistakes.

### Operator reference (for `get`/`list` field conditions)

Used as `{ field: "...", <operator>: <value> }` — exactly one operator per condition:

| Operator | Meaning |
|---|---|
| `equals` | Deep-ish equality. Tolerates string/number mismatches (`equals: 4` matches both the JSON number `4` and the string `"4"`). |
| `notEquals` | Negation of `equals`. |
| `exists: true \| false` | Field is present (non-null) vs. absent. |
| `contains` | Substring match (string field) or array-contains-value (array of scalars, e.g. `spec.accessModes` contains `"ReadWriteOnce"`). |
| `matches` | Regex test (string/number field, coerced to string). |
| `in: [a, b, ...]` | Field's value is one of these. |
| `gte` / `lte` | Numeric comparison. |
| `nonEmpty: true \| false` | Array/string length > 0 (or exactly 0 if `false`). |
| `containsMatch: { k: v, ... }` | For an array-of-objects field: at least one item matches every given key:value pair. Use this for things like node taints or NetworkPolicy `from`/`ports` entries, e.g. `{ field: "spec.taints", containsMatch: { key: "dedicated", value: "infra", effect: "NoSchedule" } }`. |
| `notContainsMatch: { k: v, ... }` | Negation of `containsMatch`, e.g. "this taint must be absent". |

For `kubectl`/`shell` string assertions (`assert.stdout`): `equals` (trimmed exact
match), `startsWith`, `contains`, `matches` (regex).

---

## 7. Common recipes

Use these as starting points — most questions are a variation on one of these patterns.

**A. Build-from-scratch task** (student creates something new): `namespace:` set,
`setup: []` (nothing to pre-create), `checks` assert the fields of whatever the student
is supposed to build.

**B. Fix-a-broken-resource task** (troubleshooting): `namespace:` set, `setup:` has one
`apply` step that creates the resource(s) in an intentionally-wrong state — make the bug
a genuinely plausible mistake (a typo'd label, an off-by-one port, a missing key) rather
than something absurd. `checks` assert the *fixed* state.

**C. RBAC task:** `namespace:` set, `setup: []` (nothing to pre-create — student builds
the SA/Role/RoleBinding from scratch), `checks` mix `get` (object existence) with
`kubectl` + `auth can-i` (both positive "can do X" and negative "cannot do Y" checks —
see section 5's `kubectl` example, and note negative checks against a completely
untouched question will trivially pass since no identity has any access yet; that's an
acceptable, harmless quirk).

**D. Node-maintenance task** (cordon/drain/taint): `namespace:` set, `setup:` creates a
filler Deployment across nodes, **then a `kubectl: ["rollout", "status", ...]` step** so
pods have real placement before any check runs (otherwise a check like "no pods on node
X" would trivially pass because nothing has scheduled yet). `checks` use `get` on
`node` objects (`spec.unschedulable`, `spec.taints` via `containsMatch`) plus a `list`
with `filter`+`count` to confirm pods actually moved off the drained node.

**E. Node-level troubleshooting** (kubelet down, static pod, control-plane component
down): no `namespace` needed (or one only for a visible "symptom" pod, like a canary pod
stuck Pending). `setup:` has one `shell` step that breaks something via `systemctl` or
moving a file. `checks` mix a `shell` check (e.g. `systemctl is-active kubelet`) with a
`get`/`list` check on the resulting Kubernetes-visible symptom (node `Ready` condition,
scheduler pod `Running`, a pod finally getting `spec.nodeName` set).

**F. Multi-cluster / context-switching task:** `contexts: [k8s-c2]` (or whichever
cluster is relevant), prompt should explicitly tell the student to
`kubectl config use-context k8s-c2` first. Everything else works the same — `get`,
`list`, `shell` (targeting `node:cka-ctx2-control-plane`) all just need the right
`context` value.

---

## 8. Full worked example

A complete, three-question exam using every step type and every check type described
above. This is meant to be a template you can copy wholesale and adapt.

```yaml
apiVersion: cka-practice/v1
kind: Exam
metadata:
  id: networking-deep-dive
  title: "Networking Deep Dive"
  description: "Services, NetworkPolicy, and a node-level DNS/kubelet troubleshooting scenario."
  defaultDurationMinutes: 30

questions:
  # A. build-from-scratch
  - id: q1
    domain: "Services & Networking"
    weight: 30
    title: "Expose a Deployment with a NodePort Service"
    contexts: [k8s-c1]
    namespace: netdeep-q1
    prompt: |
      Task weight: 30%

      Context: `k8s-c1`

      In namespace `netdeep-q1`, create a Deployment named `api` with 2 replicas using
      image `nginx:1.25` on container port `80`, labelled `app=api`. Then create a
      Service named `api-svc` of type `NodePort` that selects `app=api`, serving on
      port `80`.
    hint: |
      `kubectl create deployment api -n netdeep-q1 --image=nginx:1.25 --replicas=2`
      then `kubectl expose deployment api -n netdeep-q1 --name=api-svc --port=80 --type=NodePort`.
    solution: |
      kubectl create deployment api -n netdeep-q1 --image=nginx:1.25 --replicas=2
      kubectl expose deployment api -n netdeep-q1 --name=api-svc --port=80 --type=NodePort
    setup: []
    checks:
      - description: "Deployment `api` exists with 2 replicas of nginx"
        get: { kind: deployment, name: api, namespace: netdeep-q1 }
        assert:
          - { field: "spec.replicas", equals: 2 }
          - { field: "spec.template.spec.containers[0].image", matches: "nginx" }
      - description: "Service `api-svc` is a NodePort selecting `app=api` on port 80"
        get: { kind: service, name: api-svc, namespace: netdeep-q1 }
        assert:
          - { field: "spec.type", equals: "NodePort" }
          - { field: "spec.selector.app", equals: "api" }
          - { field: "spec.ports[0].port", equals: 80 }
      - description: "Endpoints resolve to real Pod IPs"
        get: { kind: endpoints, name: api-svc, namespace: netdeep-q1 }
        assert:
          - { field: "subsets[0].addresses", nonEmpty: true }

  # B. fix-a-broken-resource
  - id: q2
    domain: "Services & Networking"
    weight: 30
    title: "Fix a NetworkPolicy that's blocking everything"
    contexts: [k8s-c1]
    namespace: netdeep-q2
    prompt: |
      Task weight: 30%

      Context: `k8s-c1`

      Namespace `netdeep-q2` has Deployments `frontend` (`app=frontend`) and `backend`
      (`app=backend`, port `80`), plus a NetworkPolicy `backend-policy` that's supposed
      to allow ingress to `backend` Pods from `frontend` Pods on port `80` — but it was
      misconfigured and currently matches the wrong labels.

      Fix the NetworkPolicy `backend-policy` (don't delete/recreate it under a different
      name) so it correctly targets `app=backend` and allows ingress from `app=frontend`
      on port `80`.
    hint: |
      `kubectl get networkpolicy backend-policy -n netdeep-q2 -o yaml`, compare its
      `podSelector` and `ingress[].from[].podSelector` against the real Pod labels
      (`kubectl get pods -n netdeep-q2 --show-labels`), then `kubectl edit` it.
    solution: |
      kubectl patch networkpolicy backend-policy -n netdeep-q2 --type merge -p \
        '{"spec":{"podSelector":{"matchLabels":{"app":"backend"}},"ingress":[{"from":[{"podSelector":{"matchLabels":{"app":"frontend"}}}],"ports":[{"protocol":"TCP","port":80}]}]}}'
    setup:
      - apply: |
          apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: frontend
            namespace: netdeep-q2
          spec:
            replicas: 1
            selector: {matchLabels: {app: frontend}}
            template:
              metadata: {labels: {app: frontend}}
              spec:
                containers: [{name: frontend, image: nginx:1.25}]
          ---
          apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: backend
            namespace: netdeep-q2
          spec:
            replicas: 1
            selector: {matchLabels: {app: backend}}
            template:
              metadata: {labels: {app: backend}}
              spec:
                containers:
                - name: backend
                  image: nginx:1.25
                  ports: [{containerPort: 80}]
          ---
          apiVersion: networking.k8s.io/v1
          kind: NetworkPolicy
          metadata:
            name: backend-policy
            namespace: netdeep-q2
          spec:
            podSelector: {matchLabels: {app: backedn}}
            policyTypes: [Ingress]
            ingress:
            - from: [{podSelector: {matchLabels: {app: fronted}}}]
              ports: [{protocol: TCP, port: 80}]
    checks:
      - description: "NetworkPolicy `backend-policy` still exists (not renamed)"
        get: { kind: networkpolicy, name: backend-policy, namespace: netdeep-q2 }
      - description: "Applies to `app=backend` Pods"
        get: { kind: networkpolicy, name: backend-policy, namespace: netdeep-q2 }
        assert:
          - { field: "spec.podSelector.matchLabels.app", equals: "backend" }
      - description: "Allows ingress from `app=frontend` Pods on port 80"
        get: { kind: networkpolicy, name: backend-policy, namespace: netdeep-q2 }
        assert:
          - { field: "spec.ingress[0].from[0].podSelector.matchLabels.app", equals: "frontend" }
          - { field: "spec.ingress[0].ports[0].port", equals: 80 }

  # E. node-level troubleshooting
  - id: q3
    domain: "Troubleshooting"
    weight: 40
    title: "Restore a stopped kubelet on the second cluster"
    contexts: [k8s-c2]
    prompt: |
      Task weight: 40%

      Switch context: `kubectl config use-context k8s-c2`

      This is a separate cluster. Its only node is `NotReady`. Investigate and restore
      it, without deleting/recreating the node.

      SSH-equivalent: `docker exec -it cka-ctx2-control-plane bash`.
    hint: |
      `systemctl status kubelet` on the node — if it's stopped, `systemctl start kubelet`.
    solution: |
      docker exec -it cka-ctx2-control-plane bash
      systemctl start kubelet
    setup:
      - shell:
          target: "node:cka-ctx2-control-plane"
          run: "systemctl stop kubelet"
    checks:
      - description: "kubelet service is active on the node"
        shell:
          target: "node:cka-ctx2-control-plane"
          run: "systemctl is-active kubelet"
        assert:
          stdout: { equals: "active" }
      - description: "Node reports `Ready` in `k8s-c2`"
        get: { kind: node, name: cka-ctx2-control-plane, context: k8s-c2 }
        assert:
          - { field: "status.conditions", containsMatch: { type: "Ready", status: "True" } }
```

(Note: `q2`'s setup intentionally contains the typos `backedn`/`fronted` as the bug the
student has to find — that's deliberate, not a mistake in this guide.)

---

## 9. Pre-submission checklist

Before handing back a finished exam YAML, verify every item:

- [ ] `apiVersion: cka-practice/v1` and `kind: Exam` are present at the top level.
- [ ] `metadata.id` is a unique, kebab-case string.
- [ ] Every `questions[].id` is unique within this file.
- [ ] Every question has `domain`, `weight` (number), `title`, non-empty `contexts`,
      `prompt`, and a non-empty `checks` list.
- [ ] Question `weight`s sum to 100 across the exam (so the score reads as a clean
      percentage).
- [ ] Every `contexts` entry and every `node:<name>` shell target uses only the names
      from section 1's table — nothing invented.
- [ ] Every question that creates namespaced resources sets `namespace:` and does **not**
      also try to create/delete that namespace itself in `setup`.
- [ ] `namespace` values are prefixed with a short tag unique to this exam (not the
      generic `cka-qN` pattern used by other exams) to avoid cross-exam collisions.
- [ ] **Every single `field:` value is wrapped in double quotes**, no exceptions —
      this is the single most common YAML parse error.
- [ ] Each `setup` step and each `check` entry has exactly one of its allowed keys
      (`apply`/`kubectl`/`shell` for setup; `get`/`list`/`kubectl`/`shell` for checks) —
      not zero, not two.
- [ ] `assert` is a **list** for `get`/`list` checks, but a **single object** (with
      optional `stdout`/`exitCode` keys) for `kubectl`/`shell` checks.
- [ ] Any question whose setup creates Pods/Deployments that a check later inspects for
      *scheduling* (which node they're on, whether they're Running) has a
      `rollout status --timeout=60s` (or equivalent wait) as the last setup step.
- [ ] Every check's `description` is a clear, specific, student-facing pass/fail
      statement (not a vague label).
- [ ] Container images used are small/common (`nginx:1.25`, `busybox:1.36`, etc.) to
      keep the environment lightweight and fast to provision.
- [ ] If the question involves a NetworkPolicy, checks grade the object's *spec* only —
      not live traffic behavior.

---

## 10. Blank template

```yaml
apiVersion: cka-practice/v1
kind: Exam
metadata:
  id: REPLACE-ME-unique-exam-id
  title: "REPLACE-ME Exam Title"
  description: "REPLACE-ME one or two sentence summary."
  defaultDurationMinutes: 60

questions:
  - id: q1
    domain: "REPLACE-ME e.g. Workloads & Scheduling"
    weight: 100
    title: "REPLACE-ME short sidebar title"
    contexts: [k8s-c1]
    namespace: REPLACE-ME-tag-q1
    prompt: |
      Task weight: 100%

      Context: `k8s-c1`

      REPLACE-ME: describe exactly what the student must do, with precise resource
      names, values, and constraints, using `backticks` for every resource name.
    hint: |
      REPLACE-ME: a nudge, not the full answer.
    solution: |
      REPLACE-ME: a real, runnable command-line solution.
    setup: []
    checks:
      - description: "REPLACE-ME: a clear pass/fail statement"
        get: { kind: REPLACE-ME, name: REPLACE-ME, namespace: REPLACE-ME-tag-q1 }
```
