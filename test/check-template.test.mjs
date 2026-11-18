import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checker = join(repo, "scripts", "check-template.mjs");
const coreSha = "c996ea3fb54bcf1a3c621113522213702a7673e2";
const temporary = [];

const validReadme = `<!-- readme-kind: org -->
# Test template

A repository template for maintainers.

**Status:** in production.

**Documentation:** [Docs](docs/README.md)

## What is here

Portable instructions and documentation.

## Use

Copy the template.

## Develop

\`\`\`sh
mise install
make ci
\`\`\`

## Where to go next

- [AGENTS.md](AGENTS.md)
- [Docs](docs/README.md)
- [Security](SECURITY.md)
- [License](LICENSE)
`;

function replaceReadme(from, to) {
  assert.ok(validReadme.includes(from), `README fixture must contain ${JSON.stringify(from)}`);
  const changed = validReadme.replace(from, to);
  assert.notEqual(changed, validReadme);
  return changed;
}

after(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agentic-template-l3-"));
  temporary.push(root);
  mkdirSync(join(root, ".agents", "skills"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, ".memory", "corrections"), { recursive: true });
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });

  writeFileSync(join(root, "README.md"), validReadme, "utf8");
  writeFileSync(join(root, "SECURITY.md"), "# Security\n", "utf8");
  writeFileSync(join(root, "LICENSE"), "MIT\n", "utf8");
  writeFileSync(join(root, "AGENTS.md"), "# Test instructions\n", "utf8");
  symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
  symlinkSync("AGENTS.md", join(root, "GEMINI.md"));
  symlinkSync("AGENTS.md", join(root, ".cursorrules"));
  symlinkSync("../AGENTS.md", join(root, ".github", "copilot-instructions.md"));
  symlinkSync("../.agents/skills", join(root, ".claude", "skills"));

  writeFileSync(
    join(root, "docs", "README.md"),
    "# Documentation\n\n- [0001](adr/0001-x.md)\n",
    "utf8",
  );
  writeFileSync(join(root, "docs", "adr", "0001-x.md"), "# One\n", "utf8");
  writeFileSync(join(root, "docs", "adr", "TEMPLATE.md"), "# Template\n", "utf8");

  // A list of schema version 2 (the template requires it) and a caller of
  // core's pr-triage workflow, as the template ships them.
  writeFileSync(
    join(root, ".github", "risk-paths.json"),
    JSON.stringify({
      schema_version: 2,
      default_level: "L3",
      paths: [
        { glob: ".github/risk-paths.json", level: "L2", why: "governance: the high-risk path list" },
        { glob: ".github/workflows/**", level: "L2", why: "governance: CI and the caller workflow" },
      ],
    }, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(join(root, ".github", "workflows", "risk-paths.yml"), [
    "name: PR triage",
    "on:",
    "  pull_request_target:",
    "    types: [opened, synchronize, reopened, edited, labeled]",
    "permissions: {}",
    "jobs:",
    "  pr-triage:",
    "    permissions:",
    "      contents: read",
    "      pull-requests: write",
    `    uses: frostyard/core/.github/workflows/pr-triage.yml@${coreSha} # frostyard/core main`,
    "",
  ].join("\n"), "utf8");

  writeFileSync(
    join(root, ".memory", "corrections", "2026-11-01-pr-1-keep-guard.json"),
    JSON.stringify({
      date: "2026-11-01",
      scope: "test",
      correction: "keep this guard",
      evidence: "PR-1 review",
      promoted_to: "",
    }, null, 2) + "\n",
    "utf8",
  );

  copyFileSync(join(repo, "scripts", "lib", "risk-paths.mjs"), join(root, "scripts", "lib", "risk-paths.mjs"));
  copyFileSync(join(repo, "scripts", "check-corrections.mjs"), join(root, "scripts", "check-corrections.mjs"));
  copyFileSync(join(repo, "scripts", "lib", "check-readme.mjs"), join(root, "scripts", "lib", "check-readme.mjs"));
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [checker, "--root", root], {
    cwd: repo,
    encoding: "utf8",
  });
}

function output(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function assertClean(result) {
  assert.equal(result.status, 0, output(result));
}

function assertFailure(result, check) {
  assert.notEqual(result.status, 0, output(result));
  assert.match(output(result), new RegExp(check));
}

test("clean fixture tree exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assertClean(run(root));
});

