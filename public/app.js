/**
 * AirBnb Price Tracker - Frontend Application
 */

const API_BASE = '';

/**
 * Fetch and render listings from /api/compare
 */
async function fetchListings() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const emptyState = document.getElementById('emptyState');
  const tableContainer = document.getElementById('compareTable');
  const listingsBody = document.getElementById('listingsBody');

  loadingIndicator.classList.remove('hidden');
  tableContainer.classList.add('hidden');
  emptyState.classList.add('hidden');

  try {
    const response = await fetch(`${API_BASE}/api/compare`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success || !data.listings || data.listings.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    renderListings(data.listings);
    tableContainer.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    showMessage('Failed to load listings. Please try again.', 'error');
    emptyState.classList.remove('hidden');
  } finally {
    loadingIndicator.classList.add('hidden');
  }
}

/**
 * Render listings table
 * @param {Array} listings - Array of listing data from API
 */
function renderListings(listings) {
  const listingsBody = document.getElementById('listingsBody');
  listingsBody.innerHTML = '';

  listings.forEach((listing) => {
    const row = document.createElement('tr');
    
    const statusClass = listing.isAvailable ? 'status-available' : 'status-sold-out';
    const statusText = listing.isAvailable ? 'Available' : 'Sold Out';
    
    const deltaClass = listing.delta > 0 
      ? 'delta-positive' 
      : listing.delta < 0 
        ? 'delta-negative' 
        : 'delta-neutral';
    
    const deltaText = listing.delta > 0 
      ? `+${listing.delta}` 
      : listing.delta.toString();

    const priceDisplay = listing.currentPrice !== null 
      ? `${listing.currentPrice} ${listing.currency}` 
      : '—';

    const deltaDisplay = listing.currentPrice !== null 
      ? `<span class="${deltaClass}">${deltaText}</span>` 
      : '—';

    const lastUpdated = listing.capturedAt 
      ? new Date(listing.capturedAt).toLocaleString() 
      : 'Never';

    row.innerHTML = `
      <td>
        <a href="${listing.url}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(listing.title)}
        </a>
      </td>
      <td>${listing.checkIn}</td>
      <td>${listing.checkOut}</td>
      <td>${priceDisplay}</td>
      <td>${deltaDisplay}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>${lastUpdated}</td>
    `;

    listingsBody.appendChild(row);
  });
}

/**
 * Add a new listing via POST /api/listings
 * @param {string} url - AirBnb listing URL
 */
async function addListing(url) {
  const formMessage = document.getElementById('formMessage');
  formMessage.className = 'message';
  formMessage.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/api/listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listings: [{ url }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to add listing');
    }

    showMessage('Listing added successfully!', 'success');
    document.getElementById('listingUrl').value = '';
    
    // Refresh the table after a short delay
    setTimeout(fetchListings, 500);
  } catch (error) {
    console.error('Failed to add listing:', error);
    showMessage(error.message, 'error');
  }
}

/**
 * Show a message in the form area
 * @param {string} text - Message text
 * @param {'success' | 'error'} type - Message type
 */
function showMessage(text, type) {
  const formMessage = document.getElementById('formMessage');
  formMessage.textContent = text;
  formMessage.className = `message ${type}`;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    formMessage.className = 'message';
    formMessage.textContent = '';
  }, 5000);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Initialize the application
 */
function init() {
  // Form submission handler
  const form = document.getElementById('addListingForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const urlInput = document.getElementById('listingUrl');
    const url = urlInput.value.trim();
    
    if (url) {
      addListing(url);
    }
  });

  // Refresh button handler
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.addEventListener('click', fetchListings);

  // Initial load
  fetchListings();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
