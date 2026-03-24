import { z } from 'zod';

/**
 * Zod schema for validating and transforming raw Airbnb URLs
 * Extracts listing ID and check-in/check-out dates from URL
 */
export const AirbnbUrlInputSchema = z.string().url('Must be a valid URL').transform((url, ctx) => {
  try {
    const parsedUrl = new URL(url);

    // Extract listing ID from pathname
    // Supports formats:
    // - /rooms/123456789
    // - /rooms/123456789?check_in=...&check_out=...
    // - /en/rooms/123456789
    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean);
    const roomsIndex = pathnameParts.indexOf('rooms');

    if (roomsIndex === -1 || roomsIndex + 1 >= pathnameParts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must contain a valid /rooms/{id} path',
      });
      return z.NEVER;
    }

    const rawId = pathnameParts[roomsIndex + 1];
    // Extract numeric ID (handle cases like "123456789?foo=bar" if query params aren't parsed)
    const listingId = rawId.split('?')[0];

    if (!/^\d+$/.test(listingId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Listing ID must be numeric',
      });
      return z.NEVER;
    }

    // Extract check_in and check_out from search params
    const checkIn = parsedUrl.searchParams.get('check_in');
    const checkOut = parsedUrl.searchParams.get('check_out');

    if (!checkIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must contain check_in query parameter (YYYY-MM-DD)',
      });
      return z.NEVER;
    }

    if (!checkOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must contain check_out query parameter (YYYY-MM-DD)',
      });
      return z.NEVER;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(checkIn)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'check_in must be in YYYY-MM-DD format',
      });
      return z.NEVER;
    }

    if (!dateRegex.test(checkOut)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'check_out must be in YYYY-MM-DD format',
      });
      return z.NEVER;
    }

    // Validate that checkOut is after checkIn
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (checkOutDate <= checkInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'check_out must be after check_in',
      });
      return z.NEVER;
    }

    return {
      id: listingId,
      checkIn,
      checkOut,
    };
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid URL format',
    });
    return z.NEVER;
  }
});

/**
 * Schema for a single listing input (raw URL -> normalized data)
 */
export const ListingInputSchema = z.object({
  url: AirbnbUrlInputSchema,
});

/**
 * Schema for batch listing input (array of URLs)
 */
export const ListingBatchInputSchema = z.array(
  z.object({
    url: AirbnbUrlInputSchema,
  })
).min(1, 'At least one listing URL is required');

/**
 * Validate and transform a single Airbnb URL
 * @param {string} url - Raw Airbnb URL
 * @returns {{ id: string, checkIn: string, checkOut: string }} Normalized listing data
 * @throws {z.ZodError} If validation fails
 */
export function validateAirbnbUrl(url) {
  return AirbnbUrlInputSchema.parse(url);
}

/**
 * Validate and transform a batch of Airbnb URLs
 * @param {Array<{ url: string }>} inputs - Array of objects with url property
 * @returns {Array<{ id: string, checkIn: string, checkOut: string }>} Array of normalized listing data
 * @throws {z.ZodError} If validation fails
 */
export function validateListingBatch(inputs) {
  return ListingBatchInputSchema.parse(inputs);
}
