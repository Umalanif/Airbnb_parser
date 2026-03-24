import 'dotenv/config';
import Bree from 'bree';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from './src/server.js';
import logger from './src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Graceful shutdown flag
let isShuttingDown = false;
let httpServer = null;

// Test shutdown file path (for smoke test)
const shutdownFilePath = process.env.TEST_SHUTDOWN_FILE || path.join(__dirname, '.shutdown');

// Create Bree instance with custom event handlers
const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  defaultExtension: 'js',
  logger,
  // Enable worker metadata for better logging
  workerMetadata: true,
  outputWorkerMetadata: true,
  // Custom error handler for worker failures
  errorHandler: (error, workerMetadata) => {
    logger.error(
      { 
        error: error.message || error, 
        worker: workerMetadata?.name,
        threadId: workerMetadata?.threadId 
      },
      'Worker error'
    );
  },
  // Custom message handler for worker communication
  workerMessageHandler: (name, message, workerMetadata) => {
    const logData = {
      worker: name,
      threadId: workerMetadata?.threadId,
    };

    if (typeof message === 'object' && message !== null) {
      Object.assign(logData, message);
    }

    if (message?.status === 'completed') {
      logger.info(logData, 'Worker completed');
      if (message.price) {
        logger.info({ listingId: message.listingId, price: message.price }, 'Price data received');
      }
    } else if (message?.status === 'error') {
      logger.error(logData, 'Worker error');
    } else if (message?.status === 'cancelled') {
      logger.info(logData, 'Worker cancelled');
    } else {
      logger.info(logData, 'Worker message');
    }
  },
  // Jobs configuration
  jobs: [
    {
      name: 'parser',
      interval: process.env.PARSER_INTERVAL || '5m',
      worker: {
        workerData: {
          checkIn: process.env.CHECK_IN || '2026-04-15',
          checkOut: process.env.CHECK_OUT || '2026-04-20',
        },
      },
    },
  ],
});

// Watch for shutdown file (for testing)
if (process.env.TEST_SHUTDOWN_FILE) {
  const watchInterval = setInterval(() => {
    if (fs.existsSync(shutdownFilePath) && !isShuttingDown) {
      logger.info({ file: shutdownFilePath }, 'Shutdown file detected, triggering graceful shutdown');
      clearInterval(watchInterval);
      gracefulShutdown('FILE_SIGNAL');
    }
  }, 500);
}

// Handle graceful shutdown
async function gracefulShutdown(signal) {
  if (isShuttingDown) return; // Чтобы не зациклиться
  isShuttingDown = true;

  // ПРЕДОХРАНИТЕЛЬ: Если за 5 секунд не вышли красиво — выходим жестко
  const forceExitTimeout = setTimeout(() => {
    logger.error('Could not close connections in time, forceful exit');
    process.exit(1);
  }, 5000);

  // Позволяем таймеру не держать процесс, если всё закроется само раньше
  forceExitTimeout.unref();

  logger.info({ signal }, 'Graceful shutdown initiated');

  try {
    // Close HTTP server first
    if (httpServer) {
      logger.info('Closing HTTP server...');
      await new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info('HTTP server closed');
    }

    // Get all active worker names
    const workerNames = Object.keys(bree.workers || {});
    logger.info({ workerNames, workerCount: workerNames.length }, 'Active workers to stop');

    // Send cancel message to all active workers
    for (const workerName of workerNames) {
      const worker = bree.workers[workerName];
      if (worker && worker.threadId) {
        logger.info({ workerId: worker.threadId, workerName }, 'Sending cancel signal to worker');
        bree.postMessageToWorker(workerName, { command: 'cancel' });
      }
    }

    // Stop all workers and wait for them to finish
    // Only call bree.stop() if there are active workers
    if (workerNames.length > 0) {
      logger.info('Stopping Bree...');
      await bree.stop();
      logger.info('All workers stopped');
    } else {
      logger.info('No active workers to stop');
    }

    logger.info('Shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Error during shutdown');
    // Force exit if graceful shutdown fails
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection at promise');
});

// Start the orchestrator
async function main() {
  logger.info('Starting Airbnb Parser Orchestrator...');

  try {
    await bree.start();
    logger.info('Bree started successfully');

    // Log active jobs
    const jobNames = bree.config.jobs.map((job) => (typeof job === 'string' ? job : job.name));
    logger.info({ jobs: jobNames }, 'Active jobs configured');

    // Start Express server on port 3000
    const port = process.env.PORT || 3000;
    const { app } = createServer(port);
    
    httpServer = app.listen(port, () => {
      logger.info({ port }, 'Express API server started');
    });

    // Handle HTTP server errors
    httpServer.on('error', (error) => {
      logger.error({ error: error.message }, 'Express server error');
    });

    // Keep the process alive
    logger.info('Orchestrator running. Press Ctrl+C to stop.');
    logger.info(`API available at http://localhost:${port}`);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start Bree');
    process.exit(1);
  }
}

main();
