# MyTA Personal — Open Source Technical Specification

**Version:** v1.0  
**License:** MIT  
**Status:** Governing specification for the MyTA Personal open source project  
**Repository:** github.com/myta-personal/myta

---

## The One Sentence That Governs Everything

**MyTA Personal is professor-sovereign software.** The professor controls where it runs, where data lives, which AI it uses, whether encryption is on, and what the interface looks like. The software serves the professor. The professor serves the students. Nothing in between.

Every design decision in this specification follows from that sentence. When a proposed feature conflicts with it, the feature loses.

---

## 1. What This Is

MyTA Personal is a self-hosted, open-source teaching assistant for individual professors. It runs on hardware the professor controls, uses any AI the professor chooses, stores data where the professor decides, and respects that the professor is a professional adult who does not need to be managed by their own software.

It provides four workflows:

1. **Attendance** — capture, reconcile, and export attendance records
2. **Grading Review** — rubric-based grading with optional AI suggestions, always professor-approved
3. **Syllabus Q&A** — source-bounded draft answers to student questions from the professor's own documents
4. **Document Vault** — secure storage for course materials, optionally encrypted

It runs on any hardware that can run Docker. It works with any OpenAI-compatible AI endpoint — local models (Ollama, LM Studio, llama.cpp), institutional LLMs, or commercial APIs (OpenAI, Anthropic, Mistral). It works with Canvas via a personal API token. It works completely offline except for Canvas sync.

It is free. It has no accounts, no subscriptions, no telemetry, no vendor lock-in. MIT license.

---

## 2. What This Is Not

- Not a multi-tenant platform
- Not an institutional deployment tool
- Not a compliance enforcement system
- Not a grading automation system — the professor approves every grade
- Not a surveillance tool — no usage tracking, no analytics, no reporting to anyone
- Not a hosted service — the professor runs it

---

## 3. Architecture

### 3.1 Design Principles

1. **Professor-first.** The app serves the professor's workflow, not the institution's reporting needs.
2. **Local by default.** Everything works without internet except Canvas sync.
3. **Bring your own AI.** Any OpenAI-compatible endpoint. Local or remote. Professor's choice.
4. **Bring your own storage.** Any path the professor can write to. Local folder, NAS, external drive.
5. **Encryption is an option, not a mandate.** Offered where it adds real value, not forced where it adds friction without benefit.
6. **Accessible by design.** Voice input and readback available for hands-busy classroom use and accessibility needs. WCAG 2.2 AA baseline.
7. **One command to start.** `docker compose up` and it runs.
8. **No accounts.** No registration, no email confirmation, no vendor relationship required.

### 3.2 System Diagram

```
Professor's iPhone / Laptop / Desktop (browser)
         │
         │  Tailscale private network (WireGuard encrypted)
         │  — or — localhost (if on same machine)
         │
    ┌────┴──────────────────────────────────────┐
    │  MyTA Server (Docker, professor's hardware)│
    │                                            │
    │  Hono API (Node.js / TypeScript)           │
    │  SQLite database (local file)              │
    │  File storage (any professor-chosen path)  │
    │  Optional AES-GCM encryption layer         │
    └────┬──────────────────────────────────────┘
         │
    ┌────┴──────────────────────────────────────┐
    │  LLM (any OpenAI-compatible endpoint)      │
    │  Ollama (local) · College LLM · API        │
    └───────────────────────────────────────────┘
         │
    ┌────┴──────────────────────────────────────┐
    │  Canvas API (optional, internet required)  │
    │  Personal token · Read-only by default     │
    └───────────────────────────────────────────┘

Voice:  Web Speech API (browser, on-device, no server)
TTS:    browser speechSynthesis (no server)
```

### 3.3 Components

**Server** — Hono on Node.js in a Docker container. Handles API requests, database reads and writes, file storage, AI proxy, and Canvas sync. Exposes port 3000 by default.

**Database** — SQLite, stored as a single file in the data volume. No external database server. Backup is copying one file.

