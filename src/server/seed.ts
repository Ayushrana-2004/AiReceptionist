/**
 * Seed script — creates an initial user and business for local development.
 *
 * Usage: npx tsx src/server/seed.ts
 */

import { redisClient } from './db/redis';
import { hashPassword } from './services/auth';

const BUSINESS_ID = 'biz_001';
const USER_ID = 'user_001';

async function seed() {
  console.log('Seeding database...\n');

  // Create a business
  const business = {
    id: BUSINESS_ID,
    name: 'My AI Receptionist',
    greeting: 'Hello! Thank you for calling. How can I help you today?',
    voiceProfileId: 'voice-professional-female',
    enabledLanguages: ['en'],
    operatingHours: {
      timezone: 'America/New_York',
      schedule: {
        monday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        tuesday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        wednesday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        thursday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        friday: { openTime: '09:00', closeTime: '17:00', isOpen: true },
        saturday: { openTime: '10:00', closeTime: '14:00', isOpen: true },
        sunday: { openTime: '00:00', closeTime: '00:00', isOpen: false },
      },
    },
    maxConcurrentCalls: 50,
    callTimeoutSeconds: 300,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create a user
  const user = {
    id: USER_ID,
    email: 'addyhope958@gmail.com',
    passwordHash: hashPassword('password123'),
    businessId: BUSINESS_ID,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  // Store in Redis (since that's what your app uses for now)
  await redisClient.set(`business:${BUSINESS_ID}`, JSON.stringify(business));
  await redisClient.set(`user:${USER_ID}`, JSON.stringify(user));
  await redisClient.set(`user:email:${user.email}`, USER_ID);

  console.log('✓ Business created:', business.name);
  console.log('✓ User created:', user.email);
  console.log('\n--- Login credentials ---');
  console.log('Email:    addyhope958@gmail.com');
  console.log('Password: password123');
  console.log('\nDone! You can now sign in at http://localhost:5173');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
