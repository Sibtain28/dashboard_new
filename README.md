# SteelAI

**AI-powered power plant analytics dashboard for Jindal Steel & Power**

SteelAI turns raw plant material-movement data into an interactive analytics dashboard and a conversational AI assistant. Ask questions in plain English — *"show the generation trend"*, *"compare all plants"*, *"which region performed best?"* — and get back live KPI figures, natural-language answers, and auto-generated charts.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Dashboard & Analytics](#dashboard--analytics)
  - [AI Chatbot](#ai-chatbot)
  - [Chat Sessions & History](#chat-sessions--history)
  - [Authentication](#authentication)
  - [UI/UX](#uiux)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [AI Chatbot Flow](#ai-chatbot-flow)
- [Docker Setup](#docker-setup)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Data Layer](#data-layer)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## Overview

SteelAI is a full-stack application built on top of SAP material-movement data for the **Raigarh**, **Angul**, and **DCPP** plants:

- A **React (Vite + Tailwind)** frontend
- A **Node.js / Express** REST API
- A **PostgreSQL** data layer
- An **Ollama**-powered AI chat assistant with natural-language dashboard queries and on-demand chart generation

The application and its backing services (frontend, backend, database) are containerized with Docker for consistent local development and deployment. **Ollama runs natively on the host machine** — outside of Docker — so it can take advantage of GPU acceleration (e.g. Apple Metal on macOS). See [Docker Setup](#docker-setup) for details.

---

## Features

### Dashboard & Analytics
- KPI cards for month-to-date (MTD) and yesterday generation figures
- Region, plant, city, and date-range filtering
- Chart types: line, bar, pie, histogram, pareto, gauge, waterfall, candlestick (Recharts + hand-built SVG for gauge/candlestick)
- Trend, comparison, and distribution analysis views
- Consistent large-number (kWh) formatting across cards, tooltips, and axes

### AI Chatbot
- Natural-language dashboard queries with automatic query-intent detection (dashboard question vs. general knowledge fallback via Ollama)
- Automatic chart generation — chart type and data inferred directly from the question
- Client-side chart-intent detection to show the right "Generating chart…" / "Thinking…" status
- Conversation memory, including plant/city context resolution across follow-up questions and name recall
- Natural-language date extraction ("today", "yesterday", explicit dates)
- Fuzzy plant-name matching: a two-pass matcher (exact longest-substring match, then a scored fuzzy fallback) resolves pronouns like "it" to the correct plant, avoiding collisions from generic tokens like "power"/"plant"
- Optional voice input (speech-to-text) and voice output (text-to-speech)
- Quick suggestion prompts to help users get started

### Chat Sessions & History
- Persistent, per-user chat history stored in PostgreSQL (`chat_sessions`, `chat_messages`)
- Sessions are created lazily — only once the user sends their first message, avoiding empty "draft" sessions
- Automatic session titling, generated asynchronously from the first meaningful prompt
- ChatGPT-style collapsible sidebar with a smooth open/close transition
- "New Chat" workflow that starts a local draft with no backend call until a message is sent
- Real-time session search by title
- Per-session delete with confirmation, falling back to the most recent remaining session

### Authentication
- Register/Login with JWT-based sessions
- Password hashing with bcrypt
- Google OAuth sign-in
- Secure token storage in `localStorage` or `sessionStorage` depending on "Remember Me"
- Jindal Steel–themed, glassmorphism login UI with an animated industrial background (blueprint grid, skyline, particles, fog, lighting)
- Inline form validation, password visibility toggle, and an authentication progress overlay
- Sidebar profile synced with the authenticated user

### UI/UX
- Dark mode theming via CSS custom properties, applied consistently across the app
- Landing page with a looping background video
- Dynamic, time-aware welcome greeting ("Good morning / afternoon / evening / Hello, {FirstName}") with a randomized secondary prompt, re-rolled on every new chat or page refresh
- Prompt suggestion chips in a responsive wrapping row directly above the message input, with hover lift and shadow effects
- Fade-in/staggered entrance animations for the welcome area
- Micro-interactions: hover and ripple effects, live date/time and system status indicators
- Fully responsive across desktop, tablet, and mobile

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React, Vite, Tailwind CSS, React Router, Recharts, Lucide icons |
| **Backend** | Node.js, Express.js, CORS, dotenv |
| **Database** | PostgreSQL (`pg` connection pooling, parameterized queries) |
| **AI / LLM** | Ollama (local LLM runtime, running natively on the host — e.g. `llama3.2`) |
| **Auth** | JWT, bcrypt, Google OAuth |
| **Containerization** | Docker & Docker Compose (frontend, backend, PostgreSQL) |

---

## Architecture

```
                    Host Machine
   ┌─────────────────────────────────────────────────────────────┐
   │                                                               │
   │   ┌───────────────────────── Docker ─────────────────────┐   │
   │   │                                                        │   │
   │   │  ┌─────────────────┐   REST API   ┌──────────────────┐│   │
   │   │  │ React Frontend   │ ───────────▶ │ Express Backend  ││   │
   │   │  │ (Vite + Tailwind)│ ◀─────────── │ (Node.js)        ││   │
   │   │  └─────────────────┘               └────────┬─────────┘│   │
   │   │                                              │          │   │
   │   │                                     ┌────────▼────────┐ │   │
   │   │                                     │  PostgreSQL      │ │   │
   │   │                                     │  (dashboard +    │ │   │
   │   │                                     │  auth + chat)    │ │   │
   │   │                                     └──────────────────┘ │   │
   │   └────────────────────────┬───────────────────────────────┘   │
   │                            │  http://host.docker.internal:11434│
   │                            ▼                                    │
   │                  ┌───────────────────┐                          │
   │                  │  Ollama (native)   │  ◀── GPU-accelerated     │
   │                  │  runs on host, NOT │      (Apple Metal on     │
   │                  │  inside Docker     │       macOS, etc.)       │
   │                  └───────────────────┘                          │
   │                                                                 │
   └─────────────────────────────────────────────────────────────┘
```

The frontend, backend, and PostgreSQL database all run inside Docker containers. Ollama runs directly on the host OS so it can access native GPU acceleration, and the backend container reaches it over `host.docker.internal`.

---

## AI Chatbot Flow

Every chatbot message follows this pipeline:

1. **User query** — the user types (or speaks) a question in the chat UI.
2. **Intent detection** — the backend classifies the query as either a *dashboard question* (asking about plant/generation data) or a *general knowledge* question.
3. **PostgreSQL retrieval** — for dashboard questions, the backend resolves plant/city/date context (using conversation history and fuzzy plant-name matching) and queries PostgreSQL for the relevant KPI/time-series data.
4. **Ollama** — the retrieved data (or the raw query, for general questions) is sent to the locally running Ollama model, which generates a natural-language response and/or determines the appropriate chart type.
5. **Response / chart** — the backend returns the natural-language answer together with structured chart data; the frontend renders the response and, when applicable, an auto-generated chart (line, bar, pie, histogram, pareto, gauge, waterfall, or candlestick).

```
User query
   │
   ▼
Intent detection (dashboard vs. general)
   │
   ├── dashboard question ──▶ PostgreSQL retrieval (plant/date/context resolution)
   │                                   │
   │                                   ▼
   └── general question ─────────▶ Ollama (native, host GPU)
                                        │
                                        ▼
                              Response text + chart data
                                        │
                                        ▼
                              Frontend renders answer/chart
```

---

## Docker Setup

### What Docker runs
Docker Compose manages three services:
- **frontend** — the React/Vite app
- **backend** — the Express API server
- **postgres** — the PostgreSQL database

### Why Ollama is kept outside Docker
Ollama is intentionally **not** containerized in this project. Running it natively on the host allows it to use GPU acceleration directly:
- **Apple Metal** on macOS (Apple Silicon)
- CUDA/other native GPU backends on Linux/Windows, where available

Running Ollama inside a Docker container on macOS would lose access to Metal GPU acceleration (Docker Desktop on macOS does not pass through the GPU), resulting in much slower inference. Keeping Ollama on the host avoids this bottleneck.

### Requirement: install Ollama separately
Because Ollama runs outside Docker, **each user must install and run Ollama on their own host machine** before starting the containerized app. The backend container connects to it via:

```
OLLAMA_URL=http://host.docker.internal:11434
```

`host.docker.internal` is a special DNS name Docker provides so containers can reach services running on the host machine. This works out of the box on Docker Desktop (macOS/Windows). On native Linux Docker, you may need to add the following to the backend service in `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

---

## Project Structure

```
steelai/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ChatbotPage.jsx      # Main chat UI, sessions, charts
│   │   │   ├── JindalAuth.jsx       # Login / Signup screen
│   │   │   └── ...
│   │   ├── components/
│   │   │   └── MainLayout.jsx       # Shared layout, branding, navigation
│   │   ├── index.css                # Theme variables (dark/light mode)
│   │   └── ...
│   ├── Dockerfile
│   └── vite.config.js
├── backend/
│   ├── routes/
│   │   ├── chat.js                  # /api/chat, session endpoints
│   │   ├── dashboard.js             # /api/dashboard data + filters
│   │   ├── auth.js                  # login/register/OAuth
│   │   └── ping.js                  # /api/ping health check
│   ├── db/                          # PostgreSQL pool + schema
│   ├── Dockerfile
│   └── server.js
├── docker-compose.yml
└── README.md
```

> Adjust paths above to match your actual repo layout if it differs.

---

## Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose
- [Ollama](https://ollama.com) installed and running **natively on the host** (not in Docker)
- Node.js (LTS recommended) — only needed if you want to run frontend/backend outside Docker for local development

### 1. Clone the repository
```bash
git clone <repo-url>
cd steelai
```

### 2. Install Ollama and pull a model
Install Ollama on your host machine (see [ollama.com](https://ollama.com)), then pull the model used by the chatbot:
```bash
ollama pull llama3.2
```
Confirm Ollama is running and reachable:
```bash
ollama serve
curl http://localhost:11434
```

### 3. Configure environment variables
Create a `.env` file in `backend/` (see [Environment Variables](#environment-variables)) and a `.env` in `frontend/` with:
```
VITE_API_URL=http://localhost:3001
```

Key backend variable for AI connectivity:
```
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2
```

### 4. Set up PostgreSQL
If running via Docker Compose, the `postgres` service will start automatically with the configuration in `docker-compose.yml`. Run your migration/schema scripts (against the container or a local `psql` client) to create the `users`, `chat_sessions`, and `chat_messages` tables, and load plant/city reference data:
```bash
docker compose exec postgres psql -U <user> -d <database> -f /path/to/schema.sql
```

### 5. Run the app with Docker
```bash
docker compose up --build
```
This starts the frontend, backend, and PostgreSQL containers. Make sure Ollama is already running on the host before starting the backend, since the backend depends on it for chatbot responses.

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### (Optional) Run without Docker for local development
```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd ../frontend
npm install
npm run dev
```
In this mode, set `OLLAMA_URL=http://localhost:11434` in `backend/.env` instead of using `host.docker.internal` (that hostname only resolves inside Docker containers).

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Backend server port (default `3001`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign JWT tokens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `OLLAMA_URL` | Ollama server URL — `http://host.docker.internal:11434` when the backend runs in Docker, or `http://localhost:11434` when running the backend directly on the host |
| `OLLAMA_MODEL` | Model name used for chat (e.g. `llama3.2`) |
| `VITE_API_URL` | (frontend) Base URL of the backend API |

---

## Data Layer

Dashboard data, authentication, and chat history all live in a single **PostgreSQL** database, accessed via parameterized queries and connection pooling (`pg`). Plant and city names are cached from the database at startup and used for both dashboard filters and the chatbot's fuzzy plant-name matching.

---

## Troubleshooting

**Backend can't reach Ollama (`ECONNREFUSED` or timeout on chat requests)**
- Confirm Ollama is running on the host: `ollama serve` (or check it's already running as a background service).
- Confirm the model is pulled: `ollama list` should show `llama3.2`.
- If the backend runs in Docker, confirm `OLLAMA_URL` is set to `http://host.docker.internal:11434`, not `localhost`. Inside a container, `localhost` refers to the container itself, not the host.
- On native Linux Docker, `host.docker.internal` may not resolve by default — add the `extra_hosts` entry shown in [Docker Setup](#docker-setup) to `docker-compose.yml`.

**Slow chatbot responses / no GPU acceleration**
- Verify Ollama is running natively on the host and not inside a container — GPU passthrough (e.g. Apple Metal) is unavailable to Dockerized Ollama on macOS.
- Check Ollama's logs/output to confirm it detected the GPU.

**Frontend can't reach the backend**
- Confirm `VITE_API_URL` in `frontend/.env` matches the backend's actual host/port.
- If both are in Docker, ensure they're on the same Docker network (handled automatically by `docker-compose.yml`).

**Database connection errors**
- Confirm the `postgres` container is healthy: `docker compose ps`.
- Verify `DATABASE_URL` in `backend/.env` matches the credentials/port defined in `docker-compose.yml`.
- If schema tables are missing, re-run the migration/schema script described in [Getting Started](#getting-started).

**Port conflicts**
- If `5173`, `3001`, or `5432` are already in use on your machine, update the relevant port mappings in `docker-compose.yml` and the corresponding `.env` files.

---

## Roadmap

- Expand AI provider support beyond Ollama as configurable backends
- Further UI/UX polish across dashboard pages to match the chat screen's modern styling
- Additional chart types and deeper cross-plant comparison tooling
- Optional GPU-passthrough support for Dockerized Ollama on Linux hosts

---

*This README documents the current architecture of the SteelAI project: containerized frontend/backend/database with a natively hosted, GPU-accelerated Ollama instance.*