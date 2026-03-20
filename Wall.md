# WALL.MD - ARCHITECTURAL LOG

## Decision Record 001
**Date:** 2026-03-20
**Phase:** Step 1 - Zod Schema Design

**Decision:** Used `z.any()` instead of `z.record(z.unknown())` for flexible section handling in Zod schema.

**Rationale:** Zod v4 has compatibility issues with `z.record()`. Using `z.any()` allows safe parsing while extracting specific sections manually after validation.

## Decision Record 002
**Date:** 2026-03-20
**Phase:** Step 4-5 - DB Integration and HTTP Request

**Decision:** Downgraded Prisma from v7 to v6 due to breaking changes in datasource configuration.

**Rationale:** Prisma 7 requires adapter configuration which adds complexity. Prisma 6 supports traditional `url = env("DATABASE_URL")` syntax and works with SQLite seamlessly.

## Decision Record 003
**Date:** 2026-03-20
**Phase:** Step 8 - Worker Lifecycle Graceful Shutdown

**Decision:** Removed all process.exit() calls from main(), letting natural flow complete through finally block.

**Rationale:** Direct process.exit() bypasses prisma.$disconnect() in finally block. Removed exits, added isShuttingDown check at start, and added explicit disconnect logging to verify cleanup.