**File storage** — any directory the professor mounts into the container. Defaults to `./data/vault` inside the Docker volume. Can be pointed at any path: an external drive, a NAS mount, a network folder.

**AI proxy** — the server relays prompts to the configured LLM endpoint using the OpenAI chat completions API format. The professor's AI credentials never go to the browser; they stay on the server.

**Web client** — React 18 + TypeScript + Vite, served by the same Docker container. Works in any modern browser.

**iPhone** — Progressive Web App saved to the home screen. Same codebase as the web client. No App Store required.

**Networking** — Tailscale is the recommended path for accessing the server from iPhone and other devices not on the same local network. Free tier, WireGuard encryption, works behind NAT, no port forwarding needed. Localhost works when the browser and server are on the same machine.

### 3.4 Configuration

Everything professor-configurable lives in `config.yml`, which the professor edits before starting the server. No environment variables to memorize, no hidden settings files.

```yaml
# MyTA Personal — Configuration
# Edit this file, then run: docker compose up

llm:
  endpoint: http://localhost:11434/v1   # Ollama default
  model: llama3.2                       # any model name
  api_key: ""                           # blank for local models
  context_window: 8192                  # tokens available for context

storage:
  path: /data/vault                     # inside the container
  encryption: false                     # true = AES-GCM 256-bit client-side
  # If encryption: true, key is generated in the browser on first run
  # and never transmitted to the server

canvas:
  domain: ""                            # e.g. college.instructure.com
  # API token is set in the app UI — not stored in this file

server:
  port: 3000
  host: 0.0.0.0                         # listen on all interfaces for Tailscale

accessibility:
  voice_input: true                     # dictation on attendance + grading
  voice_readback: false                 # TTS for Q&A draft answers
```

### 3.5 Encryption — When and Why

Encryption is offered, not imposed. The framing in the UI is honest:

> "Encrypt your vault files? Recommended if your storage is on a shared drive, network folder, or cloud-synced location. Not necessary if your storage is on a personal device you already password-protect."

When `encryption: false` (default): files are stored as-is in the configured path. Protected by whatever the professor already has — OS login, disk encryption, FileVault, BitLocker. This is the right choice for most professors storing files on their own laptop.

When `encryption: true`: files are encrypted in the browser using AES-GCM 256-bit before being sent to the server. The server stores only ciphertext. The encryption key lives in the browser's localStorage and never reaches the server. A backup export of the key is offered on first run. If the key is lost and there is no backup, the encrypted files are permanently unreadable — this is communicated clearly before encryption is enabled.

The encryption implementation is identical whether the professor is using a local server or a remote one. The server is always blind to file contents when encryption is on.

---

## 4. Database Schema

SQLite. One file. The complete schema:

