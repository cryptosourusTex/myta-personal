# MyTA Roadmap

*Drafted 2026-06-12. Owner: cryptosourusTex. Review and reprioritize each semester.*

## Context

MyTA serves one professor running 3–5 concurrent classes: Political Science 100 (three sections, 20–50 students each) and a doctorate JD class on legal drafting, with a possible 400-level online summer class starting in early July 2026. The success vision is an iPhone-accessible assistant that meaningfully reduces the workload of running those classes simultaneously.

Two dates govern this roadmap:

- **2026-07-03 (summer gate):** if Milestone 1 lands by here, MyTA pilots in the 5-week online summer class.
- **2026-08-24 (fall semester):** Milestone 2 must be done. This is the hard target.

Development capacity is ~3 hours/week, so scope is deliberately tight. Milestone 1 is the critical path; everything in Milestone 3 is explicitly deferrable.

## Hard constraints (additions to the governing principle)

- **No non-local use of student data, ever.** FERPA compliance is a feature, not a footnote. All AI runs against local Ollama; any feature touching student names, grades, or submissions must work — and be verified to work — without a network call leaving the machine.
- **Professor-only.** No student-facing portal in any form.
- **Canvas is read-only.** Roster import stays; grade write-back is out of scope permanently (see resolved decisions below).

## Milestone 1 — Summer gate (target: 2026-07-03)

The minimum needed to pilot in a real class.

1. **Photo OCR attendance for handwritten sign-in sheets.** The README advertises this but no OCR code exists yet. Implement via a local vision model through the existing Ollama connection (e.g. `llama3.2-vision` or `qwen2.5-vl`), with LLM-assisted fuzzy matching of extracted names against the roster (resolves SPEC open decision #1). Flow: snap photo on iPhone → upload → extracted names matched to roster → professor confirms ambiguous matches → session saved.
2. **Essay file ingestion for grading.** Grading currently accepts only pasted text. Accept PDF, Word, and Markdown/plain-text uploads; extract text server-side and feed the existing rubric/AI-suggest pipeline. (PowerPoint and scanned-image ingestion deferred to Milestone 3.)
3. **FERPA guardrail.** Detect when the configured LLM endpoint is non-local and surface a prominent warning before any student data flows to it; document the data-flow guarantees in a short `FERPA.md`. The audit log already exists — verify it covers all AI calls.
4. **End-to-end dry run.** Full attendance + grading rehearsal with sample data, on the iPhone PWA, before real students touch it.

**Gate decision on 2026-07-03:** Milestone 1 done → onboard the summer class as the pilot. Not done → pilot waits for fall; reassess scope.

## Milestone 2 — Fall ready (target: 2026-08-24)

What three concurrent PoliSci sections plus the JD class need daily.

5. **First-pass essay grading, hardened.** Tune the AI-suggestion prompts for written/essay work (the JD legal-drafting class is the demanding case). Keep the three-value flow (AI-suggested / professor-edited / professor-approved) untouched — it is the core trust mechanism. Add a batch queue so a stack of essays can be ingested at once and reviewed one at a time.
6. **Attendance analytics.** At-risk student flags, per-student trends, and session summaries surfaced in the UI. CSV export already exists and its current format is fine.
7. **Automated test suite.** Server route tests (attendance, grading, vault, assistant) plus a few web smoke tests, wired into the existing CI workflow. Required before the pilot semester, not after.
8. **Tagged releases.** Cut `v1.0.0` with a changelog once Milestones 1–2 land; versioned releases from then on.
9. **PWA polish for daily classroom use.** Fast paths to the 3–5 active courses, attendance capture in two taps, comfortable on a phone screen. Mobile is "nice to have" in principle but the success vision is an iPhone app — treat the PWA as a first-class surface.

## Milestone 3 — Later (fall 2026 and beyond)

Ordered roughly by expressed interest; none are commitments.

- **Embeddings/RAG search over the vault** — *shipped 2026-06-12.* Index vault documents (extract → chunk → embed via local `nomic-embed-text`), store vectors in SQLite, retrieve top chunks by cosine similarity to answer lecture/prep questions. Also fixed the assistant's inability to read PDF/Word files. FERPA-guarded; same local-only guarantee.
- **Agentic batch grading** — grade an entire stack unattended, professor reviews the suggestion queue afterward. Builds on item 5.
- **Scanned-image and PowerPoint ingestion** for the vault and Q&A (local OCR via the same vision model as attendance).
- **Realtime voice interaction** beyond the current Web Speech attendance commands.
- **TA access** — scoped multi-user, only if it can be done without cloud accounts or weakening professor sovereignty.
- **Rubric template import/export** ("maybe later" per the owner).

## Resolved open decisions (SPEC.md §11)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Fuzzy name matching | LLM-assisted |
| 2 | OCR implementation | LLM vision via local Ollama vision model |
| 3 | CSV export format | Current format is sufficient |
| 4 | Canvas grade write-back | Dropped entirely — Canvas stays read-only |
| 5 | PWA icon design | Still open |
| 6 | Mobile bottom-nav order | Still open (revisit during Milestone 2 item 9) |

## Explicitly out of scope

- Any transmission of student data off the local machine (FERPA)
- Student-facing portal or accounts of any kind
- Canvas grade write-back
- LMS integrations beyond Canvas
- Vault client-side encryption work (local storage deemed sufficient; feature stays as-is, off by default)
- Telemetry, analytics, institutional features (per the governing principle)
