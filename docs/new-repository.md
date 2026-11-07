# After you create a repository from this template

[Back to the README](../README.md).

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
