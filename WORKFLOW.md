# Agent Kumite Workflow

This repo is operated as an **issue-driven, worktree-first** project.

The goal of this document is to make the intended development loop explicit for future contributors: how work is claimed, where code changes happen, what needs to stay in sync, and what “done” means before an issue is resolved.

## Working model

Agent Kumite has two active surfaces during development:

1. **The repository** — code, fixtures, docs, tests, and runnable outputs
2. **The Obsidian Projects vault** — issue notes, task notes, status tracking, and resolve history

The repo is where the implementation lives. The vault is where the issue lifecycle is tracked.

## Default lifecycle

The normal lifecycle for a contributor-facing issue is:

1. **Claim the issue**
2. **Create an isolated git worktree**
3. **Read the issue note and task note**
4. **Plan the slice**
5. **Implement the change in the worktree**
6. **Validate the change**
7. **Update the issue/task notes**
8. **Commit the work**
9. **Append the commit to the issue**
10. **Resolve the issue**

If the work creates the next slice in a sequence, create that issue and then ask the workflow to open/claim it on behalf of the current agent or contributor.

## Issue-driven execution

Work starts from an issue, not from an untracked TODO in code.

For this project, the intended pattern is:

- create or select the issue in the Obsidian Projects workflow
- open/claim it through the `op` workflow
- keep the issue note and task notes current as the work evolves
- resolve the issue only after the repo change is committed and the issue summary reflects what shipped

That means:

- the issue note should contain the current scope, plan, task breakdown, notes, and final summary
- the repo change should be explainable by the issue note alone
- the resolved issue note should be sufficient as a historical handoff

## Worktree policy

### Always use an isolated worktree for real issue work

If an issue is more than a one-line edit, use a dedicated worktree.

Why:

- it keeps the main checkout stable
- it avoids stepping on other in-progress issue branches
- it lets issue-local dependencies, build outputs, and uncommitted changes stay isolated
- it keeps vault issue ownership and repo state aligned

### Recommended pattern

Create one worktree per issue:

```bash
git worktree add .worktrees/AK-32 -b worktree-ak-32-workflow <base-commit-or-branch>
```

Use a consistent naming scheme:

- directory: `.worktrees/AK-N`
- branch: `worktree-ak-N-short-name`

### Main checkout policy

Do not use the main checkout as the active implementation surface for multi-step issue work.

Use the main checkout primarily for:

- inspecting the repository
- fast-forwarding completed issue branches back into `main`
- final integration work once an issue slice is already complete

## Planning expectations

Before changing code or docs:

1. read the current issue note
2. read the generated task note
3. inspect the relevant repo files
4. rewrite the placeholder task note into a real breakdown if needed
5. update the issue plan when the intended implementation shape becomes clear

The plan does not need to be long, but it should answer:

- what is being changed
- why that slice is the right next step
- which files are expected to change

## Repo and vault synchronization

The repo and the vault should move together.

### Keep the vault in sync during execution

At minimum:

- replace placeholder task notes with real breakdowns
- update task status as the work progresses
- write meaningful notes as decisions are made
- write the final issue summary before resolve

### Keep the repo in sync with the issue

At minimum:

- the code/docs committed for the issue should match the issue scope
- unrelated work should not be bundled into the same issue commit
- the commit appended to the issue should be the commit that actually shipped the slice

## Validation expectations

Before resolving an issue, validate the change in a way that matches its scope.

### Code changes

For code changes, the default expectation is:

```bash
npm test
npm run build
```

If the issue adds or changes a runnable command, also exercise the affected command path directly.

### Documentation changes

Documentation-only changes do not need a full test/build cycle if no code changed, but they do need reality checks:

- commands in docs should be run if they are presented as copy-paste examples
- file paths should exist
- outputs described in docs should match actual behavior

### Do not resolve on an unverified guess

A slice is not done just because it looks right in the diff. It is done when the repo behavior and the issue summary agree.

## Commit and resolve expectations

Once the work is complete:

1. commit the issue-local changes in the issue worktree
2. append that commit to the issue through the workflow
3. update the issue summary with what shipped
4. resolve the issue through the workflow

The resolve step should happen only after the repo state and vault state agree.

## Documentation vs framework changes

Not every issue needs the same validation shape.

### Documentation slices

Use these for:

- README / workflow docs
- benchmark runbooks
- architecture notes
- exit checklists

Expected validation:

- confirm file placement and naming
- confirm commands, paths, and examples
- ensure the docs match the current code/spec surface

### Framework slices

Use these for:

- harness/runtime/schema changes
- CLI changes
- benchmark, projection, or replay output changes
- fixture or validation logic changes

Expected validation:

- run tests
- run build
- exercise the changed command path when relevant

## Closeout checklist

Before resolving an issue, confirm:

- [ ] the work happened in an isolated worktree
- [ ] the issue note plan/tasks/notes reflect the actual work
- [ ] the repo diff is scoped to the issue
- [ ] the relevant validation has been run
- [ ] the commit has been created
- [ ] the commit has been appended to the issue
- [ ] the issue summary says what shipped

## Practical contributor loop

For a typical issue, the working loop looks like:

```bash
# 1. open/claim the issue in the workflow

# 2. create a worktree
git worktree add .worktrees/AK-XX -b worktree-ak-xx-topic <base>

# 3. work inside the issue worktree
cd .worktrees/AK-XX
npm install

# 4. implement and validate
npm test
npm run build

# 5. commit
git add <files>
git commit -m "agent-kumite: <issue slice> (AK-XX)"

# 6. append commit and resolve through the op workflow
```

## What this document is not

This is not the benchmark runbook, the ACP architecture guide, or the phase-exit checklist. Those are separate operational documents and should stay separate.

This file exists to answer one question cleanly:

> **How should a contributor take an Agent Kumite issue from open to resolved without desynchronizing the repo and the vault?**