test("broken CLAUDE.md link exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, "CLAUDE.md"));
  symlinkSync("missing.md", join(root, "CLAUDE.md"));
  assertFailure(run(root), "agent-symlinks");
});

test("GEMINI.md regular file exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, "GEMINI.md"));
  writeFileSync(join(root, "GEMINI.md"), "AGENTS.md\n", "utf8");
  assertFailure(run(root), "agent-symlinks");
});

test("copilot instruction link to another file exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, ".github", "copilot-instructions.md"));
  writeFileSync(join(root, "other.md"), "other\n", "utf8");
  symlinkSync("../other.md", join(root, ".github", "copilot-instructions.md"));
  assertFailure(run(root), "agent-symlinks");
});

test("cursorrules missing exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, ".cursorrules"));
  assertFailure(run(root), "agent-symlinks");
});

test(".cursorrules as a regular file exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, ".cursorrules"));
  writeFileSync(join(root, ".cursorrules"), "AGENTS.md\n", "utf8");
  assertFailure(run(root), "agent-symlinks");
});

test("missing .claude/skills link exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, ".claude", "skills"));
  assertFailure(run(root), "agent-symlinks");
});

test(".agents/skills regular file exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  rmSync(join(root, ".agents", "skills"), { recursive: true, force: true });
  writeFileSync(join(root, ".agents", "skills"), "not a directory\n", "utf8");
  assertFailure(run(root), "agent-symlinks");
});

test("unindexed doc exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "design", "x.md"), "# X\n", "utf8");
  assertFailure(run(root), "docs-index");
});

test("TEMPLATE.md that is not indexed exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "design", "TEMPLATE.md"), "# Template\n", "utf8");
  assertClean(run(root));
});

test("index link to missing doc exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n[Missing](missing.md)\n", "utf8");
  assertFailure(run(root), "docs-index");
});

test("percent-encoded and angle-bracket inline link exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "design", "a b.md"), "# A\n", "utf8");
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n- [0001](adr/0001-x.md)\n- [A](<design/a%20b.md>)\n", "utf8");
  assertClean(run(root));
});

test("reference definition index exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "design", "ref.md"), "# Ref\n", "utf8");
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n- [0001](adr/0001-x.md)\n[Ref][ref]\n\n[ref]: <design/ref.md> \"Reference\"\n", "utf8");
  assertClean(run(root));
});

test("reference definition to missing file exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n- [0001](adr/0001-x.md)\n[Missing][missing]\n\n  [missing]: design/missing.md \"Missing\"\n", "utf8");
  assertFailure(run(root), "docs-index");
});

test("bad percent escape exits 1 with docs-index", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n- [0001](adr/0001-x.md)\n[Bad](design/%zz.md)\n", "utf8");
  assertFailure(run(root), "docs-index");
});

test("inline link without closing parenthesis exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "design", "x.md"), "# X\n", "utf8");
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n- [0001](adr/0001-x.md)\n[Doc](design/x.md\n", "utf8");
  assertFailure(run(root), "docs-index");
});

test("inline link with title exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  writeFileSync(join(root, "docs", "design", "x.md"), "# X\n", "utf8");
  writeFileSync(join(root, "docs", "README.md"), "# Docs\n\n- [0001](adr/0001-x.md)\n[Doc](design/x.md \"Title\")\n", "utf8");
  assertClean(run(root));
});

test("unknown risk-path key exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), '{"schema_version":2,"default_level":"L3","paths":[],"unknown":true}\n', "utf8");
  assertFailure(run(root), "risk-paths");
});

test("invalid risk-path JSON exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), '{bad json', "utf8");
  assertFailure(run(root), "risk-paths");
});

test("missing risk-path list file exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, ".github", "risk-paths.json"));
  assertFailure(run(root), "risk-paths");
});

test("risk-path list with no caller glob exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), JSON.stringify({
    schema_version: 2,
    default_level: "L3",
    paths: [{ glob: ".github/risk-paths.json", level: "L2", why: "governance: list" }],
  }) + "\n", "utf8");
  assertFailure(run(root), "no glob matches the required path .github/workflows/risk-paths.yml");
});

test("risk-path list of schema version 1 exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), JSON.stringify({
    schema_version: 1,
    paths: [
      { glob: ".github/risk-paths.json", why: "governance: the high-risk path list" },
      { glob: ".github/workflows/**", why: "governance: CI and the caller workflow" },
    ],
  }) + "\n", "utf8");
  assertFailure(run(root), "schema_version: must be 2 in this template");
});

