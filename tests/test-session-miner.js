import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workerPath = join(__dirname, '..', 'jobs', 'session-miner.js');

console.log('=== Smoke Test: Worker Framework ===');
console.log('Testing graceful shutdown with cancel signal...\n');

// Test 1: Normal startup and shutdown
const worker = new Worker(workerPath);

worker.on('online', () => {
  console.log('[TEST] Worker online');
});

worker.on('message', (msg) => {
  console.log('[TEST] Worker message:', msg);
});

let testPassed = false;

worker.on('exit', (code) => {
  if (testPassed) return;
  
  if (code === 0) {
    console.log('[TEST] Worker exited cleanly (code 0)');
    console.log('\n=== Smoke Test PASSED ===');
    testPassed = true;
    process.exit(0);
  } else {
    console.error('[TEST] Worker exited with error code:', code);
    console.log('\n=== Smoke Test FAILED ===');
    testPassed = true;
    process.exit(1);
  }
});

worker.on('error', (err) => {
  console.error('[TEST] Worker error:', err);
  process.exit(1);
});

// Test 2: Send cancel signal after short delay
setTimeout(() => {
  console.log('[TEST] Sending cancel signal...');
  worker.postMessage('cancel');
}, 500);

// Timeout guard
setTimeout(() => {
  console.error('[TEST] Test timeout - worker did not exit');
  process.exit(1);
}, 5000);
