import 'dotenv/config';
import { jest } from '@jest/globals';

const mockPriceData = {
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

const mockSession = {
  id: 'airbnb_main',
  cookie: 'test_cookie=abc123',
  xAirbnbApiKey: 'd306zoyjsyarp7ifhu62rro52b',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

jest.unstable_mockModule('got-scraping', () => ({
  gotScraping: {
    get: jest.fn().mockResolvedValue({
      body: JSON.stringify(mockPriceData)
    })
  }
}));

const { gotScraping } = await import('got-scraping');
const { PrismaClient } = await import('@prisma/client');
const { buildAirbnbApiUrl } = await import('../src/utils/url-builder.js');
const { extractPriceFromResponse } = await import('../src/schemas/airbnb-response.js');

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
    console.log('   ✓ URL built:', url.substring(0, 80) + '...');

    console.log('\n3. Testing HTTP request (mocked)...');
    const headers = {
      'cookie': session.cookie,
      'x-airbnb-api-key': session.xAirbnbApiKey,
      'user-agent': session.userAgent,
      'sec-ch-ua': '"Chromium";v="146"',
      'x-airbnb-graphql-platform': 'web',
    };
    
    const response = await gotScraping.get(url, { headers });
    const data = JSON.parse(response.body);
    console.log('   ✓ HTTP response received');

    console.log('\n4. Testing Zod validation...');
    const priceResult = extractPriceFromResponse(data);
    
    if (priceResult.error) {
      throw new Error('Zod validation failed: ' + priceResult.error.format());
    }
    console.log('   ✓ Zod validation passed');
    console.log('   Price:', priceResult.price, priceResult.currency);

    console.log('\n5. Testing PriceLog create...');
    const listingId = '12345678';
    const priceLog = await prisma.priceLog.create({
      data: {
        listingId,
        price: priceResult.price,
        currency: priceResult.currency || 'EUR',
      },
    });
    console.log('   ✓ PriceLog created:', priceLog.id);

    console.log('\n=== ALL TESTS PASSED ===');

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
