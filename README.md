# CKA Practice

A local, exam-style Kubernetes (CKA) practice environment. Real `kind` clusters running
in Docker, a real terminal into them, a question bank auto-graded against live cluster
state, and a split-screen UI modeled on the actual CKA exam / killer.sh experience.

## Prerequisites

- Docker Desktop (running)
- `kind` and `kubectl` on your `PATH`
- Node.js 18+

## First-time setup

```
npm run setup
```

This installs all dependencies and then:

1. Creates two `kind` clusters:
   - `cka-main` — 1 control-plane + 2 workers (context `k8s-c1`), where most questions run
   - `cka-ctx2` — 1 control-plane only (context `k8s-c2`), used for the questions that
     require real multi-cluster context-switching
2. Builds and starts the **bastion** container — a small jumpbox image (kubectl, vim,
   docker CLI, tmux, common CLI tools) with `kubectl` access to both clusters. This is
   what the terminal panel in the UI connects to, exactly like the jumpbox/VM you get in
   the real exam.

Re-run `npm run cluster:up` any time to (re)create the clusters/bastion (it's idempotent
— existing clusters/containers are left alone). `npm run cluster:down` tears everything
down. `npm run cluster:status` prints up/down status.

## Running it

```
npm run dev
```

Starts the backend (http://localhost:4000) and the web UI (http://localhost:5173).
Open the web UI in your browser.

## How it works

- Pick an **exam** on the home screen (each is a YAML file in `exams/`), then a mode:
- **Casual mode** — pick any question, work at your own pace, check your answer anytime,
  reveal hints/reference solutions, reset a question back to its starting state.
- **Mock exam mode** — timed, all questions, flag-for-review + notes, no live feedback
  (just like the real exam), a review screen before submitting, and a full score report
  (overall %, pass/fail at 66%, breakdown by CKA domain and by question) after submitting.

Each question's declarative `setup` steps prepare/break the cluster state it needs (some
questions are build-from-scratch tasks, others are intentionally-broken troubleshooting
scenarios). Each question's declarative `checks` inspect live cluster state via `kubectl`
to grade it, with partial credit per criterion.

Some questions require treating a node like a real exam node — "SSH in" by running
`docker exec -it <node-name> bash` from inside the practice terminal (the bastion
container has Docker CLI + socket access for exactly this).

### Known limitation

This environment's default CNI (`kindnet`) does not enforce `NetworkPolicy` objects.
The NetworkPolicy question is graded on the correctness of the policy's spec (as a real
exam grader inspects your manifest), not on live traffic blocking.

## Creating new exams

Exams are plain YAML files in `exams/` — no code required. Drop a new `.yaml` file in
there and click **"⟳ Reload exams"** on the home screen (or restart the server) to pick
it up immediately.

Full schema reference (every field, every operator, gotchas, a full annotated example):
**`exams/SCHEMA.md`**. It's written to be pasted straight into an LLM prompt — e.g.
*"Using the schema in exams/SCHEMA.md, write a new CKA practice exam about \<topic\>"* —
to generate a complete, working exam file. `exams/TEMPLATE.yaml.example` is a minimal
starting point to copy by hand. `exams/cka-core-practice.yaml` (the bundled 10-question
exam) is the best worked example of every feature the schema supports.
