import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const listingId = '858637964586872469';
  
  const listing = await prisma.listing.upsert({
    where: { id: listingId },
    update: {},
    create: {
      id: listingId,
      name: 'Default Listing',
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
