# Airbnb Price Parser

Autonomous monitoring system for tracking Airbnb listing prices and availability status with real-time Telegram notifications.

## 📋 Features

- **Automated Price Monitoring** — Periodic scraping of Airbnb listings using Crawlee (CheerioCrawler)
- **Delta Detection** — Tracks price changes and availability status
- **Telegram Alerts** — Instant notifications via Telegram Bot when prices change
- **Rate Limit Protection** — Built-in Bottleneck integration to prevent API throttling
- **Graceful Shutdown** — Proper cleanup of workers and database connections
- **Anti-Bot Protection** — Handles 403/429 errors with automatic backoff and teardown

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (ES Modules) |
| Orchestrator | Bree.js |
| Web Scraping | Crawlee (CheerioCrawler) |
| Database | SQLite + Prisma ORM |
| Validation | Zod |
| Logging | Pino |
| Notifications | Telegram Bot API + Bottleneck |

## 📦 Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup Steps

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env` and configure:
   ```bash
   # Database
   DATABASE_URL="file:./dev.db"

   # Telegram Bot (get token from @BotFather, chat ID from @userinfobot)
   TELEGRAM_BOT_TOKEN="your_bot_token"
   TELEGRAM_CHAT_ID="your_chat_id"

   # Parser settings
   PARSER_INTERVAL="5m"           # How often to run the parser
   CHECK_IN="2026-04-15"          # Check-in date for price queries
   CHECK_OUT="2026-04-20"         # Check-out date for price queries

   # Optional: Proxy configuration
   PROXY_URLS="http://proxy1:port,http://proxy2:port"

   # Optional: Concurrency settings
   MAX_CONCURRENCY="3"

   # Optional: 403 error threshold before teardown
   FORTY_THREE_THRESHOLD="5"
   ```

3. **Initialize the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

## 🚀 Usage

### Start the Application

```bash
npm start
```

This starts the Bree orchestrator which runs the parser job at the configured interval.

### Run Parser Manually

```bash
npm run parser
```

### Test Telegram Notifications

```bash
npm run test:notification
```

### Test Orchestrator

```bash
npm run test:orchestrator
```

## 📁 Project Structure

```
AirBnb/
├── index.js                 # Main orchestrator (Bree.js entry point)
├── jobs/
│   ├── parser.js            # Worker job for scraping Airbnb
│   └── session-miner.js     # Session mining utility
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── dev.db               # SQLite database (not committed)
├── src/
│   ├── schemas/             # Zod validation schemas
│   ├── services/            # Business logic (Telegram notifications)
│   └── utils/               # Utilities (logger, URL builder)
├── tests/                   # Test scripts
├── utils/                   # Additional utilities
├── storage/                 # SQLite database storage
└── .env                     # Environment configuration
```

## 🗄️ Database Schema

### Session
Stores Airbnb API session credentials (cookie, API key, user-agent).

### Listing
- `id` — Unique listing identifier
- `url` — Airbnb listing URL (unique)
- `title` — Listing title
- `isActive` — Whether to monitor this listing

### PriceLog
- `id` — UUID primary key
- `listingId` — Reference to Listing
- `price` — Current price
- `currency` — Currency code (EUR, USD, etc.)
- `capturedAt` — Timestamp of data capture
- `isAvailable` — Availability status
- `delta` — Price change from previous reading

## 📝 Adding Listings

To add listings to monitor, insert records into the database:

```javascript
// Example: Add a listing via Prisma
const prisma = new PrismaClient();

await prisma.listing.create({
  data: {
    id: '12345678',  // Airbnb listing ID
    url: 'https://www.airbnb.com/rooms/12345678',
    title: 'Cozy apartment in Paris',
    isActive: true,
  },
});
```

## 🔧 Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `PARSER_INTERVAL` | `5m` | Cron interval for parser job |
| `CHECK_IN` | `2026-04-15` | Check-in date for price queries |
| `CHECK_OUT` | `2026-04-20` | Check-out date for price queries |
| `MAX_CONCURRENCY` | `3` | Maximum concurrent requests |
| `FORTY_THREE_THRESHOLD` | `5` | 403 errors before teardown |
| `PROXY_URLS` | — | Comma-separated proxy URLs |

## 🚨 Error Handling

- **403 Forbidden** — Tracked with counter; after threshold, crawler teardown and system alert
- **429 Too Many Requests** — Automatic 5-second backoff
- **Network Errors** — Logged and skipped; doesn't stop the crawl

## 📊 Logging

Logs are output in JSON format using Pino. For pretty printing in development:

```bash
node index.js | npx pino-pretty
```

## 🧪 Testing

Run smoke tests to verify components:

```bash
# Test notification gateway
npm run test:notification

# Test orchestrator lifecycle
npm run test:orchestrator
```

## 📄 License

ISC
