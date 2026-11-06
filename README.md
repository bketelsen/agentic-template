# agentic-template

A GitHub template for projects built and maintained by LLM agents. It contains
no code — just the documentation structure and agent rules that make one-shot
agent work reliable, extracted from [bespoke](https://github.com/bketelsen/bespoke),
where this structure has held up across every coding agent thrown at it.

## Why this works

Agents succeed when the repository answers their questions before they ask:

- **One law, every agent.** `AGENTS.md` is the canonical instruction file;
  `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
  `.github/copilot-instructions.md` are symlinks to it, so Claude Code,
  Copilot, Gemini, Cursor, and whatever comes next all read the same rules.
  Skills live once in `.agents/skills/` (`.claude/skills` is a symlink). No
  drift, ever.
- **Docs split by the question they answer.** `docs/adr/` (why — immutable),
  `docs/design/` (how — living), `docs/specs/` (what exactly — testable
  contracts), `docs/plans/` (when — phases with "Done when" outcomes). An agent
  that needs rationale, mechanism, contract, or sequence knows exactly where to
  look — and where to write.
- **Templates as enforcement.** Every category has a `TEMPLATE.md`; every new
  doc starts from it. Structure you don't have to think about is structure that
  stays consistent.
- **Mandatory cross-linking.** ADRs link the designs they shape; designs link
  their ADRs, specs, and roadmap phase; specs link back. A doc without its
  links is defined as incomplete, so the graph stays navigable from any entry
  point.
- **Live conventions only.** AGENTS.md's code-conventions section describes the
  code *as it is* — rules graduate in when the enforcing code lands. Agents
  following stale rules produce broken work; this structure makes stale rules a
  category error.
- **Skills over improvisation.** Multi-step procedures that repeat become
  `.agents/skills/<name>/SKILL.md` files with a frontmatter description agents
  can select on. Explaining a procedure twice means it should become a skill.
- **A verify gate protects the template.** `make verify` checks the canonical
  surfaces, documentation index, risk paths, corrections inbox and vendored
  copies. The risk-path list labels high-risk pull requests; the corrections
  inbox turns blocking reviews into guards.

## Using this template

1. Click **Use this template** on GitHub (or `gh repo create myproject
   --template bketelsen/agentic-template`).
2. In `AGENTS.md`: replace the title and intro, then fill in the commented
   placeholder sections as your project takes shape. Put your project's own
   checks (tests, linters) behind `make verify` in the `Makefile`: it gates
   "done", and CI runs it.
3. Set the dates in `docs/adr/0001`, `0002` and `0003` to today; they're
   pre-accepted because this template implements them.
4. Set the copyright holder and year in `LICENSE`. Keep MIT unless the project
   inherits GPL-3.0.
5. Replace the repository URL and the supported-versions section in
   `SECURITY.md` with your own.
6. Add an entry to `.github/dependabot.yml` for each package ecosystem the
   project adds: `gomod`, `npm`, `cargo`, `docker`.
7. For a released Go project, add `.svu.yml` and a `bump` target that runs
   `svu next`; use the Go and golangci-lint versions of core's
   `frostyard-go-repo` skill.
8. For a user-facing tool, add a `site/` docs site (core ADR-0070).
9. Write your first real ADR (0004) for your first significant choice —
   language, framework, storage — and keep going from there.
10. Delete this "Using this template" section and make the README describe your
    project.

The full checklist is core's [repository baseline
spec](https://github.com/frostyard/core/blob/main/docs/specs/repository-baseline.md).

## Layout

```
AGENTS.md                     canonical agent instructions (the law)
CLAUDE.md → AGENTS.md         symlink for Claude Code
GEMINI.md → AGENTS.md         symlink for Gemini CLI
.cursorrules → AGENTS.md      symlink for Cursor
.github/copilot-instructions.md → AGENTS.md
.agents/skills/               canonical skills; TEMPLATE/SKILL.md to copy
.claude/skills → .agents/skills
docs/README.md                taxonomy + index (every doc gets a line)
docs/org-adrs.md              core ADRs that bind this repository
docs/adr/                     why — immutable decisions + TEMPLATE.md
docs/design/                  how — living architecture docs + TEMPLATE.md
docs/specs/                   what — testable contracts + TEMPLATE.md
docs/plans/                   when — phased plans + TEMPLATE.md
Makefile                      verify, check and ci triad
mise.toml, mise.lock          tool pins; `mise install` provisions them
LICENSE                       MIT license text
SECURITY.md                   private vulnerability reporting
scripts/                      template and corrections gates
  scripts/lib/risk-paths.mjs  pinned risk-path validator and matcher
  scripts/check-template.mjs  template verification entry point
  scripts/check-corrections.mjs  pinned append-only corrections gate
test/                         Node.js test fixtures and gate tests
.memory/                      append-only corrections inbox
.github/risk-paths.json       high-risk repository paths
.github/dependabot.yml        dependency update config
.github/pull_request_template.md  risk tier and verification checklist
.github/workflows/            CI and risk-paths caller workflows
```

`make verify` needs only Node.js 22 or later and `make`; `mise install`
provides the pinned Node. It uses no package manager, `package.json`, install
step or third-party dependency.

Symlinks require Linux/macOS (or `core.symlinks=true` on Windows); GitHub's
web renderer shows symlinks as their target path, which is cosmetic only.

## After you create a repository from this template

1. Create the `risk:high` label:

   ```sh
   gh label create risk:high --repo OWNER/REPO --color B60205 --description "Touches a path in .github/risk-paths.json"
   ```

   Without this label, the risk-paths job fails.

2. Add a ruleset on the default branch: it requires the `verify` check and a
   pull request for every change, and it blocks deletion and force-push.
   Repository admins can bypass it. Run it as a repository admin:

   ```sh
   gh api -X POST repos/OWNER/REPO/rulesets --input - <<'EOF'
   {"name":"main: require verify","target":"branch","enforcement":"active",
    "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
    "bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],
    "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
     {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,
      "require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},
     {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,
      "do_not_enforce_on_create":false,"required_status_checks":[{"context":"verify","integration_id":15368}]}}]}
   EOF
   ```

   Repository rulesets are not copied from a template. `15368` is the GitHub
   Actions app; `actor_id` 5 is the repository admin role.

3. Enable private vulnerability reporting. Repository settings are not copied
   from a template, so no repository made from this one has it. Run it as a
   repository admin:

   ```sh
   gh api -X PUT repos/OWNER/REPO/private-vulnerability-reporting
   ```

4. Add your repository's high-risk paths to `.github/risk-paths.json`. Use globs
   and a category from the [core risk-path specification](https://github.com/frostyard/core/blob/main/docs/specs/risk-paths.md).
