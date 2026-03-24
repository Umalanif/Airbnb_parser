import { z } from 'zod';

/**
 * Schema for price log data before writing to database
 * Ensures data integrity and type safety
 * Price is nullable to support "Sold Out" status
 */
export const PriceLogInputSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required'),
  price: z.number().positive('Price must be positive').nullable(),
  currency: z.string().length(3, 'Currency must be 3-letter code'),
  isAvailable: z.boolean(),
  delta: z.number().default(0),
});

/**
 * Schema for delta calculation result
 */
export const DeltaResultSchema = z.object({
  currentPrice: z.number(),
  previousPrice: z.number().nullable(),
  delta: z.number(),
  hasChanged: z.boolean(),
  isAvailableChanged: z.boolean(),
});

/**
 * Calculate delta between current and previous price
 * @param {number | null} currentPrice - Current price (null if sold out)
 * @param {number | null} previousPrice - Previous price (null if no previous record or sold out)
 * @returns {number} Delta value (current - previous), or 0 if either price is null
 */
export function calculateDelta(currentPrice, previousPrice) {
  if (currentPrice === null || currentPrice === undefined || previousPrice === null || previousPrice === undefined) {
    return 0;
  }
  return currentPrice - previousPrice;
}

/**
 * Check if availability status has changed
 * @param {boolean} currentAvailable - Current availability status
 * @param {boolean | null} previousAvailable - Previous availability status
 * @returns {boolean} True if status changed
 */
export function hasAvailabilityChanged(currentAvailable, previousAvailable) {
  if (previousAvailable === null || previousAvailable === undefined) {
    return false;
  }
  return currentAvailable !== previousAvailable;
}

export { z };
