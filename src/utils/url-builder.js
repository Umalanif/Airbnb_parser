/**
 * Constructs the Airbnb StaysPdpSections API URL with encoded parameters
 * @param {string} listingId - The listing ID to fetch
 * @param {string} checkIn - Check-in date (YYYY-MM-DD)
 * @param {string} checkOut - Check-out date (YYYY-MM-DD)
 * @param {Object} options - Additional options
 * @param {string} [options.locale='en'] - Locale
 * @param {string} [options.currency='EUR'] - Currency
 * @param {number} [options.adults=2] - Number of adults
 * @param {string} [options.pdpTypeOverride=null] - PDP type override
 * @returns {string} Fully constructed URL with encoded query parameters
 */

/**
 * Encodes a numeric listing ID to Base64 format for Airbnb API
 * @param {string|number} listingId - The numeric listing ID
 * @returns {string} Base64 encoded string in format StayListing:{numericId}
 */
export function encodeListingId(listingId) {
  return Buffer.from(`StayListing:${listingId}`).toString('base64');
}

export function buildAirbnbApiUrl(listingId, checkIn, checkOut, options = {}) {
  const {
    locale = 'en',
    currency = 'EUR',
    adults = 2,
    pets = 0,
  } = options;

  const base64ListingId = Buffer.from(`StayListing:${listingId}`).toString('base64url');
  const base64DemandStayListingId = Buffer.from(`DemandStayListing:${listingId}`).toString('base64url');

  const variables = {
    id: base64ListingId,
    demandStayListingId: base64DemandStayListingId,
    pdpSectionsRequest: {
      adults: String(adults),
      amenityFilters: null,
      bypassTargetings: false,
      categoryTag: null,
      causeId: null,
      children: null,
      disasterId: null,
      discountedGuestFeeVersion: null,
      federatedSearchId: null,
      forceBoostPriorityMessageType: null,
      hostPreview: false,
      infants: null,
      interactionType: null,
      layouts: ['SIDEBAR', 'SINGLE_COLUMN'],
      pets,
      pdpTypeOverride: null,
      photoId: null,
      preview: false,
      previousStateCheckIn: null,
      previousStateCheckOut: null,
      priceDropSource: null,
      privateBooking: false,
      promotionUuid: null,
      relaxedAmenityIds: null,
      searchId: null,
      selectedCancellationPolicyId: null,
      selectedRatePlanId: null,
      splitStays: null,
      staysBookingMigrationEnabled: false,
      translateUgc: null,
      useNewSectionWrapperApi: false,
      sectionIds: [
        'BOOK_IT_CALENDAR_SHEET',
        'POLICIES_DEFAULT',
        'BOOK_IT_SIDEBAR',
        'URGENCY_COMMITMENT_SIDEBAR',
        'BOOK_IT_NAV',
        'MESSAGE_BANNER',
        'HIGHLIGHTS_DEFAULT',
        'BOOK_IT_FLOATING_FOOTER',
        'URGENCY_COMMITMENT',
        'CANCELLATION_POLICY_PICKER_MODAL',
      ],
      checkIn,
      checkOut,
      p3ImpressionId: `p3_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    },
    categoryTag: null,
    federatedSearchId: null,
    p3ImpressionId: `p3_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    photoId: null,
    checkIn,
    checkOut,
    includePdpMigrationAmenitiesFragment: false,
    includeGpAmenitiesFragment: true,
    includePdpMigrationDescriptionFragment: false,
    includeGpDescriptionFragment: true,
    includePdpMigrationHeroFragment: false,
    includeGpHeroFragment: true,
    includePdpMigrationHighlightsFragment: false,
    includeGpHighlightsFragment: true,
    includePdpMigrationMeetYourHostFragment: false,
    includeGpMeetYourHostFragment: true,
    includePdpMigrationNavFragment: false,
    includeGpNavFragment: true,
    includePdpMigrationNavMobileFragment: false,
    includeGpNavMobileFragment: true,
    includePdpMigrationBookItNonExperiencedGuestFragment: false,
    includeGpBookItNonExperiencedGuestFragment: true,
    includePdpMigrationOverviewV2Fragment: false,
    includeGpOverviewV2Fragment: true,
    includePdpMigrationReviewsHighlightBannerFragment: false,
    includeGpReviewsHighlightBannerFragment: true,
    includePdpMigrationReportToAirbnbFragment: false,
    includeGpReportToAirbnbFragment: true,
    includePdpMigrationReviewsFragment: false,
    includeGpReviewsFragment: true,
    includePdpMigrationReviewsEmptyFragment: false,
    includeGpReviewsEmptyFragment: true,
    includePdpMigrationTitleFragment: false,
    includeGpTitleFragment: true,
    includePdpMigrationPoliciesFragment: false,
    includeGpPoliciesFragment: true,
  };

  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: '4199e7a22baeb7eacabc7499c3f58db242dfcfcbd751ee2a8284b56c500bafce',
    },
  };

  const url = new URL('https://www.airbnb.com/api/v3/StaysPdpSections/4199e7a22baeb7eacabc7499c3f58db242dfcfcbd751ee2a8284b56c500bafce');
  
  url.searchParams.set('operationName', 'StaysPdpSections');
  url.searchParams.set('locale', locale);
  url.searchParams.set('currency', currency);
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set('extensions', JSON.stringify(extensions));

  return url.toString();
}

export const buildAirbnbUrl = buildAirbnbApiUrl;