test("risk-path entry with no level exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), JSON.stringify({
    schema_version: 2,
    default_level: "L3",
    paths: [
      { glob: ".github/risk-paths.json", level: "L2", why: "governance: the high-risk path list" },
      { glob: ".github/workflows/**", why: "governance: CI and the caller workflow" },
    ],
  }) + "\n", "utf8");
  assertFailure(run(root), 'paths\\[1\\]: missing key "level"');
});

test("risk-path list with no default level exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), JSON.stringify({
    schema_version: 2,
    paths: [{ glob: ".github/risk-paths.json", level: "L2", why: "governance: list" }],
  }) + "\n", "utf8");
  assertFailure(run(root), 'missing key "default_level"');
});

test("risk-path list with a bad default level exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), JSON.stringify({
    schema_version: 2,
    default_level: "L5",
    paths: [{ glob: ".github/risk-paths.json", level: "L2", why: "governance: list" }],
  }) + "\n", "utf8");
  assertFailure(run(root), "default_level: must be 1 of L1, L2, L3, L4");
});

test("caller glob at level L3 exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "risk-paths.json"), JSON.stringify({
    schema_version: 2,
    default_level: "L3",
    paths: [
      { glob: ".github/risk-paths.json", level: "L2", why: "governance: the high-risk path list" },
      { glob: ".github/workflows/**", level: "L3", why: "governance: CI and the caller workflow" },
    ],
  }) + "\n", "utf8");
  assertFailure(run(root), "must be L1 or L2");
});

test("caller that still pins core's risk-paths workflow exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "workflows", "risk-paths.yml"), [
    "name: Risk paths caller",
    "on:",
    "  pull_request_target:",
    "permissions: {}",
    "jobs:",
    "  pr-triage:",
    `    uses: frostyard/core/.github/workflows/risk-paths.yml@${coreSha}`,
    "",
  ].join("\n"), "utf8");
  assertFailure(run(root), "the uses: of the job pr-triage must be frostyard/core/.github/workflows/pr-triage.yml@");
});

test("caller that renames the job exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const caller = join(root, ".github", "workflows", "risk-paths.yml");
  writeFileSync(caller, readFileSync(caller, "utf8").replace("\n  pr-triage:\n", "\n  triage:\n"), "utf8");
  assertFailure(run(root), "must run the reusable workflow in the job pr-triage");
});

test("caller with comments at indent 0 and 2 before uses exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const caller = join(root, ".github", "workflows", "risk-paths.yml");
  const text = readFileSync(caller, "utf8");
  const withComments = text.replace(
    "\n    uses: ",
    "\n  # Keep the reusable workflow SHA-pinned.\n# core ADR-0021\n\n    uses: ",
  );
  assert.notEqual(withComments, text);
  writeFileSync(caller, withComments, "utf8");
  assertClean(run(root));
});

test("caller with the pinned uses in another job exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "workflows", "risk-paths.yml"), [
    "name: PR triage",
    "on:",
    "  pull_request_target:",
    "    types: [opened, synchronize, reopened, edited, labeled]",
    "permissions: {}",
    "jobs:",
    "  pr-triage:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - run: echo triage",
    "  triage:",
    "    permissions:",
    "      contents: read",
    "      pull-requests: write",
    `    uses: frostyard/core/.github/workflows/pr-triage.yml@${coreSha} # frostyard/core main`,
    "",
  ].join("\n"), "utf8");
  assertFailure(run(root), "the job pr-triage must set uses: at 4 spaces");
});

test("caller with the pinned uses inside a run block exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".github", "workflows", "risk-paths.yml"), [
    "name: PR triage",
    "on:",
    "  pull_request_target:",
    "    types: [opened, synchronize, reopened, edited, labeled]",
    "permissions: {}",
    "jobs:",
    "  pr-triage:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - run: |",
    `          uses: frostyard/core/.github/workflows/pr-triage.yml@${coreSha}`,
    "",
  ].join("\n"), "utf8");
  assertFailure(run(root), "the job pr-triage must set uses: at 4 spaces");
});

test("correction with a sixth field exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, ".memory", "corrections", "2026-11-01-pr-1-sixth-field.json"),
    JSON.stringify({
      date: "2026-11-01",
      scope: "test",
      correction: "fix",
      evidence: "PR-1",
      promoted_to: "",
      extra: true,
    }, null, 2) + "\n",
    "utf8",
  );
  assertFailure(run(root), "corrections");
});

