# Security Policy

## Reporting a vulnerability

If you find a security issue in VibeDeploy, please do **not** open a public issue.

Instead, open a [private security advisory on GitHub](../../security/advisories/new) or reach out to the maintainers directly.

Please include:

- A description of the issue
- Steps to reproduce
- The impact you think it has
- Any suggested fix (optional)

We aim to respond within 72 hours and to ship a fix within 14 days for confirmed vulnerabilities.

## Supported versions

We patch security issues on `main`. There are no LTS branches yet.

## Scope

In scope:

- The web app under `apps/web`
- The CLI under `packages/cli`
- Database schema and policies under `supabase/`

Out of scope:

- Issues that require physical access to a user's machine
- Self-XSS that requires the user to paste attacker-controlled JavaScript into devtools
- Vulnerabilities in third-party dependencies (please report those upstream)

## Hall of fame

We'll credit anyone who reports a real, fixed vulnerability here. Just let us know how you'd like to be listed.
