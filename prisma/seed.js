import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Step 1: Initialize session if not exists
  const sessionId = 'airbnb_main';
  
  const existingSession = await prisma.session.findUnique({
    where: { id: sessionId }
  });

  if (!existingSession) {
    // Check if required environment variables are set
    const cookie = process.env.AIRBNB_COOKIE;
    const xAirbnbApiKey = process.env.AIRBNB_API_KEY;
    const userAgent = process.env.AIRBNB_USER_AGENT;

    if (!cookie || !xAirbnbApiKey || !userAgent) {
      console.warn('Session initialization skipped: missing environment variables');
      console.warn('Set AIRBNB_COOKIE, AIRBNB_API_KEY, and AIRBNB_USER_AGENT in .env to auto-create session');
    } else {
      await prisma.session.create({
        data: {
          id: sessionId,
          cookie,
          xAirbnbApiKey,
          userAgent
        }
      });
      console.log('Session "airbnb_main" created successfully');
    }
  } else {
    console.log('Session "airbnb_main" already exists');
  }

  // Step 2: Initialize default listing
  const listingId = '858637964586872469';

  const listing = await prisma.listing.upsert({
    where: { id: listingId },
    update: {},
    create: {
      id: listingId,
      url: 'https://www.airbnb.com/rooms/858637964586872469',
      title: 'Default Listing',
      checkIn: '',
      checkOut: '',
      isActive: true,
    },
  });

  console.log('Listing created/updated:', listing);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