test("correction with bad date exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, ".memory", "corrections", "2026-02-30-pr-1-fix.json"),
    JSON.stringify({
      date: "2026-02-30",
      scope: "test",
      correction: "fix",
      evidence: "PR-1",
      promoted_to: "",
    }, null, 2) + "\n",
    "utf8",
  );
  assertFailure(run(root), "corrections");
});

test("correction with empty evidence exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, ".memory", "corrections", "2026-11-01-pr-1-empty-evidence.json"),
    JSON.stringify({
      date: "2026-11-01",
      scope: "test",
      correction: "fix",
      evidence: "",
      promoted_to: "",
    }, null, 2) + "\n",
    "utf8",
  );
  assertFailure(run(root), "corrections");
});

test("correction record that is not in canonical form exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Valid JSON, valid fields, compact on 1 line: the bytes are not canonical.
  writeFileSync(
    join(root, ".memory", "corrections", "2026-11-01-pr-1-compact.json"),
    '{"date":"2026-11-01","scope":"test","correction":"fix","evidence":"PR-1","promoted_to":""}',
    "utf8",
  );
  assertFailure(run(root), "corrections");
});

test("correction record whose name date differs from its date exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, ".memory", "corrections", "2026-11-02-pr-1-name-mismatch.json"),
    JSON.stringify({
      date: "2026-11-01",
      scope: "test",
      correction: "fix",
      evidence: "PR-1",
      promoted_to: "",
    }, null, 2) + "\n",
    "utf8",
  );
  assertFailure(run(root), "corrections");
});

test("corrections folder and the old corrections file together exit 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, ".memory", "corrections.jsonl"),
    '{"date":"2026-11-01","scope":"test","correction":"fix","evidence":"PR-1","promoted_to":""}\n',
    "utf8",
  );
  assertFailure(run(root), "corrections");
});

test("corrections folder with only .gitkeep exits 0", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, ".memory", "corrections", "2026-11-01-pr-1-keep-guard.json"));
  writeFileSync(join(root, ".memory", "corrections", ".gitkeep"), "", "utf8");
  assertClean(run(root));
});

// Exercise the template entry point, not only the vendored checker's exports:
// removing its invocation must make these negative tests fail.
const readmeFailures = [
  ["R1", "missing marker", replaceReadme("<!-- readme-kind: org -->\n", "")],
  ["R1", "unknown kind", replaceReadme("readme-kind: org", "readme-kind: unknown")],
  ["R1", "duplicate marker", `<!-- readme-kind: org -->\n${validReadme}`],
  ["R2", "missing title", replaceReadme("# Test template\n", "")],
  ["R2", "second title", `${validReadme}\n # Another title\n`],
  ["R2", "title is not first", replaceReadme("# Test template", "## Credits\n\n# Test template")],
  ["R3", "missing lead", replaceReadme("A repository template for maintainers.\n", "")],
  ["R3", "top block over 130 words", replaceReadme("A repository template for maintainers.", "word ".repeat(126))],
  ["R4", "missing status", replaceReadme("**Status:** in production.\n", "")],
  ["R4", "unknown status", replaceReadme("**Status:** in production.", "**Status:** soon.")],
  ["R4", "duplicate status", replaceReadme("**Status:**", "**Status:** stable.\n\n**Status:**")],
  ["R4", "status over 40 words", replaceReadme("**Status:** in production.", `**Status:** stable. ${"word ".repeat(39)}`)],
  ["R5", "missing documentation", replaceReadme("**Documentation:** [Docs](docs/README.md)\n", "")],
  ["R5", "documentation without link", replaceReadme("**Documentation:** [Docs](docs/README.md)", "**Documentation:** see docs")],
  ["R6", "unsupported badge", replaceReadme("# Test template", "# Test template\n\n[![Badge](https://example.org/api.scorecard.dev/badge.svg)](https://example.org/)")],
  ["R6", "more than 3 badges", replaceReadme("# Test template", `# Test template\n\n${"[![CI](https://github.com/example/repo/actions/workflows/ci.yml/badge.svg)](https://example.org/) ".repeat(4)}`)],
  ["R6", "badge outside top block", `${validReadme}\n[![CI](https://github.com/example/repo/actions/workflows/ci.yml/badge.svg)](https://example.org/)\n`],
  ["R7", "unknown section", replaceReadme("## What is here", "## Overview")],
  ["R7", "required section order", replaceReadme("## What is here\n\nPortable instructions and documentation.\n\n## Use", "## Use\n\nCopy instructions.\n\n## What is here")],
  ["R7", "section after footer", `${validReadme}\n## Credits\n`],
  ["R8", "deep heading", `${validReadme}\n ### Internals\n`],
  ["R9", "no gate command", replaceReadme("make ci", "npm test")],
  ["R9", "gate command outside fence", replaceReadme("make ci\n```", "```\n\nRun make ci.")],
  ...["AGENTS.md", "docs/README.md", "SECURITY.md", "LICENSE"].map((path) => [
    "R10", `missing footer link to ${path}`, replaceReadme(`](${path})`, "](https://example.org/)")
      // The docs link also appears in the top block; remove both destinations.
      .replaceAll(`](${path})`, "](https://example.org/)"),
  ]),
  ["R10", "footer link inside fence", replaceReadme("- [License](LICENSE)", "```md\n- [License](LICENSE)\n```")],
  ["R11", "over 1000 words", `${validReadme}\n${"word ".repeat(1001 - validReadme.trim().split(/\s+/u).length)}`],
  ["R12", "emoji inside code", `${validReadme}\n\`\`\`text\n\u2728\n\`\`\`\n`],
  ...["10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.255.255"].map((ip) => [
    "R12", `private address ${ip} inside code`, `${validReadme}\n\`\`\`text\n${ip}\n\`\`\`\n`,
  ]),
  ["R12", "more than 2 prose dates", `${validReadme}\n2026-01-01 2026-01-02 2026-01-03\n`],
  ...["├──", "└──"].map((branch) => ["R12", `tree drawing ${branch}`, `${validReadme}\n${branch} src\n`]),
];

