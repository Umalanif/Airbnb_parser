# Airbnb Price Parser

Autonomous monitoring system for tracking Airbnb listing prices and availability status with real-time Telegram notifications.

## Features

- **Automated Price Monitoring** — Periodic scraping of Airbnb listings using Crawlee (CheerioCrawler)
- **Delta Detection** — Tracks price changes and availability status
- **Telegram Alerts** — Instant notifications via Telegram Bot when prices change
- **Rate Limit Protection** — Built-in Bottleneck integration to prevent API throttling
- **Graceful Shutdown** — Proper cleanup of workers and database connections
- **Anti-Bot Protection** — Handles 403/429 errors with automatic backoff and teardown
- **REST API** — HTTP endpoints for managing listings and viewing price history

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Adding Listings](#adding-listings)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Software | Version | Download |
|----------|---------|----------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| npm | 9+ | Included with Node.js |

### Verify Installation

```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

---

## Installation

### Step 1: Clone or Download the Project

Navigate to the project directory:

```bash
cd C:\Users\Администратор\Study\AirBnb
```

### Step 2: Install Dependencies

Install all required npm packages:

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

---

## Configuration

### Step 1: Create Environment File

The project uses a `.env` file for configuration. If it doesn't exist, create one:

```bash
# Copy example (if .env.example exists)
copy .env.example .env
```

### Step 2: Configure Environment Variables

Edit the `.env` file with your settings:

```env
# Database configuration
DATABASE_URL="file:./dev.db"

# Telegram Bot credentials (required for notifications)
# Get token from @BotFather on Telegram
# Get chat ID from @userinfobot on Telegram
TELEGRAM_BOT_TOKEN="your_bot_token_here"
TELEGRAM_CHAT_ID="your_chat_id_here"

# Server port
PORT=3001

# Parser scheduling
# Supports cron syntax or human-readable intervals (e.g., 5m, 1h, 30s)
PARSER_INTERVAL="5m"

# Default check-in/check-out dates for price queries
CHECK_IN="2026-04-15"
CHECK_OUT="2026-04-20"

# Optional: Proxy configuration for scraping
# Comma-separated list of proxy URLs
PROXY_URLS="http://proxy1:port,http://proxy2:port"

# Optional: Concurrency settings
MAX_CONCURRENCY="3"

# Optional: 403 error threshold before crawler teardown
FORTY_THREE_THRESHOLD="5"
```

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

## Database Setup

### Step 1: Generate Prisma Client

Generate the Prisma client based on your schema:

```bash
npx prisma generate
```

### Step 2: Initialize the Database

Create the SQLite database and tables:

```bash
npx prisma db push
```

This command:
- Creates `dev.db` SQLite database in the `prisma/` folder
- Creates tables: `Session`, `Listing`, `PriceLog`

### (Optional) View Database

Use Prisma Studio to browse and edit data visually:

```bash
npx prisma studio
```

---

## Running the Application

### Start the Full Application (Recommended)

Starts the job scheduler + REST API server:

```bash
npm start
```

The application will:
1. Start the Bree job scheduler
2. Run the parser every 5 minutes (configurable via `PARSER_INTERVAL`)
3. Start Express API server on port 3001

**Access the API:** `http://localhost:3001`

### Run Parser Manually

Execute the parser job once (useful for testing):

```bash
npm run parser
```

### View Logs with Pretty Print

```bash
node index.js | npx pino-pretty
```

---

## API Endpoints

The application exposes a REST API for managing listings and viewing data.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/listings` | Get all monitored listings |
| `POST` | `/listings` | Add a new listing |
| `DELETE` | `/listings/:id` | Remove a listing |
| `GET` | `/prices/:listingId` | Get price history for a listing |
| `GET` | `/sessions` | Get active sessions |

### Example: Add a Listing via API

```bash
curl -X POST http://localhost:3001/listings \
  -H "Content-Type: application/json" \
  -d '{
    "id": "12345678",
    "url": "https://www.airbnb.com/rooms/12345678",
    "title": "Cozy apartment in Paris",
    "checkIn": "2026-04-15",
    "checkOut": "2026-04-20",
    "isActive": true
  }'
```

### Example: Get Price History

```bash
curl http://localhost:3001/prices/12345678
```

---

## Adding Listings

### Method 1: Via REST API (Recommended)

Use the `/listings` endpoint as shown above.

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

### Method 3: Programmatically

Create a script using Prisma:

```javascript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

await prisma.listing.create({
  data: {
    id: '12345678',
    url: 'https://www.airbnb.com/rooms/12345678',
    title: 'Cozy apartment in Paris',
    checkIn: '2026-04-15',
    checkOut: '2026-04-20',
    isActive: true,
  },
});
```

---

## Project Structure

```
AirBnb/
├── index.js                 # Main entry point (Bree orchestrator + Express)
├── package.json             # Dependencies and scripts
├── .env                     # Environment configuration (not committed)
├── .env.example             # Example environment file
│
├── jobs/                    # Bree worker jobs
│   ├── parser.js            # Airbnb scraping worker
│   └── session-miner.js     # Session token miner
│
├── prisma/
│   ├── schema.prisma        # Database schema definition
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
├── storage/                 # Additional storage (if needed)
└── public/                  # Static files
```

---

## Database Schema

### Session
Stores Airbnb API session credentials for authenticated requests.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
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

3. **Check logs for errors:**
   ```bash
   npm start | npx pino-pretty
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

3. **Test notification:**
   ```bash
   # Add a test script or check logs for notification errors
   ```

### Database Errors

**Reset database:**
```bash
# Delete existing database
del prisma\dev.db

# Re-create
npx prisma db push
```

### Port Already in Use

Change the port in `.env`:
```env
PORT=3002
```

---

## Configuration Reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `file:./dev.db` | Yes | SQLite database path |
| `TELEGRAM_BOT_TOKEN` | — | No* | Telegram bot API token |
| `TELEGRAM_CHAT_ID` | — | No* | Telegram chat ID for alerts |
| `PORT` | `3000` | No | Express server port |
| `PARSER_INTERVAL` | `5m` | No | Job scheduling interval |
| `CHECK_IN` | `2026-04-15` | No | Default check-in date |
| `CHECK_OUT` | `2026-04-20` | No | Default check-out date |
| `MAX_CONCURRENCY` | `3` | No | Max parallel requests |
| `FORTY_THREE_THRESHOLD` | `5` | No | 403 errors before teardown |
| `PROXY_URLS` | — | No | Comma-separated proxy list |

*Required for Telegram notifications

---

## License

ISC
