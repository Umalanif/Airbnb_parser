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
  const bookItSidebar = sections.find(s => s.sectionId === 'BOOK_IT_SIDEBAR');
  
  if (!bookItSidebar?.section?.pricing?.price) {
    return { error: null, price: null };
  }
  
  const priceData = bookItSidebar.section.pricing.price;
  
  return {
    price: priceData.amount !== null ? priceData.amount / 1000000 : null,
    currency: priceData.currency,
    formatted: priceData.formattedAmount,
  };
}

export {
  AirbnbResponseSchema,
  extractPriceFromResponse,
  BookItSidebarSectionSchema,
};
