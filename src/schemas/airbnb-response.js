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

const AirbnbResponseSchema = z.object({
  data: z.object({
    presentation: z.object({
      stayProductDetailPage: StayProductDetailPageSchema,
    }),
  }),
});

function extractPriceFromResponse(data) {
  const parseResult = AirbnbResponseSchema.safeParse(data);
  
  if (!parseResult.success) {
    return { error: parseResult.error };
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
