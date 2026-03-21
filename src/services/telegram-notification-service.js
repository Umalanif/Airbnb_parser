import Bottleneck from 'bottleneck';
import logger from '../utils/logger.js';
import { gotScraping } from 'got-scraping';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Telegram Notification Service with Bottleneck rate limiting
 * Prevents 429 errors from Telegram Bot API
 */
class TelegramNotificationService {
  /**
   * @param {Object} options
   * @param {string} options.botToken - Telegram Bot API token
   * @param {string} options.chatId - Target chat ID for notifications
   * @param {number} [options.maxConcurrent=5] - Max concurrent requests
   * @param {number} [options.minTime=100] - Min time between requests (ms)
   */
  constructor({ botToken, chatId, maxConcurrent = 5, minTime = 100 }) {
    if (!botToken || !chatId) {
      throw new Error('TelegramNotificationService requires botToken and chatId');
    }

    this.botToken = botToken;
    this.chatId = chatId;

    // Bottleneck instance for rate limiting
    // Telegram Bot API limits: ~30 messages/second for most bots
    // Using conservative limits to avoid 429 errors
    this.limiter = new Bottleneck({
      maxConcurrent,
      minTime,
    });

    this.limiter.on('failed', (error, jobInfo) => {
      if (error?.response?.status === 429) {
        const retryAfter = error.response?.data?.parameters?.retry_after || 5;
        logger.warn(`Telegram API rate limit hit, retry after ${retryAfter}s`);
        return retryAfter * 1000;
      }
      // Don't retry on other errors - let them fail immediately
      return null;
    });

    this.limiter.on('error', (error) => {
      logger.error({ error: error.message }, 'TelegramNotificationService limiter error');
    });
  }

  /**
   * Send a message to Telegram with rate limiting
   * @private
   * @param {string} text - Message text
   * @param {string} [parseMode='HTML'] - Parse mode (HTML, Markdown, etc.)
   * @returns {Promise<Object>} Telegram API response
   */
  async _sendMessage(text, parseMode = 'HTML') {
    const url = `${TELEGRAM_API_BASE}/bot${this.botToken}/sendMessage`;

    try {
      const response = await gotScraping.post(url, {
        json: {
          chat_id: this.chatId,
          text,
          parse_mode: parseMode,
        },
        timeout: {
          request: 30000,
        },
        responseType: 'json',
        retry: {
          limit: 3,
          methods: ['POST'],
          statusCodes: [429, 500, 502, 503, 504],
          errorCodes: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'],
        },
        http2: false,
      });

      return response.body;
    } catch (error) {
      if (error.response) {
        const telegramError = new Error(`Telegram API error: ${error.response.body?.description || error.message}`);
        telegramError.response = {
          status: error.response.statusCode,
          data: error.response.body,
        };
        throw telegramError;
      }
      throw error;
    }
  }

  /**
   * Send a business alert (price changes, availability updates)
   * @param {Object} payload
   * @param {string} payload.listingTitle - Listing title
   * @param {string} payload.listingUrl - Listing URL
   * @param {number} [payload.currentPrice] - Current price
   * @param {number} [payload.previousPrice] - Previous price
   * @param {number} [payload.delta] - Price delta
   * @param {string} [payload.currency] - Currency code
   * @param {boolean} [payload.isAvailable] - Availability status
   * @returns {Promise<Object>} Telegram API response
   */
  async sendBusinessAlert(payload) {
    return this.limiter.schedule(() => this._formatAndSendBusinessAlert(payload));
  }

  /**
   * Format and send business alert
   * @private
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async _formatAndSendBusinessAlert(payload) {
    const {
      listingTitle,
      listingUrl,
      currentPrice,
      previousPrice,
      delta,
      currency = 'EUR',
      isAvailable,
    } = payload;

    let emoji = '🏠';
    let statusText = '';

    if (delta !== undefined && delta !== 0) {
      if (delta > 0) {
        emoji = '📈';
        statusText = `Price increased by ${Math.abs(delta)} ${currency}`;
      } else {
        emoji = '📉';
        statusText = `Price decreased by ${Math.abs(delta)} ${currency}`;
      }
    }

    if (isAvailable !== undefined) {
      if (isAvailable) {
        statusText += statusText ? ' • Now Available' : '✅ Available';
      } else {
        statusText += statusText ? ' • Sold Out' : '❌ Sold Out';
      }
    }

    const priceInfo = currentPrice !== undefined
      ? `\n💰 Price: ${currentPrice} ${currency}`
      : '';

    const previousPriceInfo = previousPrice !== undefined
      ? `\n📍 Previous: ${previousPrice} ${currency}`
      : '';

    const message = `
${emoji} <b>Listing Update</b>

<b>${this._escapeHtml(listingTitle)}</b>
${statusText}${priceInfo}${previousPriceInfo}

🔗 <a href="${this._escapeHtml(listingUrl)}">View Listing</a>
    `.trim();

    logger.info({ listingTitle, delta, isAvailable }, 'Sending business alert');

    return this._sendMessage(message);
  }

  /**
   * Send a system alert (403 errors, worker failures, etc.)
   * @param {Object} payload
   * @param {string} payload.type - Alert type (e.g., '403_ERROR', 'WORKER_CRASH')
   * @param {string} payload.message - Alert message
   * @param {string} [payload.details] - Additional details
   * @param {number} [payload.errorCount] - Error count for threshold alerts
   * @returns {Promise<Object>} Telegram API response
   */
  async sendSystemAlert(payload) {
    return this.limiter.schedule(() => this._formatAndSendSystemAlert(payload));
  }

  /**
   * Format and send system alert
   * @private
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async _formatAndSendSystemAlert(payload) {
    const {
      type,
      message,
      details,
      errorCount,
    } = payload;

    const emoji = this._getSystemAlertEmoji(type);

    let messageText = `
${emoji} <b>System Alert: ${this._escapeHtml(type)}</b>

${this._escapeHtml(message)}
    `.trim();

    if (details) {
      messageText += `\n\n<b>Details:</b>\n<code>${this._escapeHtml(details)}</code>`;
    }

    if (errorCount !== undefined) {
      messageText += `\n\n⚠️ Error count: ${errorCount}`;
    }

    logger.warn({ type, errorCount }, 'Sending system alert');

    return this._sendMessage(messageText);
  }

  /**
   * Get emoji for system alert type
   * @private
   * @param {string} type
   * @returns {string}
   */
  _getSystemAlertEmoji(type) {
    if (type.includes('403') || type.includes('FORBIDDEN')) return '🚫';
    if (type.includes('429') || type.includes('RATE')) return '⏳';
    if (type.includes('CRASH') || type.includes('ERROR')) return '💥';
    if (type.includes('NETWORK')) return '🌐';
    return '⚠️';
  }

  /**
   * Escape HTML special characters
   * @private
   * @param {string} text
   * @returns {string}
   */
  _escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Get current limiter stats
   * @returns {Object}
   */
  getStats() {
    return {
      queued: this.limiter.queued(),
      running: this.limiter.running(),
      // Bottleneck v2 doesn't have executed(), use total executed count from history
    };
  }

  /**
   * Wait for all queued jobs to complete
   * @returns {Promise<void>}
   */
  async idle() {
    // Bottleneck v2 uses empty() and running() to check status
    // We poll until there are no more queued or running jobs
    while (this.limiter.queued() > 0 || this.limiter.running() > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export default TelegramNotificationService;
