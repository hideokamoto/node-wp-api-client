## Summary

<!-- What does this PR change and why? -->

## Release impact

<!--
semantic-release derives the version bump from the Conventional Commits on main.
With squash-merge, the commit subject defaults to the PR title, so the title
MUST be a Conventional Commit:

  feat: ...      -> minor release
  fix: ...       -> patch release
  perf: ...      -> patch release
  feat!: / fix!: -> major release (breaking)
  refactor:, chore:, docs:, ci:, test:, style:, build:, revert:
                 -> no release

Local commits are validated by commitlint via the husky commit-msg hook.
-->

- [ ] PR title is a Conventional Commit (`feat:`, `fix:`, `chore:`, ...)
- [ ] `pnpm run lint`, `pnpm run typecheck`, and `pnpm test` pass locally
