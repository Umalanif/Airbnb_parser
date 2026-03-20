import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildAirbnbApiUrl } from '../src/utils/url-builder.js';
import { extractPriceFromResponse } from '../src/schemas/airbnb-response.js';

const mockApiResponse = {
  data: {
    presentation: {
      stayProductDetailPage: {
        sections: {
          sections: [
            {
              sectionId: 'BOOK_IT_SIDEBAR',
              section: {
                pricing: {
                  price: {
                    amount: 450000000,
                    currency: 'EUR',
                    formattedAmount: '€450.00'
                  }
                }
              }
            }
          ]
        }
      }
    }
  }
};

async function runSmokeTest() {
  console.log('=== Smoke Test: Parsing and Writing ===\n');

  const prisma = new PrismaClient();
  
  let testPassed = true;
  let errorMessage = '';

  try {
    console.log('1. Testing session lookup...');
    const session = await prisma.session.findUnique({
      where: { id: 'airbnb_main' },
    });

    if (!session) {
      throw new Error('Session not found');
    }
    console.log('   ✓ Session found:', session.id);

    console.log('\n2. Testing URL building...');
    const url = buildAirbnbApiUrl('12345678', '2026-04-01', '2026-04-07', {
      locale: 'en',
      currency: 'EUR',
    });
    console.log('   ✓ URL built successfully');
    console.log('   URL params:', url.split('?')[1].substring(0, 60) + '...');

    console.log('\n3. Testing Zod validation with mock API response...');
    const priceResult = extractPriceFromResponse(mockApiResponse);
    
    if (priceResult.error) {
      throw new Error('Zod validation failed: ' + JSON.stringify(priceResult.error.format()));
    }
    console.log('   ✓ Zod validation passed');
    console.log('   Extracted price:', priceResult.price, priceResult.currency);

    console.log('\n4. Testing PriceLog.create()...');
    const listingId = '12345678';
    const priceLog = await prisma.priceLog.create({
      data: {
        listingId,
        price: priceResult.price,
        currency: priceResult.currency || 'EUR',
      },
    });
    console.log('   ✓ PriceLog created with ID:', priceLog.id);
    console.log('   Data:', { listingId, price: priceLog.price, currency: priceLog.currency });

    console.log('\n=== SMOKE TEST PASSED ===');
    console.log('Parser successfully validates data and writes to DB.\n');

  } catch (error) {
    testPassed = false;
    errorMessage = error.message;
    console.error('\n✗ TEST FAILED:', errorMessage);
  } finally {
    await prisma.$disconnect();
  }

  process.exit(testPassed ? 0 : 1);
}

runSmokeTest();
