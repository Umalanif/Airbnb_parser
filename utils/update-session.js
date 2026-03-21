import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SESSION_ID = 'airbnb_main';

const CORRECT_API_KEY = 'd306zoyjsyarp7ifhu67rjxn52tv0t20';

const PLACEHOLDER_COOKIE = '_tbm0=1742500000; _airbnb_m=1; _jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

async function updateSession() {
  try {
    const existingSession = await prisma.session.findUnique({
      where: { id: SESSION_ID },
    });

    if (!existingSession) {
      console.log('Session not found. Creating new session...');
      const newSession = await prisma.session.create({
        data: {
          id: SESSION_ID,
          cookie: PLACEHOLDER_COOKIE,
          xAirbnbApiKey: CORRECT_API_KEY,
          userAgent: USER_AGENT,
        },
      });
      console.log('New session created:', JSON.stringify(newSession, null, 2));
      return;
    }

    console.log('Updating existing session...');
    const updatedSession = await prisma.session.update({
      where: { id: SESSION_ID },
      data: {
        xAirbnbApiKey: CORRECT_API_KEY,
        cookie: PLACEHOLDER_COOKIE,
        userAgent: USER_AGENT,
      },
    });

    console.log('Session updated successfully:', JSON.stringify(updatedSession, null, 2));
  } catch (error) {
    console.error('Error updating session:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateSession();
