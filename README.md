# Price Drop & Restock Tracker

A full-stack system to track product prices, detect price drops or restocks, and trigger instant alerts (Telegram / Push) alongside a Manifest V3 browser extension.

## Monorepo Layout

```
/
├── extension/   # Chrome MV3 extension (Vite + TypeScript)
└── backend/     # Node.js + TypeScript API + Scraper + Telegram alerts
```

## Setup & Quick Start

### 1. Database (Supabase / Postgres)
1. Create a Supabase project (or local PostgreSQL instance).
2. In the Supabase SQL Editor, run `backend/migrations/001_initial.sql`.

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
# Update .env with your DATABASE_URL, API_KEY, and TELEGRAM bot credentials
npm install
npm run build
npm run dev # or npm start
```

### 3. Telegram Bot Setup
1. Message **@BotFather** on Telegram: send `/newbot` and follow instructions.
2. Copy the bot token into `TELEGRAM_BOT_TOKEN` in `backend/.env`.
3. Send any message to your new bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` to get your `chat_id`.
4. Set `TELEGRAM_CHAT_ID` in `backend/.env`.

### 4. Extension Setup
```bash
cd extension
npm install
npm run build
```
Load unpacked extension from `extension/dist` in `chrome://extensions`.

## API Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/track` | `X-Api-Key` | Add a URL + selector to track |
| `GET` | `/items` | `X-Api-Key` | List tracked items with latest prices |
| `GET` | `/items/:id/history` | `X-Api-Key` | Retrieve price history series |
| `DELETE` | `/items/:id` | `X-Api-Key` | Stop tracking an item |
| `POST` | `/scrape/fanout` | `X-Internal-Key` | Fan-out scrape jobs across tracked items |
| `POST` | `/scrape/work` | `X-Internal-Key` | Scrape a single item by ID |
| `GET` | `/health` | None | Health check |