```sql
-- Server configuration (one row)
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Canvas courses synced from API
CREATE TABLE course (
  id          TEXT PRIMARY KEY,  -- Canvas course ID
  name        TEXT NOT NULL,
  term        TEXT,
  canvas_url  TEXT,
  synced_at   INTEGER NOT NULL
);

-- Students per course
CREATE TABLE student (
  id          TEXT PRIMARY KEY,  -- Canvas user ID
  course_id   TEXT NOT NULL REFERENCES course(id),
  name        TEXT NOT NULL,
  email       TEXT,
  section     TEXT,
  UNIQUE(id, course_id)
);

-- Attendance sessions
CREATE TABLE attendance_session (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES course(id),
  date        TEXT NOT NULL,       -- ISO date YYYY-MM-DD
  notes       TEXT,
  finalized   INTEGER DEFAULT 0,   -- 0 | 1
  created_at  INTEGER NOT NULL
);

-- Attendance records
CREATE TABLE attendance_record (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES attendance_session(id),
  student_id    TEXT NOT NULL,
  status        TEXT NOT NULL,     -- present | absent | late | excused
  note          TEXT,
  source        TEXT DEFAULT 'manual',  -- manual | voice | ocr | canvas
  ocr_confidence TEXT,             -- high | review | low | null
  updated_at    INTEGER NOT NULL
);

-- Rubrics
CREATE TABLE rubric (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  course_id   TEXT REFERENCES course(id),
  created_at  INTEGER NOT NULL
);

-- Rubric criteria
CREATE TABLE rubric_criterion (
  id              TEXT PRIMARY KEY,
  rubric_id       TEXT NOT NULL REFERENCES rubric(id),
  title           TEXT NOT NULL,
  description     TEXT,
  points_possible REAL NOT NULL,
  sort_order      INTEGER DEFAULT 0
);

-- Assignments
CREATE TABLE assignment (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL REFERENCES course(id),
  name                TEXT NOT NULL,
  canvas_assignment_id TEXT,
  points_possible     REAL,
  rubric_id           TEXT REFERENCES rubric(id),
  created_at          INTEGER NOT NULL
);

-- Grading sessions
CREATE TABLE grading_session (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignment(id),
  status        TEXT DEFAULT 'active',  -- active | complete
  created_at    INTEGER NOT NULL
);

-- Per-student per-criterion grade items
-- Three-way separation is mandatory: suggested / professor / final
CREATE TABLE grade_item (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT NOT NULL REFERENCES grading_session(id),
  student_id              TEXT NOT NULL,
  criterion_id            TEXT NOT NULL REFERENCES rubric_criterion(id),

  -- AI suggestion (read-only after creation)
  suggested_score         REAL,
  suggested_comment       TEXT,
  suggested_passage       TEXT,        -- supporting excerpt from submission
  ai_model                TEXT,
  ai_endpoint             TEXT,

  -- Professor values (editable)
  professor_score         REAL,
  professor_comment       TEXT,

  -- Final (written only on explicit approve action)
  final_score             REAL,
  final_comment           TEXT,

  status  TEXT DEFAULT 'pending',
  -- pending | suggested | edited | approved
  -- Only 'approved' items are exported

  input_method TEXT DEFAULT 'keyboard', -- keyboard | voice
  updated_at   INTEGER NOT NULL,
  UNIQUE(session_id, student_id, criterion_id)
);

-- Vault assets (metadata — files stored separately)
CREATE TABLE vault_asset (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,   -- syllabus | rubric | notes | answer_key | other
  course_id   TEXT REFERENCES course(id),
  file_path   TEXT NOT NULL,   -- relative path within storage.path
  size_bytes  INTEGER,
  encrypted   INTEGER DEFAULT 0,  -- matches config.storage.encryption
  created_at  INTEGER NOT NULL
);

-- Append-only audit log
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,
  input_method TEXT,           -- keyboard | voice | system
  created_at  INTEGER NOT NULL
);
```

---

## 5. API Specification

All endpoints are prefixed `/api`. All requests and responses are JSON unless noted.

### 5.1 Configuration

```
GET  /api/config           — returns current config (no secrets)
PUT  /api/config           — update config values
POST /api/config/test-llm  — test LLM connection, returns {ok, model, latency_ms}
POST /api/config/test-canvas — test Canvas token, returns {ok, courses_count}
```

### 5.2 Canvas Sync

```
POST /api/canvas/sync
— syncs courses and rosters from Canvas
— returns {courses_synced, students_synced, synced_at}
— if Canvas unreachable: returns {error, cached_at} with last-known data
```

### 5.3 Courses and Students

```
GET  /api/courses                    — list all courses
GET  /api/courses/:id                — course detail
GET  /api/courses/:id/students       — student roster
```

### 5.4 Attendance

```
POST /api/attendance/sessions
GET  /api/attendance/sessions/:id
GET  /api/attendance/sessions?course_id=&date=
PUT  /api/attendance/records/:id     — update status/note
POST /api/attendance/sessions/:id/finalize
GET  /api/attendance/sessions/:id/export  — returns CSV
POST /api/attendance/sessions/:id/voice   — process voice command string
— accepts: {command: "mark sarah chen absent"}
— returns: {actions_taken: [{student_id, name, status}], unmatched: []}
```

### 5.5 Grading

