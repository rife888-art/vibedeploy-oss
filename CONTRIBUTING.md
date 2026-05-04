# Contributing to VibeDeploy

Thanks for your interest. The project is small enough that a single afternoon is enough to ship something real.

## Ground rules

- Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Open an issue before a large PR. We'd hate for you to write 800 lines we have to ask you to redo.
- One PR, one concern. Smaller PRs land faster.

## Dev setup

```bash
git clone https://github.com/rife888-art/vibedeploy-oss.git
cd vibedeploy-oss
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in your keys
cd apps/web && npm run dev
```

You'll need a Supabase project, a GitHub OAuth app, and an Anthropic API key. See [README.md](README.md#-quick-start).

## Project layout

- `apps/web` — the Next.js 14 app (server components, API routes under `app/api/*`)
- `packages/cli` — the local-scan CLI
- `supabase/schema.sql` — DB schema

## Coding style

- TypeScript strict where it's already on. Don't loosen it.
- Prefer small, single-purpose helpers in `lib/` over inlining logic in route handlers.
- API routes return `NextResponse.json(...)` with explicit status codes. No throwing.
- Validate user input at the boundary. Cap string lengths, clamp numbers, allowlist enums.
- No secrets in client components. Server-only modules: `lib/supabase.ts`, anything that touches `process.env.*_SECRET` or `*_KEY`.

## Tests

We don't have a full test suite yet. If you're adding non-trivial logic, please add a test next to the file you changed.

## Commit messages

Conventional commits, lowercase subject:

```
feat: add SARIF export for audit findings
fix: handle empty repo tree from GitHub API
docs: add Docker Compose self-host guide
chore: bump @anthropic-ai/sdk
```

## Pull requests

1. Fork and branch from `main`.
2. Keep the diff focused.
3. Update the README or relevant docs if behavior changed.
4. Fill in the PR template.
5. We aim to triage within a few days.

## Good first issues

Issues tagged [`good first issue`](../../issues?q=is%3Aopen+label%3A%22good+first+issue%22) are scoped to ~1–3 hours and don't require deep context.

## License

By contributing, you agree your work is licensed under the [MIT License](LICENSE).
