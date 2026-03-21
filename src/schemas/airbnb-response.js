import { z } from 'zod';

const PriceDetailsSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  formattedAmount: z.string().nullable(),
});

const BookItSidebarSectionSchema = z.object({
  sectionId: z.literal('BOOK_IT_SIDEBAR'),
  section: z.any().optional(),
});

const SectionSchema = z.object({
  sectionId: z.string(),
  section: z.any().optional(),
});

const SectionsArraySchema = z.array(SectionSchema);

const StayProductDetailPageSchema = z.object({
  sections: z.object({
    sections: SectionsArraySchema,
  }),
});

const ValidDataSchema = z.object({
  presentation: z.object({
    stayProductDetailPage: StayProductDetailPageSchema,
  }),
});

// Schema that properly handles null or missing data field
const AirbnbResponseSchema = z.object({
  data: ValidDataSchema.nullable().nullish(),
  errors: z.array(z.any()).optional(),
  message: z.string().optional(),
});

function extractPriceFromResponse(data) {
  // Handle API errors or invalid listings (data is null/undefined)
  if (!data?.data) {
    // Check if there's an error message from the API
    if (data?.errors?.length > 0) {
      return { error: new Error(`API error: ${JSON.stringify(data.errors)}`), price: null };
    }
    if (data?.message) {
      return { error: new Error(data.message), price: null };
    }
    // Listing unavailable or invalid
    return { error: null, price: null };
  }

  const parseResult = AirbnbResponseSchema.safeParse(data);

  if (!parseResult.success) {
    return { error: parseResult.error, price: null };
  }

  const sections = data.data.presentation.stayProductDetailPage.sections.sections;

  const bookItSection = sections.find(s =>
    s.sectionId === 'BOOK_IT_CALENDAR_SHEET' || s.sectionId === 'BOOK_IT_SIDEBAR'
  );

  if (!bookItSection?.section) {
    return { error: null, price: null };
  }

  const section = bookItSection.section;

  let priceValue = null;
  let currency = 'EUR';
  let formatted = null;

  if (section.structuredDisplayPrice?.primaryLine?.price) {
    const priceStr = section.structuredDisplayPrice.primaryLine.price;
    const match = priceStr.match(/[€$£]?\s*([\d,]+)/);
    if (match) {
      priceValue = parseFloat(match[1].replace(',', '.'));
    }
    formatted = priceStr;
  } else if (section.pricing?.price) {
    const priceData = section.pricing.price;
    priceValue = priceData.amount !== null ? priceData.amount / 1000000 : null;
    currency = priceData.currency;
    formatted = priceData.formattedAmount;
  }

  if (priceValue === null) {
    return { error: null, price: null };
  }

  return {
    price: priceValue,
    currency,
    formatted,
  };
}

export {
  AirbnbResponseSchema as airbnbResponseSchema,
  extractPriceFromResponse,
  BookItSidebarSectionSchema,
};
