# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's **[private vulnerability reporting](https://github.com/isaacrowntree/rampset/security/advisories/new)**
(Security → Report a vulnerability) to reach the maintainer privately. Include
what you found, how to reproduce it, and the impact. You'll get a response as
soon as reasonably possible.

## Scope

Rampset is a **self-hosted** app: each operator runs their own instance on
their own Cloudflare account, sets their own secrets, and puts their own
Cloudflare Access policy in front of it. That means:

- **In scope:** flaws in this codebase — e.g. a way to read another user's data
  that isn't blocked by Cloudflare Access, a broken backup/sync authorization
  check, or an XSS/injection in the app itself.
- **Out of scope / operator responsibility:** your Cloudflare Access
  configuration, your Worker secrets, your `.env.local`, and anything specific
  to how you deployed it. Never commit secrets — `.env.local` and `.dev.vars`
  are gitignored for this reason.

## Supported versions

This is a young project; fixes land on `main`. Please test against the latest
`main` before reporting.