for (const [rule, name, text] of readmeFailures) {
  test(`README ${rule}: ${name} exits 1`, (t) => {
    const root = fixture();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "README.md"), text);
    const result = run(root);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), new RegExp(`FAIL readme: README\\.md: FAIL ${rule} `));
  });
}

const readmePasses = [
  ["top block at 130 words", replaceReadme("A repository template for maintainers.", "word ".repeat(125))],
  ["status at 40 words", replaceReadme("**Status:** in production.", `**Status:** stable. ${"word ".repeat(38)}`)],
  ["file at 1000 words", `${validReadme}\n${"word ".repeat(1000 - validReadme.trim().split(/\s+/u).length)}`],
  ["make check", replaceReadme("make ci", "make check")],
  ["make verify", replaceReadme("make ci", "make verify")],
  ["fenced headings", replaceReadme("mise install", "# Comment\n## Not a section\n### Not a heading\nmise install")],
  ["R12 allowed symbols, public addresses and fenced dates", `${validReadme}\n© ® ™ QEMU 10.0.13 192.0.2.1 172.15.0.1 172.32.0.1 100.63.0.1 100.128.0.1\n2026-01-01 2026-01-02\n\`\`\`text\n2026-01-03 2026-01-04 2026-01-05\n\`\`\`\n`],
];

for (const [name, text] of readmePasses) {
  test(`README ${name} exits 0`, (t) => {
    const root = fixture();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "README.md"), text);
    assertClean(run(root));
  });
}

test("missing root README exits 1, not the docs README", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, "README.md"));
  assertFailure(run(root), "FAIL readme: README\\.md: FAIL R2 README\\.md is missing");
});

test("README R10 requires the SECURITY.md location that exists", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  unlinkSync(join(root, "SECURITY.md"));
  writeFileSync(join(root, ".github", "SECURITY.md"), "# Security\n");
  assertFailure(run(root), "FAIL readme: README\\.md: FAIL R10 .*does not link .github/SECURITY\\.md");
  writeFileSync(join(root, "README.md"), replaceReadme("](SECURITY.md)", "](.github/SECURITY.md)"));
  assertClean(run(root));
});

test("changed vendored README checker exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const library = join(root, "scripts", "lib", "check-readme.mjs");
  writeFileSync(library, readFileSync(library, "utf8") + " ", "utf8");
  assertFailure(run(root), "FAIL vendored: scripts/lib/check-readme\\.mjs:");
});

test("changed vendored risk-path library exits 1", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const library = join(root, "scripts", "lib", "risk-paths.mjs");
  writeFileSync(library, readFileSync(library, "utf8") + " ", "utf8");
  assertFailure(run(root), "vendored");
});