```
POST /api/rubrics
GET  /api/rubrics/:id
POST /api/grading/sessions
GET  /api/grading/sessions/:id
GET  /api/grading/sessions/:id/queue         — student list with status counts
POST /api/grading/sessions/:id/suggest/:student_id
— writes audit_log BEFORE returning suggestions
— returns degraded-state if audit write fails (never returns unaudited suggestions)
GET  /api/grading/items?session_id=&student_id=
PUT  /api/grading/items/:id                  — update professor score/comment
POST /api/grading/items/:id/approve          — moves professor values to final
GET  /api/grading/sessions/:id/export        — CSV, approved items only
POST /api/grading/sessions/:id/canvas-writeback  — posts final grades to Canvas
```

### 5.6 Vault

```
POST /api/vault/upload                       — multipart, handles encrypt if configured
GET  /api/vault/assets?course_id=
GET  /api/vault/assets/:id/download          — returns file bytes (ciphertext if encrypted)
DELETE /api/vault/assets/:id
```

### 5.7 Q&A Assistant

```
POST /api/assistant/answer
— body: {question, course_id, vault_asset_ids[]}
— client sends plaintext content of selected assets (decrypted client-side if encrypted)
— server relays to LLM, never stores plaintext
— returns {draft, source_citation, confidence}
— confidence: "clearly_answered" | "partially_answered" | "not_in_documents"
— writes audit_log entry
```

### 5.8 Audit Log

```
GET /api/audit?entity_type=&entity_id=&limit=
```

---

## 6. Module Specifications

### 6.1 Attendance Module

**Capture screen design (professor-first):**
- Student list with large touch targets (minimum 44×44pt, WCAG 2.5.5)
- Default state: all absent (honest default — presence requires confirmation)
- Single tap: present (green)
- Double tap: late (amber)
- Triple tap: excused (blue)
- Tap again: absent (reset)
- Long press: opens note field for that student
- Session notes field at top
- Finalize button locks session and writes audit log

**Voice input (accessibility + classroom use):**
Voice commands processed server-side against the current roster using fuzzy name matching:
- "Mark [name] absent / present / late / excused"
- "Everyone present" — marks all present
- "Everyone present except [name]" — marks all present, one absent
- "Note: [text]" — appends to session notes
- Names matched by phonetic similarity (handles pronunciation variations)
- Unmatched names returned to UI for manual review — never silently dropped

**OCR path (optional):**
Photo of paper sign-in sheet → server sends to LLM with vision prompt → returns name list with confidence → professor reviews before accepting. Low-confidence entries require explicit tap to accept. Never bulk-accepted.

**Export:** CSV with student_name, student_id, date, status, note. Professor controls what they do with it.

### 6.2 Grading Review Module

**The architectural invariant that must never be violated:**
Suggested score, professor score, and final score are separate database columns and separate UI states. They are never merged. The approve action is the only path from professor score to final score. Only final scores are exported. This is not a UI convention — it is enforced at the API and database layer.

**Workflow:**
1. Professor creates or imports a rubric
2. Professor attaches rubric to an assignment
3. Professor opens a grading session — one student at a time
4. For each student: paste or upload submission text
5. Optional: request AI suggestions per criterion
6. Professor reviews each criterion: accept suggestion, modify it, or enter manually
7. Professor approves each criterion — this is an explicit action, never automatic
8. Export CSV when session is complete

**AI suggestion prompt (sent from server to LLM):**
```
You are assisting a professor with grading. Be direct and specific.
Apply the rubric as written — do not adjust for leniency or harshness.

Criterion: {title} — {description} ({points} points possible)

Student submission:
{submission_text}

{if vault_context}
Supporting course materials:
{vault_context}
{end if}

Provide exactly:
1. Suggested score: [number from 0 to {points}]
2. Comment: [2-3 sentences explaining the score]
3. Supporting passage: [the specific text from the submission 
   that most supports your score, or "none identified"]
```

**Voice input for grading (accessibility):**
- Dictation on comment fields — tap microphone icon, speak, text appears
- "Score [number]" — sets the professor score field
- "Next student" — advances queue
- "Accept" — accepts the AI suggestion for the current criterion
- "Next criterion" — moves to next
- Implemented via Web Speech API — no server involvement, works offline

