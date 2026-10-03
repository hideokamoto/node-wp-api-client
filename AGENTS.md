# Agent guide

## Commit convention (required)

Releases are driven by semantic-release (`.releaserc.json`, preset `conventionalcommits`),
which reads **every commit** on `main` since the last `v*` tag. `feat:` -> minor,
`fix:` / `perf:` -> patch, `feat!:` or a `BREAKING CHANGE:` footer -> major.
`chore:` / `docs:` / `ci:` / `test:` / merge commits do not release.
Do not write `BREAKING CHANGE:` in a commit body unless you mean a major release.

Agents MUST write Conventional Commit messages and must never bypass the hook
(`--no-verify`):

- Local: husky `commit-msg` hook runs commitlint with
  `@commitlint/config-conventional` (`commitlint.config.js`). Active after
  `pnpm install` (the `prepare` script runs `husky`, which sets `core.hooksPath`).
- `.github/pull_request_template.md` reminds human contributors that the PR
  title must be conventional (it becomes the squash-merge subject).
