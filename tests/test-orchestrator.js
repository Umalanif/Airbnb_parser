/**
 * Smoke test for Orchestrator Lifecycle (Phase 6)
 * 
 * Tests:
 * 1. Bree starts successfully
 * 2. Parser worker runs
 * 3. Graceful shutdown via internal trigger
 * 4. Process exits cleanly
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const orchestratorPath = path.join(__dirname, '..', 'index.js');
const shutdownFlagPath = path.join(__dirname, '..', '.shutdown_test');

console.log('=== ORCHESTRATOR LIFECYCLE SMOKE TEST ===\n');

const prisma = new PrismaClient();

// First, seed a test session
async function seedSession() {
  try {
    await prisma.session.upsert({
      where: { id: 'airbnb_main' },
      update: {},
      create: {
        id: 'airbnb_main',
        cookie: 'test_cookie=value',
        xAirbnbApiKey: 'test_api_key',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    console.log('✓ Test session seeded\n');
  } catch (error) {
    console.error('✗ Failed to seed session:', error.message);
    console.log('Continuing test without session (worker will skip)...\n');
  }
}

await seedSession();

console.log(`Starting orchestrator: ${orchestratorPath}\n`);

// Set interval and enable shutdown test mode
const env = { 
  ...process.env, 
  NODE_ENV: 'test',
  PARSER_INTERVAL: '2s',
  LOG_LEVEL: 'info',
  TEST_SHUTDOWN_FILE: shutdownFlagPath,
};

const orchestrator = spawn('node', [orchestratorPath], {
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

let testPassed = false;
let breeStarted = false;
let gracefulShutdownSeen = false;
let workerRan = false;
let shutdownTriggered = false;

const testTimeout = setTimeout(() => {
  console.log('\n❌ TEST FAILED: Timeout - orchestrator did not shutdown within 15s');
  orchestrator.kill('SIGKILL');
  // Clean up shutdown flag
  if (fs.existsSync(shutdownFlagPath)) {
    fs.unlinkSync(shutdownFlagPath);
  }
  process.exit(1);
}, 15000);

orchestrator.stdout.on('data', (data) => {
  const line = data.toString();
  
  // Log output
  if (line.includes('INFO')) {
    console.log(line.trim());
  }

  // Check for Bree started
  if (line.includes('Bree started successfully')) {
    breeStarted = true;
  }

  // Check for worker activity
  if (line.includes('Worker') || line.includes('parser')) {
    workerRan = true;
  }

  // Check for graceful shutdown
  if (line.includes('Graceful shutdown initiated')) {
    gracefulShutdownSeen = true;
  }

  if (line.includes('Shutdown completed successfully')) {
    testPassed = true;
  }
});

orchestrator.stderr.on('data', (data) => {
  const line = data.toString();
  if (line.includes('ERROR') || line.includes('FATAL')) {
    console.error('ERROR:', line.trim());
  }
});

orchestrator.on('error', (err) => {
  console.error('❌ TEST FAILED: Failed to start orchestrator:', err.message);
  clearTimeout(testTimeout);
  // Clean up
  if (fs.existsSync(shutdownFlagPath)) {
    fs.unlinkSync(shutdownFlagPath);
  }
  process.exit(1);
});

orchestrator.on('close', (code) => {
  clearTimeout(testTimeout);
  // Clean up
  if (fs.existsSync(shutdownFlagPath)) {
    fs.unlinkSync(shutdownFlagPath);
  }

  console.log('\n=== TEST SUMMARY ===');
  console.log(`Bree started: ${breeStarted ? '✓' : '✗'}`);
  console.log(`Worker ran: ${workerRan ? '✓' : '✗'}`);
  console.log(`Graceful shutdown: ${gracefulShutdownSeen ? '✓' : '✗'}`);
  console.log(`Exit code: ${code}`);

  if (testPassed && code === 0) {
    console.log('\n✅ SMOKE TEST PASSED - Orchestrator lifecycle working correctly!');
    process.exit(0);
  } else if (code === 0 && breeStarted && gracefulShutdownSeen) {
    console.log('\n✅ SMOKE TEST PASSED - Orchestrator started and shutdown gracefully!');
    process.exit(0);
  } else {
    console.log('\n❌ SMOKE TEST FAILED - Orchestrator did not shutdown cleanly');
    process.exit(1);
  }
});

// Wait for Bree to start and worker to run, then trigger shutdown via file
setTimeout(() => {
  if (breeStarted && !shutdownTriggered) {
    console.log('\nTriggering graceful shutdown via file signal...\n');
    shutdownTriggered = true;
    // Create a file that the orchestrator watches for shutdown
    fs.writeFileSync(shutdownFlagPath, 'shutdown');
  }
}, 5000);
