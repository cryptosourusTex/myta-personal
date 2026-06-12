# FERPA and Student Data in MyTA

MyTA handles education records — student names, attendance, submissions, and
grades — so FERPA applies to how you run it. This document states exactly
where student data lives, where it flows, and what the software does to keep
it under your control.

## Where student data lives

Everything is stored in a single SQLite file (`data/myta.db`) and a vault
directory (`data/vault/`) on the machine running MyTA. There is no cloud
backend, no telemetry, no analytics, and no third-party storage. Backup is
your responsibility: copy the `data/` directory.

## Where student data flows

| Feature | What is sent | Sent to |
|---------|--------------|---------|
| Grading suggestions | Student submission text, rubric | Your configured LLM endpoint |
| Photo attendance (OCR) | Photo of the sign-in sheet, class roster names | Your configured LLM endpoint |
| Q&A assistant | Your course documents and the question you type | Your configured LLM endpoint |
| Canvas sync | Your Canvas API token (outbound request only) | Your institution's Canvas instance |
| Everything else | Nothing leaves the machine | — |

The LLM endpoint is the only place student data can flow. If that endpoint is
local (Ollama, LM Studio, llama.cpp on your machine or private network),
student data never leaves hardware you control.

## The guardrail

Before any feature sends student data to the LLM, MyTA checks whether the
configured endpoint is local:

- **Local** means: localhost/loopback, RFC1918 private addresses (10.x,
  192.168.x, 172.16–31.x), `.local` hostnames, or the Tailscale private range
  (100.64–127.x and `.ts.net`).
- If the endpoint is **not local**, grading suggestions and photo attendance
  return an error instead of sending the data.

You can override this in Settings ("Allow student data to be sent to this
remote endpoint"). That is your decision to make as the data custodian —
typically appropriate only if your institution has a contractual agreement
(and any required data-protection addendum) with the AI provider. The
override is off by default and survives nowhere except your own database.

## What the guardrail does not do

- It does not inspect packets or guarantee your network configuration is
  private. A mislabeled DNS name pointing at a public service would pass the
  check. Know what your endpoint actually is.
- It does not cover the Q&A assistant, which sends your course documents
  (not student records) to the LLM. Avoid pasting student-identifying
  information into Q&A questions if your endpoint is remote.
- It is not legal advice. When in doubt, ask your institution's registrar or
  counsel what your FERPA obligations are.

## Audit trail

Every AI call that touches student data is recorded in the local audit log
(`audit_log` table, visible in the app): grading suggestions log the model
and endpoint used; photo attendance logs the model and match counts. Grades
are only ever exported after explicit professor approval, by you, as CSV.
