# Airbnb Parser — Airbnb listing price and availability monitor with Telegram alerts.

[Features](#features) · [Tech Stack](#tech-stack) · [Quick Start](#quick-start) · [Environment Variables](#environment-variables)

│ Node.js monitoring service with Crawlee, Bree, Prisma, Express, and Telegram notifications.

## Features

- Monitors Airbnb listings on a recurring schedule.
- Stores price history and availability changes in SQLite with Prisma.
- Sends Telegram alerts for price deltas and availability events.
- Exposes REST endpoints to manage listings and inspect data.
- Supports optional session seeding, proxies, and Docker-based deployment.

## Tech Stack

```text
┌────────────┬──────────────────────────────────────────────┐
│ Layer      │ Technology                                   │
├────────────┼──────────────────────────────────────────────┤
│ Runtime    │ Node.js / JavaScript                         │
├────────────┼──────────────────────────────────────────────┤
│ Crawling   │ Crawlee / CheerioCrawler / Playwright       │
├────────────┼──────────────────────────────────────────────┤
│ API        │ Express                                      │
├────────────┼──────────────────────────────────────────────┤
│ Scheduling │ Bree                                         │
├────────────┼──────────────────────────────────────────────┤
│ Database   │ Prisma ORM / SQLite                         │
├────────────┼──────────────────────────────────────────────┤
│ Validation │ Zod                                          │
├────────────┼──────────────────────────────────────────────┤
│ Logging    │ Pino                                         │
├────────────┼──────────────────────────────────────────────┤
│ Infra      │ Docker / GitHub Actions                     │
└────────────┴──────────────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/Umalanif/Airbnb_parser.git
cd Airbnb_parser
cp .env.example .env
npm install
npx playwright install chromium
npx prisma generate
npx prisma db push
npm run seed
npm start
```

## Environment Variables

```text
┌────────────────────┬──────────────────────────────────────────────┬──────────┐
│ Variable           │ Description                                  │ Required │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ DATABASE_URL       │ SQLite database path                         │ Yes      │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ API_KEY            │ Protects write endpoints                     │ Yes      │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ TELEGRAM_BOT_TOKEN │ Telegram bot token for alerts                │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ TELEGRAM_CHAT_ID   │ Telegram chat ID for alerts                  │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ CHECK_IN           │ Default check-in date override               │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ CHECK_OUT          │ Default check-out date override              │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ AIRBNB_COOKIE      │ Session cookie for seeding                   │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ AIRBNB_API_KEY     │ Airbnb API key header for seeding            │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ AIRBNB_USER_AGENT  │ User-Agent for seeded session                │ No       │
├────────────────────┼──────────────────────────────────────────────┼──────────┤
│ PORT               │ Express API port                             │ No       │
└────────────────────┴──────────────────────────────────────────────┴──────────┘
```

## Project Structure

```text
src/
  server.js
  schemas/
    airbnb-response.js
    listing-input.js
    price-log.js
  services/
    telegram-notification-service.js
  utils/
    logger.js
    url-builder.js
jobs/
  parser.js
  session-miner.js
prisma/
  schema.prisma
  seed.js
public/
  index.html
  app.js
  style.css
.github/workflows/
  docker-build.yml
```

## License

ISC
