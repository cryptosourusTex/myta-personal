# MyTA Personal

Professor-sovereign teaching assistant. Self-hosted. Free. Runs on your hardware.

---

## What It Does

- **Attendance** -- Capture attendance by tap, voice command, or photo OCR. Voice input handles fuzzy name matching so you can call out names while walking the room. Export to CSV when done.

- **Grading Review** -- Rubric-based grading with optional AI suggestions. Every grade has three separate values: AI-suggested, professor-edited, and professor-approved final. Only approved finals are ever exported. The AI suggests; you decide.

- **Document Vault** -- Store syllabi, rubrics, answer keys, and course materials. Optional AES-GCM 256-bit client-side encryption where the key never leaves your browser. Off by default -- turn it on if your storage is on a shared or cloud-synced drive.

- **Q&A Assistant** -- Draft answers to student questions using only your uploaded course documents as source material. The LLM is explicitly bounded to your documents. When the answer is not in the documents, it says so. The assistant drafts; you send through your own channel.

---

## Stack

| Layer | Technology |
|-------|------------|
| Container | Docker |
| Server | Hono / Node.js / TypeScript |
| Database | SQLite (one file, backup = copy) |
| Frontend | React 18 / TypeScript / Vite |
| AI | Any OpenAI-compatible LLM -- Ollama, LM Studio, llama.cpp, OpenAI, Anthropic, Mistral, or your institution's endpoint |
| Voice | Web Speech API (runs in the browser, no server needed) |

---

## Quick Start

### 1. Install Docker Desktop

Download from [docker.com](https://www.docker.com/products/docker-desktop/).

### 2. Install Ollama and pull a model

```bash
# Install from https://ollama.com
ollama pull llama3.2
```

Skip this step if you plan to use a remote LLM API instead.

### 3. Clone the repo

```bash
git clone https://github.com/myta-personal/myta
cd myta
```

### 4. Configure

```bash
cp config.example.yml config.yml
```

Edit `config.yml` to set your LLM endpoint, storage path, and preferences. The defaults work with a local Ollama install out of the box.

### 5. Run

```bash
docker compose up
```

Open `http://localhost:3000` in your browser. No accounts. No registration. No API keys unless you choose a remote LLM.

For development without Docker:

```bash
npm install
npm run dev
```

---

## iPhone Access via Tailscale

Install [Tailscale](https://tailscale.com/) (free) on both your server machine and your iPhone. Both devices get a stable private IP on a WireGuard-encrypted network. Access MyTA at `http://[tailscale-ip]:3000` from your phone over any network -- home WiFi, cellular, campus. No port forwarding needed. Save it to your home screen as a PWA.

---

## Governing Principle

> MyTA Personal is professor-sovereign software. The professor controls where it runs, where data lives, which AI it uses, whether encryption is on, and what the interface looks like. The software serves the professor. The professor serves the students. Nothing in between.

---

## License

MIT. Use it, fork it, run it, improve it. See [LICENSE](LICENSE).

---

## Contributing

Contributions that benefit professors are welcome. Contributions that add telemetry, analytics, mandatory accounts, or features serving institutional interests over professor interests will not be merged.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the technical process.
