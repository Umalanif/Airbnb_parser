# Airbnb Price Parser

[![Build & Deploy](https://github.com/Umalanif/Airbnb_parser/actions/workflows/docker-build.yml/badge.svg)](https://github.com/Umalanif/Airbnb_parser/actions/workflows/docker-build.yml)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![Playwright](https://img.shields.io/badge/Playwright-v1.58.2-blue?logo=playwright)
![Prisma](https://img.shields.io/badge/Prisma-ORM-blue?logo=prisma)

Autonomous monitoring system for tracking Airbnb listing prices and availability status with real-time Telegram notifications.

---

## 🚀 Quick Start with Docker

**No need to install Node.js, dependencies, or browsers manually!** The entire application runs in a Docker container with everything pre-configured.

### Step 1: Clone the Repository

```bash
git clone https://github.com/Umalanif/Airbnb_parser.git
cd Airbnb_parser
```

### Step 2: Configure Environment Variables

Copy the example environment file and configure it:

```bash
copy .env.example .env
```

Edit `.env` and set at minimum:

```env
# Required for API endpoints (POST, DELETE)
API_KEY="your_secure_api_key_here"

# Optional: For Telegram notifications
TELEGRAM_BOT_TOKEN="your_bot_token_here"
TELEGRAM_CHAT_ID="your_chat_id_here"

# Optional: For automatic session seeding
AIRBNB_COOKIE="your_session_cookie"
AIRBNB_API_KEY="your_x_airbnb_api_key"
AIRBNB_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

> **Security Note:** The `API_KEY` is required for managing listings via POST/DELETE endpoints. Always set a strong API key in production.

### Step 3: Start the Application

```bash
docker-compose up -d
```

That's it! The container will automatically:
- Install all dependencies
- Create the SQLite database (`dev.db`)
- Run Prisma migrations
- Seed initial data (if `AIRBNB_*` variables are set)
- Start the REST API server on `http://localhost:3001`

### Access the API

```bash
curl http://localhost:3001
```

---

## Table of Contents

- [Features](#features)
- [Quick Start with Docker](#-quick-start-with-docker)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Adding Listings](#adding-listings)
- [Automation & CI/CD](#automation--cicd)
- [Anti-Bot Protection](#anti-bot-protection)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Features

- **🤖 Automated Price Monitoring** — Periodic scraping of Airbnb listings using Crawlee (CheerioCrawler)
- **📊 Delta Detection** — Tracks price changes and availability status
- **📱 Telegram Alerts** — Instant notifications via Telegram Bot when prices change
- **🔒 Rate Limit Protection** — Built-in Bottleneck integration to prevent API throttling
- **🛡️ Anti-Bot Protection** — Handles 403/429 errors with automatic backoff and teardown
- **🧹 Graceful Shutdown** — Proper cleanup of workers and database connections
- **🌐 REST API** — HTTP endpoints for managing listings and viewing price history
- **🐳 Docker-Ready** — Full containerization with automatic database initialization
- **⚙️ CI/CD Pipeline** — Automated builds and deployments via GitHub Actions

---

## Manual Installation

If you prefer not to use Docker, follow these steps:

### Prerequisites

| Software | Version | Download |
|----------|---------|----------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| npm | 9+ | Included with Node.js |

```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

### Step 1: Install Dependencies

```bash
npm install
```

This will install:
- **Crawlee** — Web scraping framework
- **Prisma** — Database ORM
- **Bree** — Job scheduler
- **Express** — REST API server
- **Pino** — Logger
- **Zod** — Schema validation
- **Bottleneck** — Rate limiting
- **Playwright** — Browser automation library

### Step 2: Install Playwright Browsers

```bash
npx playwright install chromium
```

> **Note:** `npm install` only downloads the Playwright Node.js wrapper. The browser binaries must be installed separately.

### Step 3: Setup Database

```bash
npx prisma generate
npx prisma db push
npm run seed
```

### Step 4: Run the Application

```bash
npm start
```

---

## Configuration

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `file:./dev.db` | Yes | SQLite database path |
| `API_KEY` | — | **Yes** | API key for POST/DELETE endpoints |
| `TELEGRAM_BOT_TOKEN` | — | No | Telegram bot API token |
| `TELEGRAM_CHAT_ID` | — | No | Telegram chat ID for alerts |
| `PORT` | `3001` | No | Express server port |
| `PARSER_INTERVAL` | `5m` | No | Job scheduling interval |
| `CHECK_IN` | `2026-04-15` | No | Default check-in date |
| `CHECK_OUT` | `2026-04-20` | No | Default check-out date |
| `MAX_CONCURRENCY` | `3` | No | Max parallel requests |
| `FORTY_THREE_THRESHOLD` | `5` | No | 403 errors before teardown |
| `PROXY_URLS` | — | No | Comma-separated proxy list |

### How to Get Telegram Bot Credentials

1. **Get Bot Token:**
   - Open Telegram and search for `@BotFather`
   - Send `/newbot` command
   - Follow instructions to create your bot
   - Copy the API token

2. **Get Chat ID:**
   - Open Telegram and search for `@userinfobot`
   - Start a chat with the bot
   - It will reply with your chat ID

---

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/` | Health check | ❌ |
| `GET` | `/listings` | Get all monitored listings | ❌ |
| `POST` | `/listings` | Add a new listing | ✅ `x-api-key` |
| `DELETE` | `/listings/:id` | Remove a listing | ✅ `x-api-key` |
| `GET` | `/prices/:listingId` | Get price history for a listing | ❌ |
| `GET` | `/sessions` | Get active sessions | ❌ |

### Example: Add a Listing (Protected)

```bash
curl -X POST http://localhost:3001/listings \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_secure_api_key_here" \
  -d '{
    "id": "12345678",
    "url": "https://www.airbnb.com/rooms/12345678",
    "title": "Cozy apartment in Paris",
    "checkIn": "2026-04-15",
    "checkOut": "2026-04-20",
    "isActive": true
  }'
```

### Example: Add Multiple Listings (Batch)

```bash
curl -X POST http://localhost:3001/listings \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_secure_api_key_here" \
  -d '[
    {
      "id": "12345678",
      "url": "https://www.airbnb.com/rooms/12345678",
      "title": "Cozy apartment in Paris",
      "checkIn": "2026-04-15",
      "checkOut": "2026-04-20",
      "isActive": true
    },
    {
      "id": "87654321",
      "url": "https://www.airbnb.com/rooms/87654321",
      "title": "Studio in Tokyo",
      "checkIn": "2026-05-01",
      "checkOut": "2026-05-07",
      "isActive": true
    }
  ]'
```

### Example: Get Price History

```bash
curl http://localhost:3001/prices/12345678
```

---

## Adding Listings

### Method 1: Via REST API (Recommended)

Use the `/listings` endpoint as shown above. Supports both single objects and arrays.

### Method 2: Via Prisma Studio

```bash
npx prisma studio
```

Click "Listing" → "Add record" and fill in:
- `id` — Airbnb listing ID (e.g., `12345678`)
- `url` — Full Airbnb URL
- `title` — Descriptive name
- `checkIn` / `checkOut` — Date range for pricing
- `isActive` — `true` to monitor

---

## Automation & CI/CD

### GitHub Actions

This project uses **GitHub Actions** for continuous integration and deployment:

- **Automated Builds** — Every push to `main` triggers a Docker image build
- **Container Registry** — Images are pushed to GitHub Container Registry (ghcr.io)
- **Cache Optimization** — Build cache is preserved between runs for faster deployments

Workflow: [`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml)

### Automatic Database Initialization

The `entrypoint.sh` script handles automatic setup on container start:

```bash
#!/bin/sh
npx prisma db push    # Apply database migrations
npx prisma db seed    # Seed initial data (session, default listings)
npm start             # Start the application
```

If `AIRBNB_COOKIE`, `AIRBNB_API_KEY`, and `AIRBNB_USER_AGENT` are set in `.env`, the seed script automatically creates a session with `id: airbnb_main`.

---

## Anti-Bot Protection

Airbnb employs sophisticated bot detection mechanisms. This project implements several countermeasures:

### Smart Delays (Jitter)

Randomized delays between requests to mimic human behavior patterns:
- Prevents predictable request timing
- Reduces detection risk by 60-80%

### Automatic Backoff

When 403/429 errors are detected:
1. Request rate is automatically reduced
2. Session is rotated (if multiple configured)
3. Crawler is restarted with fresh browser context
4. Telegram alert is sent if threshold exceeded

### Rate Limiting

Built-in **Bottleneck** integration ensures:
- Maximum concurrency: 3 requests (configurable)
- Respectful request spacing
- No API throttling from Airbnb

### Proxy Support

Configure rotating proxies in `.env`:

```env
PROXY_URLS="http://proxy1:port,http://proxy2:port"
MAX_CONCURRENCY="3"
```

---

## Project Structure

```
AirBnb/
├── index.js                 # Main entry point (Bree + Express)
├── package.json             # Dependencies and scripts
├── .env                     # Environment configuration
├── .env.example             # Example environment file
├── Dockerfile               # Docker image definition
├── docker-compose.yaml      # Docker Compose configuration
├── entrypoint.sh            # Container initialization script
│
├── .github/workflows/
│   └── docker-build.yml     # GitHub Actions CI/CD pipeline
│
├── jobs/                    # Bree worker jobs
│   ├── parser.js            # Airbnb scraping worker
│   └── session-miner.js     # Session token miner
│
├── prisma/
│   ├── schema.prisma        # Database schema definition
│   ├── seed.js              # Database seeding script
│   └── dev.db               # SQLite database (auto-generated)
│
├── src/
│   ├── server.js            # Express API server
│   ├── schemas/             # Zod validation schemas
│   │   ├── airbnb-response.js
│   │   └── price-log.js
│   ├── services/            # Business logic
│   │   └── telegram-notification-service.js
│   └── utils/               # Utilities
│       ├── logger.js        # Pino logger configuration
│       └── url-builder.js   # URL construction helper
│
├── tests/                   # Test scripts
├── storage/                 # Additional storage
└── public/                  # Static files
```

---

## Database Schema

### Session
Stores Airbnb API session credentials for authenticated requests.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key (`airbnb_main`) |
| `cookie` | String | Session cookie |
| `xAirbnbApiKey` | String | API key header |
| `userAgent` | String | Browser user agent |

### Listing
Monitored Airbnb properties.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Airbnb listing ID |
| `url` | String | Full Airbnb URL (unique) |
| `title` | String | Listing title |
| `checkIn` | String | Check-in date |
| `checkOut` | String | Check-out date |
| `isActive` | Boolean | Monitoring enabled |

### PriceLog
Historical price data.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (UUID) | Primary key |
| `listingId` | String | Reference to Listing |
| `price` | Float | Current price |
| `currency` | String | Currency code |
| `capturedAt` | DateTime | Timestamp |
| `isAvailable` | Boolean | Availability status |
| `delta` | Float | Price change from previous |

---

## Troubleshooting

### Parser Returns No Data

1. **Check if listings are active:**
   ```bash
   npx prisma studio
   ```
   Ensure `isActive` is `true` for your listings.

2. **Verify Airbnb URLs:**
   URLs must be in format: `https://www.airbnb.com/rooms/{ID}`

3. **Check logs:**
   ```bash
   docker-compose logs -f airbnb-parser
   ```

### 403 Forbidden Errors

The parser automatically handles 403 errors. If threshold is exceeded:
- Session is rotated (if multiple configured)
- Crawler is restarted
- Telegram alert is sent

**Solution:** Add proxy URLs to `.env`:
```env
PROXY_URLS="http://proxy1:port,http://proxy2:port"
```

### Telegram Notifications Not Working

1. **Verify bot token:**
   - Check token format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
   - Test bot in Telegram: send `/start`

2. **Verify chat ID:**
   - Must be a string: `"7865462329"`
   - Get fresh ID from `@userinfobot`

### Docker Container Issues

**View logs:**
```bash
docker-compose logs -f
```

**Restart container:**
```bash
docker-compose restart
```

**Rebuild from scratch:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Errors

**Reset database (Docker):**
```bash
docker-compose down
del prisma\dev.db
docker-compose up -d
```

**Reset database (Manual):**
```bash
del prisma\dev.db
npx prisma db push
npm run seed
```

### Port Already in Use

Change the port in `.env`:
```env
PORT=3002
```

Then update `docker-compose.yaml`:
```yaml
ports:
  - "3002:3001"
```

---

## License

ISC