### 6.3 Syllabus Q&A Module

**Source-bounded rule:** The LLM is explicitly instructed to answer only from provided documents. If the answer is not in the documents, it says so. The UI shows a prominent warning when confidence is "not_in_documents" — professor must acknowledge before copying the draft.

**The assistant never sends anything.** It drafts. The professor reads, edits, and sends through their own channel (email, Canvas message, etc.). This is not a convenience limitation — it is a deliberate design choice that keeps the professor in the communication loop.

**Voice readback (accessibility):** If enabled in config, the TTS button reads the draft answer aloud using `window.speechSynthesis`. Useful for reviewing a draft while hands are occupied or for professors with visual impairments.

### 6.4 Document Vault Module

**When encryption is off:** upload → server saves file to configured path → metadata in SQLite. Retrieval is the reverse. Simple.

**When encryption is on:**
- Upload: browser reads file → encrypts with AES-GCM 256-bit using key from localStorage → sends ciphertext to server → server saves ciphertext → metadata in SQLite
- Retrieval: server sends ciphertext to browser → browser decrypts with key from localStorage → file available
- Server is blind to file contents at all times
- Key never leaves the browser

**Encryption key setup (first run, when encryption: true):**
1. Browser generates AES-GCM 256-bit key via Web Crypto API
2. Stores in localStorage as base64
3. Shows one-time setup screen: "Export a backup of your encryption key. If you lose this key and your backup, your files cannot be recovered."
4. Export button downloads key as `myta-key-backup.key`
5. Professor acknowledges before proceeding (not a skip — a confirmation that they've saved or chosen not to)
6. On return visits: reads key from localStorage silently
7. If key missing: recovery screen with import option — never generates new key silently

---

## 7. AI Integration

### 7.1 Provider-Agnostic Design

The server uses the OpenAI chat completions API format for all LLM calls. This works with:

| Provider | Endpoint | Notes |
|---|---|---|
| Ollama (local) | http://localhost:11434/v1 | Free, fully offline |
| LM Studio (local) | http://localhost:1234/v1 | Free, fully offline |
| llama.cpp server | http://localhost:8080/v1 | Free, fully offline |
| OpenAI | https://api.openai.com/v1 | Paid API key required |
| Anthropic | https://api.anthropic.com/v1 | Paid API key required |
| Mistral | https://api.mistral.ai/v1 | Paid API key required |
| Any OpenAI-compatible LLM | Custom URL | College-hosted, etc. |

### 7.2 Recommended Local Models

For professors who want fully local AI:
- **llama3.2** (8B) — good for grading comments and Q&A, runs on most modern laptops
- **mistral-7b** — slightly better at following rubric instructions
- **llama3.2:3b** — runs on older or less powerful hardware, reduced quality

Install via Ollama: `ollama pull llama3.2`

### 7.3 Audit Before Surface

For all material AI outputs (grading suggestions, Q&A drafts), the server writes an audit_log entry before returning the output to the browser. If the audit write fails, the server returns a degraded-state response — the output is not surfaced without an audit record.

This is not a compliance requirement for personal use. It is good practice that helps the professor review what the AI suggested versus what they approved, and supports the professor if a grading decision is ever questioned.

### 7.4 Privacy

When using a local LLM: student submissions and course materials never leave the professor's hardware.

When using a remote API: the professor is the customer of that API. They are responsible for reviewing the provider's data handling terms. The server sends only the content needed for the specific request — it does not accumulate or log prompt contents beyond the audit_log action description.

---

## 8. Accessibility

MyTA Personal targets WCAG 2.2 AA compliance. This is appropriate for a professional tool a professor might use alongside or recommend to students with disabilities.

### 8.1 Core Requirements

- Keyboard navigation for all web workflows
- Visible focus indicators
- Screen-reader compatible state labels (Suggested vs Approved vs Pending — not color only)
- Minimum touch targets 44×44pt on mobile (WCAG 2.5.5)
- Non-color-only status indicators — icon or label accompanies any color distinction
- Readable error and confirmation language

### 8.2 Voice Input (Accessibility Feature)

Voice input is available on attendance capture and grading comment fields via the browser's Web Speech API. This requires no server, no additional setup, and works on Chrome and Safari. It is particularly useful for:
- Professors with motor impairments who find sustained typing difficult
- Classroom use where the professor is moving around and cannot look at the screen
- Speed — dictating a grading comment is faster than typing for most people

Voice input is not the primary interface. Keyboard and touch work fully without it. It is an enhancement.

### 8.3 Voice Readback (Accessibility Feature)

The Q&A assistant can read draft answers aloud using `window.speechSynthesis`. Enabled in config. Useful for professors with visual impairments or for reviewing a draft while preparing to send.

---

## 9. Networking and Access

### 9.1 Same-Machine Access

If the professor runs the server on the same computer as their browser:
- Access at `http://localhost:3000`
- No additional setup

### 9.2 Cross-Device Access (iPhone from Laptop Server)

Recommended: **Tailscale**
1. Install Tailscale on the server machine and the iPhone (free)
2. Both devices get a stable private IP on the Tailscale network
3. Access MyTA at `http://[tailscale-ip]:3000` from the iPhone
4. Works over any network — home WiFi, cellular, campus network
5. WireGuard encryption between devices

Alternative: same local WiFi network, access via the server's local IP (e.g., `http://192.168.1.x:3000`). Works at home, stops working when away from home network.

### 9.3 Dedicated Server Access

For professors running MyTA on a home server, NAS, or VPS:
- Tailscale works identically
- Alternatively: HTTPS with a domain name and Let's Encrypt certificate
- VPS option: a $5/month Hetzner or DigitalOcean instance running the Docker container

---

## 10. Installation

### 10.1 Prerequisites

- Docker Desktop (Mac or Windows) or Docker Engine (Linux)
- Tailscale (if accessing from iPhone or multiple devices) — optional for same-machine use
- Ollama (if using local AI) — optional, any OpenAI-compatible endpoint works

### 10.2 Install Steps

```bash
# 1. Download the project
git clone https://github.com/myta-personal/myta
cd myta

# 2. Edit configuration
cp config.example.yml config.yml
# Edit config.yml — set your LLM endpoint, storage path, etc.

# 3. Start
docker compose up

# 4. Open the app
# Browser: http://localhost:3000
# iPhone (same WiFi): http://[your-machine-ip]:3000
# iPhone (any network): http://[tailscale-ip]:3000
```

That is the complete install. No accounts. No API keys required unless using a remote LLM. No registration.

### 10.3 First Run

On first launch the app walks through:
1. LLM connection test — enter endpoint and model, test it
2. Canvas connection (optional) — enter domain and token, test it
3. Encryption choice — explained honestly, off by default
4. If encryption on: key generation and backup export

After that: the app is ready to use.

---

## 11. Open Decisions

Items not fixed in this spec that implementers must decide before building the relevant module:

1. Fuzzy name matching algorithm for voice attendance commands — Levenshtein distance, phonetic (Soundex/Metaphone), or LLM-assisted
2. OCR implementation — LLM vision (most flexible, uses existing LLM connection) vs dedicated OCR library (faster, works with non-vision models)
3. CSV export format details — column names, date format, encoding
4. Canvas grade write-back — enabled by default or opt-in per session
5. PWA icon design
6. Mobile bottom navigation item order

These decisions must not weaken any constraint fixed elsewhere in this spec.

---

## 12. Contributing

This project welcomes contributions. The governing constraint is the one sentence at the top: **MyTA Personal is professor-sovereign software.**

Contributions that add features benefiting professors are welcome. Contributions that add telemetry, analytics, reporting to third parties, mandatory accounts, or features that serve institutional interests over professor interests will not be merged.

See CONTRIBUTING.md for the technical contribution process.

---

## 13. License

MIT License. Use it, fork it, run it, improve it. See LICENSE.
