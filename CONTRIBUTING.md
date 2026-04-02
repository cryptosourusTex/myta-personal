# Contributing to MyTA Personal

MyTA Personal is a professor-sovereign teaching assistant -- self-hosted,
LLM-agnostic, and open source (MIT). Contributions are welcome and appreciated.

## Getting Started

```bash
git clone https://github.com/<your-fork>/myta-personal.git
cd myta-personal
npm install
npm run dev
```

**Requirements:**

- Node.js 20+
- Ollama running locally (or any OpenAI-compatible endpoint configured in `config.yml`)

The dev server starts both the Hono backend and the Vite dev server.
Copy `config.example.yml` to `config.yml` and adjust the LLM endpoint if needed.

## Architecture

Monorepo with two packages:

| Directory | Stack | Purpose |
|-----------|-------|---------|
| `server/` | Hono, better-sqlite3 | API server, grading logic, audit log |
| `web/`    | React 18, Vite | Professor-facing UI |

- Single SQLite file stores all application data.
- Configuration lives in `config.yml` at the project root.
- Docker (`docker-compose.yml`) wraps everything for production deployment.

## Sacred Invariants

These rules protect professor sovereignty and student privacy. Any PR that
violates them will be rejected.

1. **Three-way score separation.** Every graded artifact carries three
   distinct fields: `suggested_score` (AI-written), `professor_score`
   (human-written), and `final_score` (the grade of record). AI may only
   write to `suggested_score`. It must never write to `final_score`.

2. **Audit-before-surface.** An `audit_log` entry MUST be written before
   any AI suggestion is persisted or displayed. If the audit write fails,
   the suggestion must not be stored.

3. **Professor-score gate.** `final_score` may only be set through an
   explicit professor approve action. No background job, no automation,
   no LLM call may set it.

4. **Encryption key never leaves the browser.** Student PII is encrypted
   client-side. The server never sees the plaintext key.

## Pull Request Guidelines

- Keep PRs focused -- one logical change per PR.
- Describe what changed and why in the PR description.
- Run `npx tsc --noEmit` before submitting to catch type errors.
- If your change touches grading or audit logic, explain how the sacred
  invariants are preserved.
- Add or update tests where applicable.

## What We Are Looking For

If you want to contribute but are not sure where to start, these areas
would benefit from help:

- **Accessibility** -- screen reader support, keyboard navigation, ARIA labels
- **LMS integrations** -- Blackboard, Moodle, or other LMS connectors
- **Mobile UX** -- responsive layout improvements for grading on the go
- **Offline capabilities** -- service worker support, local queue for grading
- **i18n** -- internationalization scaffolding and translations

Open an issue first if you are planning a large change so we can discuss
the approach before you invest time in it.

## Code Style

- TypeScript everywhere (server and client).
- No semicolon enforcement -- the formatter handles it.
- Functional React components with hooks. No class components.
- Keep it simple. Prefer clarity over cleverness.

## License

By contributing you agree that your contributions will be licensed under
the MIT License.
