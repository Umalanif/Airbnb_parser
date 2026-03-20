# Architectural Log

## Phase 1-2: Data Model Migration

**Why:** Schema updated to support unique URL identification for listings and delta tracking for price changes.

**Decisions:**
- Added `url` (unique) and `title` to Listing for direct object identification
- Renamed `timestamp` to `capturedAt` in PriceLog for semantic clarity
- Added `isAvailable` (Boolean) and `delta` (Float) to PriceLog for availability tracking and price change detection
- Database reset required due to existing data incompatible with new non-nullable fields

## Phase 3: Notification Gateway

**Why:** Need reliable notification delivery with rate limiting to avoid Telegram API 429 errors.

**Decisions:**
- Created `TelegramNotificationService` class with Bottleneck rate limiter (30 msg/sec reservoir)
- Implemented `sendBusinessAlert()` for price/availability changes and `sendSystemAlert()` for system errors
- Used native `fetch` for HTTP requests (no additional dependencies)
- HTML parse mode for formatted messages with emoji indicators
- Service logs all notifications via Pino logger

## Phase 4: Notification Gateway Smoke Test

**Why:** Verify Bottleneck rate limiting and message delivery works under concurrent load.

**Decisions:**
- Test sends 5 messages (3 business + 2 system alerts) concurrently
- Bottleneck queues messages automatically, preventing 429 errors
- All messages delivered successfully, test passed

## Phase 5-6: Orchestrator Implementation & Smoke Test

**Why:** Need centralized job control with graceful shutdown for production reliability.

**Decisions:**
- Using Bree.js for worker orchestration with custom workerMessageHandler
- Worker sends 'cancelled' message after cleanup to signal Bree for termination
- Added 5-second force exit timeout (.unref()) to prevent hanging
- File-based shutdown trigger for Windows-compatible smoke testing
- bree.stop() only called when workers are active to avoid infinite wait

## Phase 7-8: Crawler Worker Implementation with Crawlee

**Why:** Need robust data extraction engine with anti-bot protection and proper session management.

**Decisions:**
- Using Crawlee CheerioCrawler for HTTP requests with got-scraping integration
- Custom headers (cookie, x-airbnb-api-key, user-agent) passed via sendRequest() in requestHandler
- RequestQueue populated from active listings (isActive === true)
- 403 error tracking with consecutive403Count counter and FORTY_THREE_THRESHOLD (default: 5)
- 429 errors trigger 5-second backoff before retry
- Crawler teardown initiated when 403 threshold exceeded, with Telegram system alert
- No global shared state - each worker run creates fresh RequestQueue
- ProxyConfiguration optional via PROXY_URLS env var

## Phase 9: Delta Detection and Persistence

**Why:** Need to track price changes over time and alert users only when meaningful changes occur.

**Decisions:**
- Created `src/schemas/price-log.js` with Zod schema for pre-write validation
- Delta calculated BEFORE writing new log (fetch previous, compute delta, then save)
- `calculateDelta()` returns 0 for first entry (no previous price)
- `hasAvailabilityChanged()` detects sold-out <-> available transitions
- PriceLog.create() now includes delta field from validationResult.data
- Business alerts sent fire-and-forget (non-blocking) with .catch() error handling
- Notification only triggered when delta !== 0 OR availability changed

## Phase 10: End-to-End Pipeline Smoke Test

**Why:** Verify complete pipeline works: delta detection, Zod validation, DB persistence, availability tracking, and Telegram notifications.

**Decisions:**
- Created `tests/smoke-test-phase-10.js` with 6 test cases (delta functions, Zod schema, DB persistence, availability change, notifications)
- Test creates baseline price log, then simulates price change (100→150 EUR) and availability change (true→false)
- All components verified: calculateDelta(), hasAvailabilityChanged(), PriceLogInputSchema.safeParse(), prisma.priceLog.create(), TelegramNotificationService
- Test passed: delta=50 correctly calculated, availability change detected, business+system alerts sent to Telegram
- Architecture complete: Orchestrator-Worker model with Delta Detection, Zod validation, and Notification Gateway fully operational
