# SteelAI

**AI-powered power plant analytics dashboard for Jindal Steel & Power**

SteelAI (originally prototyped as *ThinkAI*) turns raw plant material-movement data into an interactive analytics dashboard and a conversational AI assistant. Ask questions in plain English — *"show the generation trend"*, *"compare all plants"*, *"which region performed best?"* — and get back live KPI figures, natural-language answers, and auto-generated charts.

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
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Data Layer](#data-layer)
- [Roadmap](#roadmap)

---

## Overview

SteelAI began as a single-file HTML/Chart.js dashboard built on SAP material-movement CSV exports for the **Raigarh**, **Angul**, and **DCPP** plants. It has since grown into a full-stack application:

- A **React (Vite + Tailwind)** frontend
- A **Node.js / Express** REST API
- A **PostgreSQL** data layer
- An **Ollama**-powered AI chat assistant with natural-language dashboard queries and on-demand chart generation

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
| **AI / LLM** | Ollama (local LLM), with Anthropic and xAI Grok evaluated as alternative providers |
| **Auth** | JWT, bcrypt, Google OAuth |

> **Note:** Earlier iterations used MongoDB Atlas (via Mongoose) for authentication and CSV files for dashboard data. Both have since been consolidated into PostgreSQL — see [Data Layer](#data-layer).

---

## Architecture

```
┌─────────────────────┐        REST API        ┌──────────────────────┐
│   React Frontend     │ ──────────────────────▶ │  Express Backend      │
│  (Vite + Tailwind)   │ ◀────────────────────── │  (Node.js)            │
└─────────────────────┘                          └──────────┬───────────┘
                                                              │
                                    ┌─────────────────────────┼─────────────────────────┐
                                    ▼                         ▼                         ▼
                            ┌───────────────┐        ┌────────────────┐        ┌────────────────┐
                            │  PostgreSQL    │        │  Ollama (LLM)   │        │  Google OAuth   │
                            │  (dashboard +  │        │  chat engine    │        │  provider       │
                            │  auth + chat)  │        └────────────────┘        └────────────────┘
                            └───────────────┘
```

Frontend runs on Vite's dev server; backend runs on `localhost:3001` by default (configurable via `VITE_API_URL`).

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
│   └── vite.config.js
├── backend/
│   ├── routes/
│   │   ├── chat.js                  # /api/chat, session endpoints
│   │   ├── dashboard.js             # /api/dashboard data + filters
│   │   ├── auth.js                  # login/register/OAuth
│   │   └── ping.js                  # /api/ping health check
│   ├── db/                          # PostgreSQL pool + schema
│   └── server.js
└── README.md
```

> Adjust paths above to match your actual repo layout if it differs.

---

## Getting Started

### Prerequisites
- Node.js (LTS recommended)
- PostgreSQL instance
- [Ollama](https://ollama.com) installed and running locally, with a model pulled (e.g. `ollama pull llama3.2`)

### 1. Clone & install
```bash
git clone <repo-url>
cd steelai

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment variables
Create a `.env` file in `backend/` (see [Environment Variables](#environment-variables)) and a `.env` in `frontend/` with:
```
VITE_API_URL=http://localhost:3001
```

### 3. Set up the database
Run your PostgreSQL migration/schema scripts to create the `users`, `chat_sessions`, and `chat_messages` tables, and load plant/city reference data.

### 4. Run the app
```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` (Vite default) and the backend API at `http://localhost:3001`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Backend server port (default `3001`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign JWT tokens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `OLLAMA_HOST` | Ollama server URL (default `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model name used for chat (e.g. `llama3.2`) |
| `VITE_API_URL` | (frontend) Base URL of the backend API |

---

## Data Layer

The project's data layer evolved through three stages:

1. **CSV prototype** — SAP material-movement CSV exports parsed directly by a single-file HTML/Chart.js dashboard.
2. **Dual-database backend** — PostgreSQL for dashboard/business data, MongoDB Atlas (via Mongoose) for authentication.
3. **PostgreSQL consolidation** *(current)* — CSV loading and MongoDB dependencies removed; dashboard data, authentication, and chat history all live in PostgreSQL with parameterized queries and connection pooling.

Plant and city names are cached from the database at startup and used for both dashboard filters and the chatbot's fuzzy plant-name matching.

---

## Roadmap

- Expand AI provider support beyond Ollama (Anthropic, xAI Grok) as configurable backends
- Further UI/UX polish across dashboard pages to match the chat screen's modern styling
- Additional chart types and deeper cross-plant comparison tooling

---

*This README consolidates features documented across the project's Power Dashboard, Jindal Steel, AI Dashboard, and SteelAI feature logs.*
