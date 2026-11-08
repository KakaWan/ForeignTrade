<div align="center">

# ForeignTrade

**A local-first workspace for foreign trade customer development.**

Manage companies and contacts · Deduce and verify emails · Generate AI outreach · Track follow-ups

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-early%20development-orange)](https://github.com/KakaWan/ForeignTrade)

**English (primary)** · [简体中文](README.zh-CN.md)

[Features](#features) · [Screenshots](#screenshots) · [Language](#language) · [Quick Start](#quick-start) · [Configuration](#configuration) · [Roadmap](#roadmap)

</div>

ForeignTrade is a local-first customer development workspace for foreign trade. It keeps companies, contacts, emails, outreach letters, and follow-ups in one place. It uses SQLite by default and stores data on your machine — no cloud service or account system required.

It is designed for individual salespeople, SOHOs, and small teams. The current version is `0.1.0` and is still under active development; APIs and data structures may change.

> **Scope**: no customer-data scraping or crawling, and no automatic mass email sending. Email verification is heuristic, not deterministic.

## Features

- **Companies and contacts** — companies, contacts, multiple countries, multiple business lines, favorites, search/filter, bulk actions, and duplicate detection.
- **Email deduction** — generate candidate emails from a name and company domain; three built-in pattern groups (conservative, standard, comprehensive), custom patterns, and AI-generated patterns.
- **Email verification** — DNS (MX/SPF/DKIM) and SMTP RCPT multi-signal checks; results are `valid`, `likely_valid`, or `unknown`; rate limiting and spam-trap detection.
- **AI outreach** — six-step sequence templates, `{Field}` data wildcards, `{AI:instruction}` sections, live preview, and multilingual output (independent of the UI language).
- **Excel import/export** — standard company/contact templates and the custom “Foreign Trade Company” template; the custom template parses public emails and contacts and merges duplicate companies by field.
- **Follow-ups and dashboard** — reminders, status management, KPIs, activity calendar, trends, country/business-line distributions, and upcoming birthdays.
- **Chinese/English UI** — a top-right dropdown switches between 中文 and English; the choice is stored locally, and the language-pack structure is extensible.
- **Local-first** — SQLite storage; the database and settings can be backed up, restored, uploaded, and downloaded as a zip.

## Screenshots

> All screenshots use fictional demo data.

![Dashboard](docs/images/dashboard-en-top.png)

| Companies | People |
|:---:|:---:|
| ![Companies](docs/images/companies-en-crop.png) | ![People](docs/images/people-en-crop.png) |
| Multiple countries, business lines, emails, and bulk actions | Email deduction, contact status, and outreach progress |

| AI outreach | Follow-ups |
|:---:|:---:|
| ![AI outreach](docs/images/letter-en-crop.png) | ![Follow-ups](docs/images/followups-en-crop.png) |
| Six-step flow, template wildcards, and live preview | Reminder dates, statuses, and linked customers |

## Language

The top-right language dropdown switches the UI between **中文** and **English**. The selection is stored in browser local storage and persists across reloads.

![Language switch](docs/images/language-switch-crop.png)

Language packs live in `frontend/src/i18n/locales/`:

- `zh-CN.ts` — Chinese (source language)
- `en-US.ts` — English

To add a language, create `locales/<code>.ts`, export a `LanguagePack`, and register it in the `languagePacks` array in `frontend/src/i18n/index.tsx`. Packs use the Chinese source string as the key, so you can copy `en-US.ts` and replace the translations. Missing keys fall back to Chinese.

> UI language (Chinese / English) and AI outreach output language (English, German, French, Spanish, Italian, Portuguese, Dutch, Russian, Japanese, Chinese) are independent settings.

## Quick Start

### Requirements

- Python 3.11+
- Node.js 18+ and npm
- Windows 10/11 can use the `.bat` scripts; macOS/Linux can use the manual commands

### One-click start (Windows)

```bat
git clone https://github.com/KakaWan/ForeignTrade.git
cd ForeignTrade

cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
if not exist data mkdir data

cd ..\frontend
npm install
cd ..
start.bat
```

Open <http://localhost:5173>. On first start, the backend runs database migrations and seeds the default email patterns, six outreach templates, and product catalog.

> `start.bat` / `stop.bat` terminate all local Python/Node processes. Save your work before running them.

### Manual start

Backend:

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
mkdir -p data                   # Windows: if not exist data mkdir data
cp .env.example .env            # optional; Windows: copy .env.example .env
python run.py
```

Frontend (in another terminal):

```bash
cd frontend
npm install
npm run dev
```

| Service | URL |
| --- | --- |
| Frontend | <http://localhost:5173> |
| Backend | <http://localhost:8000> |
| API docs | <http://localhost:8000/api/docs> |

### Configure AI

Open **Settings → AI configuration**, choose Anthropic or an OpenAI-compatible provider, enter the API key, base URL, and model, click **Test connection**, then save. Settings are written to `backend/config.json` and persist across restarts.

You can also copy `backend/.env.example` to `backend/.env`. Priority: built-in defaults < environment variables / `.env` < `config.json` saved from the Settings page.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | empty | API key for the selected provider |
| `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` | official URLs | Can point to a compatible gateway |
| `DB_ENGINE` / `DB_URL` | `sqlite` / `sqlite+aiosqlite:///./data/foreigntrade.db` | SQLite by default |
| `EMAIL_DEDUCE_MODE` | `disabled` | `disabled` / `manual` / `auto` |
| `EMAIL_VERIFY_MODE` | `manual` | `disabled` / `manual` / `auto` |
| `EMAIL_VERIFY_RATE_LIMIT` | `5` | Maximum email verifications per minute |
| `CORS_ORIGINS` | `["http://localhost:3000", "http://localhost:5173"]` | Allowed frontend origins (JSON array) |
| `BACKUP_ENABLED` | `false` | Enable scheduled backups |

See [`backend/app/core/config.py`](backend/app/core/config.py) for the full list. [`backend/.env.example`](backend/.env.example) provides a commented template.

## Tech Stack

| Frontend | Backend | Data and integrations |
| --- | --- | --- |
| React 18 · TypeScript · Ant Design 5 · Zustand · Vite · Recharts | FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic 2 | SQLite · dnspython · aiosmtplib · openpyxl · Anthropic / OpenAI-compatible APIs |

<details>
<summary><strong>Project structure</strong></summary>

```text
ForeignTrade/
├─ backend/
│  ├─ app/
│  │  ├─ api/          # companies, people, emails, outreach, settings, backups
│  │  ├─ core/         # configuration, database, cache, paths
│  │  ├─ models/       # SQLAlchemy models
│  │  ├─ schemas/      # Pydantic schemas
│  │  ├─ services/     # deduction/verification, AI, import/export, dedup, backup
│  │  └─ main.py
│  ├─ migrations/      # Alembic migrations
│  ├─ tests/           # pytest
│  ├─ .env.example
│  ├─ requirements.txt
│  ├─ run.py
│  └─ run_prod.py
├─ frontend/
│  └─ src/
│     ├─ api/ components/ hooks/ pages/ store/ types/ utils/
│     ├─ i18n/         # language packs and switching (locales/zh-CN.ts, en-US.ts)
│     └─ App.tsx
├─ build/ForeignTrade.spec
├─ start.bat / stop.bat / build.bat
└─ README.md / README.zh-CN.md
```

</details>

## Data and Backups

- In development, the database is at `backend/data/foreigntrade.db` and backups are at `backend/data/backups/`.
- Settings saved from the Settings page live in `backend/config.json`; a backup `.zip` contains the database and that file, which may include API keys — keep it secure.
- In a packaged build, the database, configuration, and backups live next to the executable.
- `.env`, `config.json`, databases, backups, and Excel data files are ignored by `.gitignore`.

## Roadmap

- [x] Company/contact management and Excel import/export
- [x] Email deduction and heuristic verification
- [x] Six-step AI outreach and template management
- [x] Follow-up reminders, dashboard, and backups
- [x] Chinese/English UI and extensible language packs
- [ ] SMTP sending
- [ ] Standalone manual email-verification UI
- [ ] More UI languages (Japanese, German, etc.)
- [ ] Bilingual backend error messages
- [ ] More automated tests and CI

## Notes

- **Single-user, local, no authentication**: do not expose the app directly to the public internet.
- **Email verification is heuristic**: catch-all domains, greylisting, port 25 blocks, and other factors can affect results; it cannot guarantee 100% accuracy.
- **No email sending in this version**: SMTP settings are reserved for a future release; copy generated outreach manually.
- **PostgreSQL**: the configuration branch exists, but `asyncpg` is not included in the dependencies; install it yourself if needed.
- **Data compliance**: ensure your lead sources are lawful and comply with privacy and anti-spam rules (GDPR, CAN-SPAM, etc.).

## Development and Testing

Backend tests (activate `backend/venv` first):

```bash
cd backend
python -m pytest
```

Frontend build:

```bash
cd frontend
npm run build
```

> API tests use the database configured by the app. Run `alembic upgrade head` first and avoid running them against production data.

## Build a Windows Executable

Requires Node.js and an existing `backend/venv`; PyInstaller is installed automatically on the first build.

```bat
build.bat
```

The output is in `dist/ForeignTrade/`. Double-click `run.bat`, then open <http://localhost:8000> (the backend serves the frontend).

> `build.bat` copies the current `backend/config.json` to `dist/ForeignTrade/config.json.example`. If it contains real API keys, clean it before distributing.

## Contributing

Issues and pull requests are welcome. Please run the backend tests and frontend build when possible, and describe the change and verification in the PR.

## License

[Apache License 2.0](LICENSE)

---

[简体中文](README.zh-CN.md) · English (primary)
