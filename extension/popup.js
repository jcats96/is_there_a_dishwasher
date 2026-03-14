/**
 * popup.js — Is There a Dishwasher? browser extension popup
 *
 * Loads saved listing rows from chrome.storage.local and renders them as a
 * sortable table.  Also handles CSV export, clear-all, and settings (API key,
 * max images per listing).
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allRows = [];          // full list, newest first
let currentFilter = 'all'; // 'all' | 'yes' | 'no'

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const filterSelect    = document.getElementById('filter-select');
const btnExport       = document.getElementById('btn-export');
const btnClear        = document.getElementById('btn-clear');
const tableWrap       = document.getElementById('table-wrap');
const emptyMsg        = document.getElementById('empty-msg');
const listingsTable   = document.getElementById('listings-table');
const listingsBody    = document.getElementById('listings-body');
const apiKeyInput     = document.getElementById('api-key-input');
const maxImagesInput  = document.getElementById('max-images-input');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsSavedMsg = document.getElementById('settings-saved-msg');

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function loadRows() {
  const data = await chrome.storage.local.get('rows');
  return data.rows ?? [];
}

async function loadSettings() {
  const data = await chrome.storage.local.get(['openai_key', 'max_images']);
  return {
    openaiKey: data.openai_key ?? '',
    maxImages: data.max_images ?? 10,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function formatPrice(price) {
  if (price == null) return '—';
  return '$' + Number(price).toLocaleString();
}

function formatBedsBaths(beds, baths) {
  const b = beds != null ? `${beds} bd` : null;
  const ba = baths != null ? `${baths} ba` : null;
  return [b, ba].filter(Boolean).join(' / ') || '—';
}

function renderRow(row) {
  const tr = document.createElement('tr');
  tr.className = row.has_dishwasher ? 'row-yes' : 'row-no';

  // Address cell (links to the listing)
  const addressCell = document.createElement('td');
  const a = document.createElement('a');
  a.href = row.url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.className = 'listing-link';
  a.textContent = [row.address, row.city, row.state].filter(Boolean).join(', ') || 'View listing';
  addressCell.appendChild(a);
  tr.appendChild(addressCell);

  // Price
  const priceCell = document.createElement('td');
  priceCell.textContent = formatPrice(row.price);
  tr.appendChild(priceCell);

  // Beds / Baths
  const bedsCell = document.createElement('td');
  bedsCell.textContent = formatBedsBaths(row.beds, row.baths);
  tr.appendChild(bedsCell);

  // Dishwasher status
  const statusCell = document.createElement('td');
  statusCell.className = 'status-cell';
  statusCell.textContent = row.has_dishwasher ? '✅ Yes' : '❌ No';
  tr.appendChild(statusCell);

  // Evidence
  const evidenceCell = document.createElement('td');
  evidenceCell.className = 'evidence-cell';
  if (row.evidence) {
    if (row.method === 'vision') {
      const img = document.createElement('img');
      img.src = row.evidence;
      img.alt = 'Listing photo';
      img.className = 'evidence-thumb';
      evidenceCell.appendChild(img);
    } else {
      const em = document.createElement('em');
      em.className = 'evidence-text';
      em.textContent = row.evidence;
      evidenceCell.appendChild(em);
    }
  } else {
    evidenceCell.textContent = '—';
  }
  tr.appendChild(evidenceCell);

  return tr;
}

function applyFilter(rows) {
  if (currentFilter === 'yes') return rows.filter(r => r.has_dishwasher);
  if (currentFilter === 'no')  return rows.filter(r => !r.has_dishwasher);
  return rows;
}

function renderTable() {
  listingsBody.innerHTML = '';

  const visible = applyFilter(allRows);

  if (visible.length === 0) {
    listingsTable.hidden = true;
    emptyMsg.hidden = false;
    emptyMsg.textContent = allRows.length === 0
      ? 'No listings saved yet.\nBrowse Zillow listing pages and they\'ll appear here automatically.'
      : 'No listings match the current filter.';
    return;
  }

  emptyMsg.hidden = true;
  listingsTable.hidden = false;

  visible.forEach(row => listingsBody.appendChild(renderRow(row)));
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function exportCsv() {
  const visible = applyFilter(allRows);
  if (visible.length === 0) return;

  const headers = ['Address', 'City', 'State', 'Price', 'Beds', 'Baths', 'Dishwasher', 'Method', 'Evidence', 'URL', 'Visited'];
  const lines = [headers.join(',')];

  visible.forEach(row => {
    lines.push([
      row.address,
      row.city,
      row.state,
      row.price,
      row.beds,
      row.baths,
      row.has_dishwasher ? 'Yes' : 'No',
      row.method,
      row.evidence,
      row.url,
      row.visitedAt,
    ].map(escapeCsv).join(','));
  });

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dishwasher-listings.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

filterSelect.addEventListener('change', () => {
  currentFilter = filterSelect.value;
  renderTable();
});

btnExport.addEventListener('click', exportCsv);

btnClear.addEventListener('click', async () => {
  if (!confirm('Delete all saved listings? This cannot be undone.')) return;
  await chrome.storage.local.set({ rows: [] });
  allRows = [];
  renderTable();
});

btnSaveSettings.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  const maxImages = parseInt(maxImagesInput.value, 10);

  await chrome.storage.local.set({
    openai_key: key || null,
    max_images: Number.isFinite(maxImages) && maxImages > 0 ? maxImages : 10,
  });

  settingsSavedMsg.hidden = false;
  setTimeout(() => { settingsSavedMsg.hidden = true; }, 2000);
});

// Re-render when storage changes (e.g. a new row arrives while popup is open)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.rows) {
    allRows = changes.rows.newValue ?? [];
    renderTable();
  }
});

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------

(async () => {
  const [rows, settings] = await Promise.all([loadRows(), loadSettings()]);
  allRows = rows;
  apiKeyInput.value = settings.openaiKey;
  maxImagesInput.value = settings.maxImages;

  renderTable();
})();
