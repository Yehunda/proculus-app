console.log("JS loaded");

const OWNER_WALLET_ADDRESS = "0x4C3CFF7Df41e85d4972c5406EcF105a9AEA34b4d".toLowerCase();
const API_BASE = "/api/public";
const USER_PAGE_SIZE = 8;

const TICKER_ASSETS = [
  ["BTC", "bitcoin"],
  ["ETH", "ethereum"],
  ["SOL", "solana"],
  ["BNB", "binancecoin"],
  ["XRP", "ripple"],
  ["ADA", "cardano"],
  ["AVAX", "avalanche-2"],
  ["DOGE", "dogecoin"],
  ["TRX", "tron"],
  ["LINK", "chainlink"],
  ["DOT", "polkadot"],
  ["MATIC", "polygon-ecosystem-token"],
  ["LTC", "litecoin"],
  ["BCH", "bitcoin-cash"],
  ["ATOM", "cosmos"],
  ["NEAR", "near"],
  ["ICP", "internet-computer"],
  ["FIL", "filecoin"],
  ["APT", "aptos"],
  ["ARB", "arbitrum"],
  ["OP", "optimism"],
  ["SUI", "sui"],
  ["PEPE", "pepe"],
  ["SHIB", "shiba-inu"],
  ["TAO", "bittensor"],
  ["RENDER", "render-token"],
  ["FET", "artificial-superintelligence-alliance"],
  ["HYPE", "hyperliquid"],
  ["ONDO", "ondo-finance"],
  ["MORPHO", "morpho"],
  ["XMR", "monero"],
  ["ZEC", "zcash"],
  ["XLM", "stellar"],
  ["XAUT", "tether-gold"]
];

const TICKER_IDS = TICKER_ASSETS.map(([, id]) => id).join(",");

let selectedUpgradePlan = localStorage.getItem("selectedPlan") || "monthly";

const adminState = {
  users: [],
  subscriptions: [],
  events: [],
  pendingPayments: [],
  userPage: 1,
  refreshTimer: null,
  previousEventKeys: new Set(),
  history: {
    users: [],
    subscriptions: [],
    yearly: [],
    events: [],
    visibleUsers: [],
    refresh: []
  }
};

let adminToolsEnabled = false;
const unlockCalendarState = { items: [], expanded: false };
const signalsState = {
  items: [],
  decisionRepository: [],
  expanded: false,
  signal: "all",
  strength: "all",
  search: ""
};
const telegramLinkState = {
  status: null,
  waiting: false,
  refreshTimer: null
};

function getStoredWalletAddress() {
  return (localStorage.getItem("walletAddress") || "").toLowerCase();
}

function isOwnerWallet(address = getStoredWalletAddress()) {
  return address === OWNER_WALLET_ADDRESS;
}

function getStoredEmailUser() {
  try {
    return JSON.parse(localStorage.getItem("proculusEmailUser") || "null");
  } catch (err) {
    return null;
  }
}

function persistEmailUser(user) {
  localStorage.setItem("proculusEmailUser", JSON.stringify(user));
  localStorage.setItem("proculusAccessLevel", user?.accessLevel || "free");
  localStorage.setItem("proculusAuthType", "email");
}

function getTelegramStatusPillClass(linked, eligible) {
  if (linked) return "connected";
  if (eligible) return "eligible";
  return "locked";
}

function getTelegramStatusPillLabel(linked, eligible) {
  if (linked) return "Connected";
  if (eligible) return "Ready";
  return "Unavailable";
}

function stopTelegramStatusRefresh() {
  if (telegramLinkState.refreshTimer) {
    clearInterval(telegramLinkState.refreshTimer);
    telegramLinkState.refreshTimer = null;
  }
}

function startTelegramStatusRefresh() {
  stopTelegramStatusRefresh();
  telegramLinkState.refreshTimer = setInterval(() => {
    loadTelegramStatus({ silent: true });
  }, 5000);
}

function renderTelegramAlertsCard(data = null) {
  const card = document.getElementById("telegram-alerts-card");
  const summary = document.getElementById("telegram-alerts-summary");
  const meta = document.getElementById("telegram-alerts-meta");
  const action = document.getElementById("telegram-alerts-action");
  const pill = document.getElementById("telegram-link-status-pill");
  const result = document.getElementById("telegram-link-result");
  if (!card || !summary || !meta || !action || !pill) return;

  if (!isEmailUser()) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  const linked = Boolean(data?.linked && data?.telegram);
  const eligible = Boolean(data?.alertsEligible);
  const telegram = data?.telegram || null;

  pill.className = `telegram-link-status-pill ${getTelegramStatusPillClass(linked, eligible)}`;
  pill.textContent = getTelegramStatusPillLabel(linked, eligible);

  if (linked && telegram) {
    telegramLinkState.waiting = false;
    stopTelegramStatusRefresh();
    summary.textContent = "Telegram alerts are connected for your email account.";
    meta.innerHTML = `
      <span>Email: ${escapeHtml(telegram.linkedEmail || getStoredEmailUser()?.email || "-")}</span>
      <span>Plan: ${escapeHtml(telegram.plan || getEmailUserPlan() || "free")}</span>
      <span>Username: ${escapeHtml(telegram.telegramUsername ? `@${telegram.telegramUsername}` : "Connected")}</span>
    `;
    action.innerHTML = `
      <span class="telegram-inline-note">Your bot link is active${telegram.alertsEligible ? "" : ", but your current plan does not include alerts"}.</span>
      <button type="button" class="terminal-btn ghost-btn" id="refresh-telegram-status-btn">Refresh Status</button>
    `;
    if (result) result.style.display = "none";
    return;
  }

  if (!eligible) {
    telegramLinkState.waiting = false;
    stopTelegramStatusRefresh();
    summary.textContent = "Telegram alert linking is available for eligible paid email plans.";
    meta.innerHTML = `
      <span>Email: ${escapeHtml(getStoredEmailUser()?.email || "-")}</span>
      <span>Plan: ${escapeHtml(getEmailUserPlan() || "free")}</span>
      <span>Status: Upgrade required for alerts</span>
    `;
    action.innerHTML = `<span class="telegram-inline-note">Upgrade your plan to enable Telegram alerts.</span>`;
    if (result) result.style.display = "none";
    return;
  }

  summary.textContent = "Connect Telegram to receive Proculus alerts through the bot.";
  meta.innerHTML = `
    <span>Email: ${escapeHtml(getStoredEmailUser()?.email || "-")}</span>
    <span>Plan: ${escapeHtml(getEmailUserPlan() || "free")}</span>
    <span>Status: ${telegramLinkState.waiting ? "Waiting for Telegram confirmation" : "Not connected"}</span>
  `;
  action.innerHTML = telegramLinkState.waiting
    ? `
      <button type="button" class="terminal-btn accent-btn" id="connect-telegram-btn">Connect Telegram</button>
      <button type="button" class="terminal-btn ghost-btn" id="refresh-telegram-status-btn">Refresh Status</button>
    `
    : `<button type="button" class="terminal-btn accent-btn" id="connect-telegram-btn">Connect Telegram</button>`;
}

function renderTelegramLinkToken(data) {
  const result = document.getElementById("telegram-link-result");
  if (!result) return;

  const botLink = data?.botUrl
    ? `<a class="terminal-btn accent-btn" href="${escapeHtml(data.botUrl)}" target="_blank" rel="noreferrer">Open Telegram Bot</a>`
    : "";
  const command = data?.startCommand ? `<code>${escapeHtml(data.startCommand)}</code>` : "";

  result.innerHTML = `
    <strong>Waiting for Telegram confirmation...</strong>
    <p>${botLink ? "Open the bot and finish the link. This card will refresh automatically." : "Open the Proculus bot and send this command, then refresh if needed:"}</p>
    ${botLink ? `<div class="telegram-link-actions">${botLink}</div>` : ""}
    ${command ? `<div class="telegram-command-box">${command}</div>` : ""}
    <div class="telegram-link-actions">
      <button type="button" class="terminal-btn ghost-btn" id="refresh-telegram-status-btn">Refresh Status</button>
    </div>
  `;
  result.style.display = "block";
}

async function loadTelegramStatus(options = {}) {
  if (!isEmailUser()) return;

  try {
    const res = await fetch(`${API_BASE}/auth/telegram/status`, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`Telegram status request failed: ${res.status}`);
    }

    const data = await res.json();
    telegramLinkState.status = data;
    if (data?.linked) {
      telegramLinkState.waiting = false;
    }
    renderTelegramAlertsCard(data);
  } catch (err) {
    console.error("Telegram status fetch failed:", err);
    renderTelegramAlertsCard(telegramLinkState.status || {
      linked: false,
      alertsEligible: getEmailUserPlan() !== "free",
      telegram: null
    });
    if (!options.silent) {
      const result = document.getElementById("telegram-link-result");
      if (result && telegramLinkState.waiting) {
        result.style.display = "block";
        result.textContent = "Status refresh failed. Try again in a few seconds.";
      }
    }
  }
}

function bindTelegramConnectUi() {
  document.getElementById("notifications-section")?.addEventListener("click", async (event) => {
    const button = event.target.closest("#connect-telegram-btn");
    const refreshButton = event.target.closest("#refresh-telegram-status-btn");
    if (!button && !refreshButton) return;

    if (refreshButton) {
      await loadTelegramStatus();
      return;
    }

    const result = document.getElementById("telegram-link-result");
    button.disabled = true;
    if (result) {
      result.style.display = "block";
      result.textContent = "Generating Telegram link token...";
    }

    try {
      const res = await fetch(`${API_BASE}/auth/telegram/link-token`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create Telegram link token");
      }
      telegramLinkState.waiting = true;
      renderTelegramAlertsCard({
        linked: false,
        alertsEligible: true,
        telegram: null
      });
      renderTelegramLinkToken(data);
      startTelegramStatusRefresh();
    } catch (err) {
      if (result) {
        result.textContent = err.message;
        result.style.display = "block";
      }
    } finally {
      button.disabled = false;
    }
  });
}

function persistPaymentStatus(status) {
  if (!status) {
    localStorage.removeItem("proculusPaymentStatus");
    return;
  }
  localStorage.setItem("proculusPaymentStatus", JSON.stringify(status));
}

function getStoredPaymentStatus() {
  try {
    return JSON.parse(localStorage.getItem("proculusPaymentStatus") || "null");
  } catch (err) {
    return null;
  }
}

function clearEmailUser() {
  localStorage.removeItem("proculusEmailUser");
  localStorage.removeItem("proculusAccessLevel");
  localStorage.removeItem("proculusAuthType");
  localStorage.removeItem("proculusPaymentStatus");
}

function isEmailUser() {
  const user = getStoredEmailUser();
  return Boolean(user && user.authType === "email");
}

function isFreeEmailUser() {
  const user = getStoredEmailUser();
  return Boolean(user && user.authType === "email" && user.accessLevel === "free");
}

function getEmailUserPlan() {
  const user = getStoredEmailUser();
  if (!user || user.authType !== "email") return "";
  return String(user.plan || (user.accessLevel === "free" ? "free" : "")).toLowerCase();
}

function requirePanelAccess() {
  const selectedPlan = localStorage.getItem("selectedPlan");
  const walletAddress = localStorage.getItem("walletAddress");

  if (walletAddress && isOwnerWallet(walletAddress.toLowerCase())) {
    localStorage.setItem("ownerAccess", "true");
    return true;
  }

  localStorage.removeItem("ownerAccess");

  if (walletAddress && selectedPlan) {
    return true;
  }

  if (isEmailUser()) {
    return true;
  }

  window.location.href = "intro.html";
  return false;
}

if (!requirePanelAccess()) {
  throw new Error("Panel access denied: missing wallet or selected plan.");
}


const marketIntelligenceState = {
  items: [],
  category: "all",
  risk: "all",
  search: "",
  expanded: false
};

function getFilteredMarketIntelligenceItems() {
  return marketIntelligenceState.items
    .filter((item) => {
      const categoryMatches = marketIntelligenceState.category === "all" || String(item.category || "General") === marketIntelligenceState.category;
      const riskMatches = marketIntelligenceState.risk === "all" || String(item.riskLevel || "Medium") === marketIntelligenceState.risk;
      const haystack = [
        item.title,
        item.summary,
        item.fullArticle,
        item.source,
        item.category
      ].filter(Boolean).join(' ').toLowerCase();
      const searchMatches = !marketIntelligenceState.search || haystack.includes(marketIntelligenceState.search);
      return categoryMatches && riskMatches && searchMatches;
    })
    .sort((a, b) => {
      const aUnlock = String(a.category || '').toLowerCase() === 'unlock' || Boolean(a.relatedUnlock);
      const bUnlock = String(b.category || '').toLowerCase() === 'unlock' || Boolean(b.relatedUnlock);
      if (aUnlock !== bUnlock) {
        return aUnlock ? -1 : 1;
      }
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime();
    });
}

function renderMarketIntelligenceItems() {
  const container = document.getElementById("market-intelligence-container");
  if (!container) return;

  const filteredEntries = getFilteredMarketIntelligenceItems();
  const entries = marketIntelligenceState.expanded ? filteredEntries : filteredEntries.slice(0, 3);
  const viewMoreButton = document.getElementById("market-intelligence-view-more");

  if (!filteredEntries.length) {
    container.innerHTML = `
      <article class="market-intelligence-card panel-card">
        <span class="card-label">No Match</span>
        <h3>No market intelligence items match the current filters.</h3>
        <p>Adjust the category or risk filters to widen the feed.</p>
      </article>
    `;
    if (viewMoreButton) viewMoreButton.style.display = "none";
    return;
  }

  container.innerHTML = entries.map((item, index) => `
    <article class="market-intelligence-card panel-card${index === 0 ? ' is-open' : ''}">
      <button type="button" class="market-intelligence-toggle" aria-expanded="${index === 0 ? 'true' : 'false'}">
        <div class="market-intelligence-topline">
          <span class="card-label">Market Intelligence</span>
          <span class="market-risk-pill risk-${String(item.riskLevel || "medium").toLowerCase()}">${escapeHtml(item.riskLevel || 'Medium')} Risk</span>
        </div>
        <div class="market-intelligence-bias-line bias-${String(item.actionBias || 'Neutral').toLowerCase()}">Expected Bias: ${escapeHtml(item.actionBias || 'Neutral')}</div>
        <div class="market-intelligence-action-note">${escapeHtml(item.actionNote || 'No strong directional bias')}</div>
        <h3>${escapeHtml(item.title || 'Untitled')}</h3>
        <p class="market-intelligence-summary">${escapeHtml(item.summary || '')}</p>
        <div class="market-intelligence-meta">
          <div class="market-intelligence-meta-left">
            <span class="market-category-pill">${escapeHtml(item.category || 'General')}</span>
            <span class="market-intelligence-source">${escapeHtml(item.source || 'Market Feed')}</span>
            ${item.relatedUnlock ? `<span class="market-unlock-risk-pill risk-${String(item.relatedUnlockImpactLevel || 'Low').toLowerCase()}">Upcoming Unlock Risk</span>` : ''}
          </div>
          <span>${escapeHtml(formatRelativeTime(item.time || ''))}</span>
        </div>
        <span class="market-intelligence-chevron" aria-hidden="true">+</span>
      </button>
      <div class="market-intelligence-expanded">
        <div class="market-intelligence-article">
          <strong>Full Analysis</strong>
          <p>${escapeHtml(item.fullArticle || '')}</p>
        </div>
        ${item.sourceLink ? `<a class="market-intelligence-source-link" href="${escapeHtml(item.sourceLink)}" target="_blank" rel="noreferrer">Read original source</a>` : ''}
        ${item.relatedUnlock ? `<div class="market-intelligence-unlock-note"><strong>Upcoming Unlock Risk</strong><p>${renderUnlockPressure(item.relatedUnlockDaysLeft, item.relatedUnlockDate || '')} · ${escapeHtml(item.relatedUnlockImpactLevel || 'Low')} impact unlock is on the calendar for this token.</p></div>` : ''}
        <div class="market-intelligence-implication">
          <strong>Market Implication</strong>
          <p>${escapeHtml(item.implication || '')}</p>
        </div>
        <div class="market-intelligence-detail-grid">
          <div class="market-intelligence-detail">
            <strong>Why It Matters</strong>
            <p>${escapeHtml(item.whyItMatters || '')}</p>
          </div>
          <div class="market-intelligence-detail">
            <strong>Scenario</strong>
            <p>${escapeHtml(item.scenario || '')}</p>
          </div>
        </div>
        ${adminToolsEnabled ? `<div class="admin-xpost-inline"><button type="button" class="terminal-btn ghost-btn admin-xpost-trigger" data-xpost-type="market" data-xpost-index="${marketIntelligenceState.items.indexOf(item)}">Generate X Post</button></div>` : ''}
      </div>
    </article>
  `).join('');

  bindMarketIntelligenceToggles();
  bindAdminXPostActions();
  if (viewMoreButton) {
    viewMoreButton.style.display = filteredEntries.length > 3 ? "inline-flex" : "none";
    viewMoreButton.textContent = marketIntelligenceState.expanded ? "Show Less" : "View More";
  }
}

function bindMarketIntelligenceFilters() {
  const searchInput = document.getElementById("market-intelligence-search");
  const categoryFilter = document.getElementById("market-intelligence-category-filter");
  const riskFilter = document.getElementById("market-intelligence-risk-filter");

  if (searchInput) {
    searchInput.value = marketIntelligenceState.search;
    searchInput.addEventListener("input", () => {
      marketIntelligenceState.search = searchInput.value.trim().toLowerCase();
      marketIntelligenceState.expanded = false;
      renderMarketIntelligenceItems();
    });
  }

  if (categoryFilter) {
    categoryFilter.value = marketIntelligenceState.category;
    categoryFilter.addEventListener("change", () => {
      marketIntelligenceState.category = categoryFilter.value;
      marketIntelligenceState.expanded = false;
      renderMarketIntelligenceItems();
    });
  }

  if (riskFilter) {
    riskFilter.value = marketIntelligenceState.risk;
    riskFilter.addEventListener("change", () => {
      marketIntelligenceState.risk = riskFilter.value;
      marketIntelligenceState.expanded = false;
      renderMarketIntelligenceItems();
    });
  }
}

function renderUnlockPressure(daysLeft, date) {
  const numericDaysLeft = Number(daysLeft);
  if (Number.isFinite(numericDaysLeft) && numericDaysLeft <= 1) {
    return `<span class="market-risk-pill risk-high">⚠️ Unlock Tomorrow</span>`;
  }

  if (Number.isFinite(numericDaysLeft) && numericDaysLeft <= 3) {
    return `Unlock in ${numericDaysLeft} day${numericDaysLeft === 1 ? "" : "s"}`;
  }

  return escapeHtml(formatDate(date || ""));
}

function bindSectionDensityControls() {
  const marketButton = document.getElementById("market-intelligence-view-more");
  if (marketButton && marketButton.dataset.bound !== "true") {
    marketButton.dataset.bound = "true";
    marketButton.addEventListener("click", () => {
      marketIntelligenceState.expanded = !marketIntelligenceState.expanded;
      renderMarketIntelligenceItems();
    });
  }

  const unlockButton = document.getElementById("unlock-calendar-view-more");
  if (unlockButton && unlockButton.dataset.bound !== "true") {
    unlockButton.dataset.bound = "true";
    unlockButton.addEventListener("click", () => {
      unlockCalendarState.expanded = !unlockCalendarState.expanded;
      loadUnlockCalendar();
    });
  }
}

function bindMarketIntelligenceToggles() {
  document.querySelectorAll('.market-intelligence-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.market-intelligence-card');
      if (!card) return;

      document.querySelectorAll('.market-intelligence-card').forEach((item) => {
        const isTarget = item === card;
        item.classList.toggle('is-open', isTarget ? !item.classList.contains('is-open') : false);
        const toggle = item.querySelector('.market-intelligence-toggle');
        if (toggle) {
          toggle.setAttribute('aria-expanded', item.classList.contains('is-open') ? 'true' : 'false');
        }
      });
    });
  });
}

async function loadMarketIntelligence() {
  const container = document.getElementById("market-intelligence-container");
  if (!container) return;

  try {
    const res = await fetch('/market-intelligence.json', {
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Market intelligence request failed: ${res.status}`);
    }

    const items = await res.json();
    marketIntelligenceState.items = Array.isArray(items) ? items : [];

    if (!marketIntelligenceState.items.length) {
      container.innerHTML = `
        <article class="market-intelligence-card panel-card">
          <span class="card-label">No Feed</span>
          <h3>No market intelligence items are available yet.</h3>
          <p>Run the market intelligence engine to generate the first set of analysis entries.</p>
        </article>
      `;
      if (viewMoreButton) viewMoreButton.style.display = "none";
      return;
    }

    bindMarketIntelligenceFilters();
    bindSectionDensityControls();
    renderMarketIntelligenceItems();
  } catch (err) {
    console.error('Failed to load market intelligence:', err);
    container.innerHTML = `
      <article class="market-intelligence-card panel-card">
        <span class="card-label">Unavailable</span>
        <h3>Market intelligence could not be loaded.</h3>
        <p>The feed is temporarily unavailable. Try again after refreshing the panel.</p>
      </article>
    `;
  }
}

function buildUrgencyText(daysLeft, date) {
  const numericDaysLeft = Number(daysLeft);
  if (Number.isFinite(numericDaysLeft) && numericDaysLeft <= 1) return 'Unlock Tomorrow';
  if (Number.isFinite(numericDaysLeft) && numericDaysLeft <= 3) return `Unlock in ${numericDaysLeft} days`;
  return formatDate(date || '');
}

function buildMarketXPost(item) {
  return [
    item.title,
    item.relatedUnlock ? buildUrgencyText(item.relatedUnlockDaysLeft, item.relatedUnlockDate) : '',
    item.riskLevel ? `${item.riskLevel} risk` : '',
    item.actionBias ? `Bias: ${item.actionBias}` : '',
    item.actionNote || '',
    'proculus.xyz'
  ].filter(Boolean).join(' • ').slice(0, 280);
}

function buildUnlockXPost(item) {
  return [
    `${item.token || item.project} unlock approaching`,
    buildUrgencyText(item.daysLeft, item.date),
    item.impactLevel ? `${item.impactLevel} impact` : '',
    item.impactNote || '',
    item.note || '',
    'proculus.xyz'
  ].filter(Boolean).join(' • ').slice(0, 280);
}

function openAdminXPostModal(content) {
  const modal = document.getElementById('admin-xpost-modal');
  const preview = document.getElementById('admin-xpost-preview');
  if (!modal || !preview) return;
  preview.textContent = content;
  modal.style.display = 'flex';
}

function closeAdminXPostModal() {
  const modal = document.getElementById('admin-xpost-modal');
  if (modal) modal.style.display = 'none';
}

function bindAdminXPostActions() {
  if (!adminToolsEnabled) return;
  document.querySelectorAll('.admin-xpost-trigger').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const type = button.dataset.xpostType;
      const index = Number(button.dataset.xpostIndex);
      if (type === 'market') {
        const item = marketIntelligenceState.items[index];
        if (item) openAdminXPostModal(buildMarketXPost(item));
      } else if (type === 'unlock') {
        const item = unlockCalendarState.items[index];
        if (item) openAdminXPostModal(buildUnlockXPost(item));
      }
    });
  });
}

async function loadUnlockCalendar() {
  const container = document.getElementById("unlock-calendar-container");
  if (!container) return;

  try {
    const res = await fetch('/unlock-calendar.json', {
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Unlock calendar request failed: ${res.status}`);
    }

    const items = await res.json();
    unlockCalendarState.items = Array.isArray(items) ? items : [];
    const allEntries = unlockCalendarState.items.slice(0, 5);
    const entries = unlockCalendarState.expanded ? allEntries : allEntries.slice(0, 3);
    const viewMoreButton = document.getElementById("unlock-calendar-view-more");

    if (!allEntries.length) {
      container.innerHTML = `
        <article class="unlock-calendar-card feature-box">
          <span class="card-label">No Feed</span>
          <h4>No unlock items are available yet.</h4>
          <p>Run the unlock calendar engine to generate the first scheduled unlocks.</p>
        </article>
      `;
      return;
    }

    container.innerHTML = entries.map((item) => `
      <article class="unlock-calendar-card feature-box">
        <div class="unlock-calendar-topline">
          <div>
            <span class="card-label">${escapeHtml(item.token || 'Token')}</span>
            <h4>${escapeHtml(item.project || 'Unknown Project')}</h4>
          </div>
          <span class="market-risk-pill risk-${String(item.impactLevel || 'Low').toLowerCase()}">${escapeHtml(item.impactLevel || 'Low')}</span>
        </div>
        <div class="unlock-calendar-meta">
          <span>${renderUnlockPressure(item.daysLeft, item.date || '')}</span>
          <span>${escapeHtml(item.type || 'Scheduled Unlock')}</span>
        </div>
        <p class="unlock-calendar-amount">${escapeHtml(item.amount || '')}</p>
        <p class="unlock-calendar-impact">${escapeHtml(item.impactNote || '')}</p>
        <p class="unlock-calendar-note">${escapeHtml(item.note || '')}</p>
        ${adminToolsEnabled ? `<div class="admin-xpost-inline"><button type="button" class="terminal-btn ghost-btn admin-xpost-trigger" data-xpost-type="unlock" data-xpost-index="${unlockCalendarState.items.indexOf(item)}">Generate X Post</button></div>` : ''}
      </article>
    `).join('');
    bindAdminXPostActions();
    bindSectionDensityControls();
    if (viewMoreButton) {
      viewMoreButton.style.display = allEntries.length > 3 ? "inline-flex" : "none";
      viewMoreButton.textContent = unlockCalendarState.expanded ? "Show Less" : "View More";
    }
  } catch (err) {
    console.error('Failed to load unlock calendar:', err);
    container.innerHTML = `
      <article class="unlock-calendar-card feature-box">
        <span class="card-label">Unavailable</span>
        <h4>Token unlock data could not be loaded.</h4>
        <p>The unlock feed is temporarily unavailable. Try again after refreshing the panel.</p>
      </article>
    `;
  }
}

function shortWallet(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function renderLockedCard(title) {
  return `
    <div class="locked-section-shell">
      <div class="locked-section-card">
        <span class="locked-section-badge">Locked Content</span>
        <h3>${title}</h3>
        <p>To view this content, please purchase a plan.</p>
        <div class="locked-section-actions">
          <button type="button" class="terminal-btn accent-btn upgrade-plan-trigger">Upgrade Plan</button>
          <span class="locked-section-note">Free users can browse the dashboard shell, but premium modules stay locked until purchase.</span>
        </div>
      </div>
    </div>
  `;
}

function lockSection(sectionId, selector, title) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.style.display = "block";
  const target = section.querySelector(selector);
  if (!target) return;
  target.innerHTML = renderLockedCard(title);
}

function getEmailPaymentUiState(emailUser = getStoredEmailUser(), paymentStatus = getStoredPaymentStatus()) {
  const currentPlan = getEmailUserPlan();
  const reviewStatus = String(paymentStatus?.status || "").toLowerCase();

  if (emailUser?.accessLevel === "paid" && currentPlan && currentPlan !== "free") {
    return "approved";
  }

  if (reviewStatus === "pending") {
    return "pending";
  }

  if (reviewStatus === "rejected") {
    return "rejected";
  }

  return "default";
}

function ensureEmailAccessBanner(emailUser, paymentStatus = getStoredPaymentStatus()) {
  let banner = document.getElementById("free-access-banner");
  if (!banner) {
    banner = document.createElement("section");
    banner.id = "free-access-banner";
    banner.className = "free-access-banner panel-card";
    const heroBand = document.querySelector(".hero-band");
    heroBand?.parentNode?.insertBefore(banner, heroBand.nextSibling);
  }

  const email = emailUser?.email ? `, ${escapeHtml(emailUser.email)}` : "";
  const currentPlan = getEmailUserPlan();
  const status = getEmailPaymentUiState(emailUser, paymentStatus);
  let label = "Free Dashboard";
  let heading = `Welcome${email}`;
  let message = "Your free account can access the dashboard shell. Premium research, signals, and integrations stay visible as locked modules until you purchase a plan.";
  let note = "Free users can browse the dashboard shell, but premium modules stay locked until purchase.";
  let action = '<button type="button" class="terminal-btn accent-btn upgrade-plan-trigger">Upgrade Plan</button>';

  if (status === "approved") {
    label = "Premium Access";
    heading = `Premium access active${email}`;
    message = `Your ${escapeHtml(currentPlan)} plan is active. Premium signals and research modules are unlocked.`;
    note = paymentStatus?.reviewedAt
      ? `Last crypto review completed ${escapeHtml(formatRelativeTime(paymentStatus.reviewedAt))}.`
      : `Current plan: ${escapeHtml(currentPlan)}.`;
    action = '<span class="email-access-status status-approved">Premium Active</span>';
  } else if (status === "pending") {
    label = "Payment Under Review";
    heading = `Payment under review${email}`;
    message = "Your crypto payment has been submitted and is awaiting owner verification. Premium access will activate after approval.";
    note = paymentStatus?.selectedNetwork
      ? `Submitted via ${escapeHtml(paymentStatus.selectedNetwork)} for ${escapeHtml(paymentStatus.selectedPlan || "selected plan")}.`
      : "Submitted crypto payment is awaiting verification.";
    action = '<span class="email-access-status status-pending">Under Review</span>';
  } else if (status === "rejected") {
    label = "Payment Rejected";
    heading = `Payment rejected${email}`;
    message = "Payment rejected";
    note = paymentStatus?.selectedNetwork
      ? `Last review: ${escapeHtml(paymentStatus.selectedNetwork)} payment for ${escapeHtml(paymentStatus.selectedPlan || "selected plan")}.`
      : "Your latest crypto payment was rejected.";
    action = '<button type="button" class="terminal-btn accent-btn retry-payment-trigger">Retry Payment</button>';
  }

  banner.innerHTML = `
    <div>
      <span class="card-label">${label}</span>
      <h2>${heading}</h2>
      <p>${message}</p>
      <small class="email-access-note">${note}</small>
    </div>
    <div class="email-access-actions">${action}</div>
  `;

  syncEmailActionStates();
}

function syncUpgradePlanSelection() {
  document.querySelectorAll(".upgrade-plan-card").forEach(card => {
    const selected = card.dataset.plan === selectedUpgradePlan;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function openUpgradeModal() {
  const modal = document.getElementById("upgrade-modal");
  if (!modal) return;
  const state = getEmailPaymentUiState();
  if (isEmailUser() && state === "approved") return;
  selectedUpgradePlan = localStorage.getItem("selectedPlan") || selectedUpgradePlan || "monthly";
  syncUpgradePlanSelection();
  syncEmailActionStates();
  if (isEmailUser() && state === "pending") {
    setUpgradeModalWarning("Your payment is under review.");
  } else {
    setUpgradeModalWarning("");
  }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeUpgradeModal() {
  const modal = document.getElementById("upgrade-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function setUpgradeModalWarning(message = "") {
  const modal = document.getElementById("upgrade-modal");
  if (!modal) return;

  let warning = document.getElementById("upgrade-modal-warning");
  if (!warning) {
    warning = document.createElement("p");
    warning.id = "upgrade-modal-warning";
    warning.style.margin = "12px 0 0";
    warning.style.color = "var(--orange)";
    warning.style.fontSize = "0.92rem";
    const actions = modal.querySelector(".modal-actions");
    actions?.parentNode?.insertBefore(warning, actions);
  }

  warning.textContent = message;
  warning.style.display = message ? "block" : "none";
}

function syncEmailActionStates() {
  const state = getEmailPaymentUiState();
  const isEmail = isEmailUser();

  document.querySelectorAll(".upgrade-plan-trigger").forEach(button => {
    button.classList.remove("button-hidden");
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    button.textContent = button.dataset.defaultLabel || button.textContent;

    if (!isEmail) {
      return;
    }

    if (state === "approved") {
      button.classList.add("button-hidden");
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      return;
    }

    if (state === "pending") {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.textContent = "Under Review";
      return;
    }

    if (state === "rejected") {
      button.textContent = "Retry Payment";
    }
  });

  const checkoutButton = document.getElementById("upgrade-modal-checkout");
  if (!checkoutButton) {
    return;
  }

  checkoutButton.classList.remove("button-hidden");
  checkoutButton.removeAttribute("aria-disabled");
  checkoutButton.disabled = false;

  if (!isEmail) {
    return;
  }

  if (state === "approved") {
    checkoutButton.classList.add("button-hidden");
    checkoutButton.setAttribute("aria-disabled", "true");
    return;
  }

  if (state === "pending") {
    checkoutButton.setAttribute("aria-disabled", "true");
    return;
  }
}

function bindUpgradeTriggers() {
  document.querySelectorAll(".upgrade-plan-trigger").forEach(button => {
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }
    if (button.dataset.boundUpgrade === "true") return;
    button.dataset.boundUpgrade = "true";
    button.addEventListener("click", (event) => {
      const state = getEmailPaymentUiState();
      if (isEmailUser() && state === "pending") {
        event.preventDefault();
        setUpgradeModalWarning("Your payment is under review.");
        return;
      }

      if (isEmailUser() && state === "rejected") {
        event.preventDefault();
        window.location.href = "/checkout.html";
        return;
      }

      openUpgradeModal();
    });
  });

  document.querySelectorAll(".retry-payment-trigger").forEach(button => {
    if (button.dataset.boundRetry === "true") return;
    button.dataset.boundRetry = "true";
    button.addEventListener("click", () => {
      window.location.href = "/checkout.html";
    });
  });

  document.querySelectorAll(".upgrade-plan-card").forEach(card => {
    if (card.dataset.boundPlan === "true") return;
    card.dataset.boundPlan = "true";
    const selectPlan = () => {
      selectedUpgradePlan = card.dataset.plan || "monthly";
      syncUpgradePlanSelection();
    };
    card.addEventListener("click", selectPlan);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPlan();
      }
    });
  });

  const checkoutButton = document.getElementById("upgrade-modal-checkout");
  if (checkoutButton && checkoutButton.dataset.boundCheckout !== "true") {
    checkoutButton.dataset.boundCheckout = "true";
    checkoutButton.addEventListener("click", (event) => {
      const state = getEmailPaymentUiState();
      if (isEmailUser() && state === "approved") {
        event.preventDefault();
        return;
      }

      if (isEmailUser() && state === "pending") {
        event.preventDefault();
        setUpgradeModalWarning("Your payment is under review.");
        return;
      }

      event.preventDefault();

      if (!selectedUpgradePlan || !["daily", "monthly", "yearly"].includes(selectedUpgradePlan)) {
        setUpgradeModalWarning("Please select a plan first.");
        return;
      }

      setUpgradeModalWarning("");
      localStorage.setItem("selectedPlan", selectedUpgradePlan);
      window.location.href = "/checkout.html";
    });
  }

  syncUpgradePlanSelection();
  syncEmailActionStates();
}

function applyFreeUserLocks() {
  const emailUser = getStoredEmailUser();
  ensureEmailAccessBanner(emailUser);
  lockSection("signals-section", "#signals-container", "Live Signals");
  lockSection("notifications-section", ".settings-card", "Notification Options");
  lockSection("api-section", ".features-grid", "API Access");
  lockSection("stocks-section", ".features-grid", "Stocks Overview");
  lockSection("nft-section", ".features-grid", "NFT Radar");
  lockSection("presale-section", ".features-grid", "Presale & Launches");
  lockSection("unlock-section", ".features-grid", "Token Unlock Calendar");
  const adminSection = document.getElementById("admin-section");
  if (adminSection) {
    adminSection.style.display = "none";
  }
  bindUpgradeTriggers();
}

async function syncEmailUserSession() {
  if (!isEmailUser()) {
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
    const data = await res.json();
    if (data.authenticated && data.user) {
      persistEmailUser(data.user);
      persistPaymentStatus(data.paymentStatus || null);
      return data.user;
    }
  } catch (err) {
    console.error("Free user session sync failed:", err);
    return getStoredEmailUser();
  }

  clearEmailUser();
  if (!localStorage.getItem("walletAddress")) {
    window.location.href = "intro.html";
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIsoDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRelativeTime(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatUsd(value) {
  if (typeof value !== "number") return "...";
  return value >= 1000
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPct(value) {
  if (typeof value !== "number") return "0.00%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function animateNumber(node, nextValue, formatter = value => String(Math.round(value))) {
  if (!node) return;
  const current = Number(node.dataset.value || 0);
  const start = Number.isFinite(current) ? current : 0;
  const end = Number(nextValue) || 0;
  const duration = 400;
  const started = performance.now();
  node.dataset.value = String(end);

  function frame(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (end - start) * eased;
    node.textContent = formatter(value);
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function calcChange(history) {
  if (!history.length) return 0;
  const current = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : current;
  if (!previous) return 0;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function updateChangeBadge(id, change) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
  node.className = `admin-stat-change ${change > 0 ? "up" : change < 0 ? "down" : "neutral"}`;
}

function rememberHistory(key, value) {
  const series = adminState.history[key];
  if (!Array.isArray(series)) return;
  series.push(Number(value) || 0);
  if (series.length > 18) series.shift();
}

function renderSparkline(id, values, accent = "var(--accent)") {
  const node = document.getElementById(id);
  if (!node) return;
  if (!values.length) {
    node.innerHTML = "";
    return;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 120;
    const y = 28 - ((value - min) / range) * 24;
    return `${x},${y}`;
  }).join(" ");

  node.innerHTML = `
    <polyline points="${points}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
  `;
}

function getEventClass(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("login")) return "event-login";
  if (normalized.includes("grant")) return "event-grant-access";
  if (normalized.includes("override")) return "event-override-plan";
  return "event-generic";
}

async function fetchMarketSnapshot() {
  try {
    const [pricesRes, globalRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${TICKER_IDS}&vs_currencies=usd&include_24hr_change=true`),
      fetch("https://api.coingecko.com/api/v3/global")
    ]);

    const data = await pricesRes.json();
    const globalData = await globalRes.json();

    const btcNode = document.getElementById("btc-price");
    const ethNode = document.getElementById("eth-price");
    if (btcNode) btcNode.textContent = formatUsd(data.bitcoin?.usd);
    if (ethNode) ethNode.textContent = formatUsd(data.ethereum?.usd);

    const ticker = document.getElementById("crypto-ticker");
    if (!ticker) return;

    const items = TICKER_ASSETS
      .map(([label, id]) => [label, data[id]])
      .filter(([, item]) => item && typeof item.usd === "number");

    const btcDominance = globalData?.data?.market_cap_percentage?.btc;
    if (typeof btcDominance === "number") {
      items.push(["BTC DOM", { usd: btcDominance, usd_24h_change: 0, isDominance: true }]);
    }

    const renderGroup = () => items.map(([label, item]) => {
      const change = item.usd_24h_change ?? 0;
      const cls = change >= 0 ? "up" : "down";
      const value = item.isDominance ? `${item.usd.toFixed(2)}%` : formatUsd(item.usd);
      const changeValue = item.isDominance ? "Market share" : formatPct(change);
      return `
        <div class="ticker-pill ${cls}">
          <span class="ticker-symbol">${label}</span>
          <strong>${value}</strong>
          <small>${changeValue}</small>
        </div>
      `;
    }).join("");

    ticker.innerHTML = `<div class="ticker-group">${renderGroup()}</div><div class="ticker-group">${renderGroup()}</div>`;
  } catch (err) {
    console.error("Market snapshot error:", err);
  }
}

function getSuggestedStance(signal) {
  switch (String(signal || '').toUpperCase()) {
    case 'SHORT':
      return 'Consider short setups';
    case 'LONG':
      return 'Look for long entries';
    default:
      return 'Stay on the sidelines';
  }
}

function getUrgencyMessage(urgency) {
  const value = String(urgency || '').trim();
  return value && value !== 'Normal' ? value : '';
}

async function loadSignals() {
  const container = document.getElementById("signals-container");
  const topSignalContainer = document.getElementById("top-signal-container");
  const filters = document.getElementById("signals-filters");
  const actions = document.getElementById("signals-inline-actions");

  if (isFreeEmailUser()) {
    if (topSignalContainer) topSignalContainer.style.display = "none";
    if (filters) filters.style.display = "none";
    if (actions) actions.style.display = "none";
    if (container) {
      container.innerHTML = renderLockedCard("Live Signals");
      bindUpgradeTriggers();
    }
    return;
  }

  try {
    const [res, decisionRes] = await Promise.all([
      fetch("/signals-live.json", {
        headers: { Accept: "application/json" }
      }),
      fetch("/decision-repository.json", {
        headers: { Accept: "application/json" }
      }).catch(() => null)
    ]);
    if (!res.ok) {
      throw new Error(`Live signal request failed: ${res.status}`);
    }

    const signals = await res.json();
    const decisionRepository = decisionRes && decisionRes.ok ? await decisionRes.json() : [];
    const emailPlan = getEmailUserPlan();
    const plan = emailPlan && emailPlan !== "free" ? emailPlan : localStorage.getItem("selectedPlan");
    const allowedSignals = isOwnerWallet() ? signals.length : plan === "yearly" ? 5 : plan === "monthly" ? 4 : 3;
    if (!container) return;

    const allSignals = Array.isArray(signals) ? signals : [];
    if (topSignalContainer) topSignalContainer.style.display = "";
    if (filters) filters.style.display = "";

    signalsState.items = isOwnerWallet() ? allSignals : allSignals.slice(0, allowedSignals);
    signalsState.decisionRepository = Array.isArray(decisionRepository) ? decisionRepository : [];
    signalsState.expanded = false;
    signalsState.signal = "all";
    signalsState.strength = "all";
    signalsState.search = "";

    const searchInput = document.getElementById("signals-search");
    const signalFilter = document.getElementById("signals-signal-filter");
    const strengthFilter = document.getElementById("signals-strength-filter");
    if (searchInput) searchInput.value = "";
    if (signalFilter) signalFilter.value = "all";
    if (strengthFilter) strengthFilter.value = "all";

    if (!signalsState.items.length) {
      if (topSignalContainer) {
        topSignalContainer.innerHTML = `
          <span class="card-label">Top Signal</span>
          <h3>No live signals available</h3>
          <p>The signal engine has not produced any live outputs yet.</p>
        `;
      }
      container.innerHTML = `
        <article class="signal-box wait">
          <h3>No live signals available</h3>
          <p>The signal engine has not produced any live outputs yet.</p>
        </article>
      `;
      return;
    }

    const topSignal = [...signalsState.items].sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0];
    if (topSignalContainer && topSignal) {
      const topDirection = String(topSignal.signal || 'WAIT').toLowerCase();
      const decisionEntry = Array.isArray(signalsState.decisionRepository)
        ? signalsState.decisionRepository.find((item) => String(item.asset || '').toUpperCase() === String(topSignal.asset || '').toUpperCase())
        : null;
      const actionBias = decisionEntry?.bias || 'Neutral';
      const actionNote = decisionEntry?.news?.[0]?.actionNote || 'No strong directional bias';
      const urgencyMessage = getUrgencyMessage(decisionEntry?.urgency || '');
      const suggestedStance = getSuggestedStance(topSignal.signal);
      topSignalContainer.className = `top-signal-card panel-card ${topDirection}`;
      topSignalContainer.innerHTML = `
        <div class="top-signal-head">
          <span class="card-label">Top Signal</span>
          <span class="signal-direction-pill ${topDirection}">${escapeHtml(topSignal.signal || 'WAIT')}</span>
        </div>
        <h3>${escapeHtml(topSignal.asset || 'Asset')}</h3>
        <div class="top-signal-meta">
          <span>Confidence: ${escapeHtml(topSignal.confidence ?? 0)}%</span>
          <span>Strength: ${escapeHtml(topSignal.strength || 'Weak')}</span>
        </div>
        <p class="top-signal-reason">${escapeHtml(topSignal.reason || 'No explanation available.')}</p>
        <div class="top-signal-action-layer">
          <span class="card-label">Action</span>
          <div class="top-signal-action-bias bias-${String(actionBias || 'Neutral').toLowerCase()}">Bias: ${escapeHtml(actionBias)}</div>
          <div class="top-signal-action-note">${escapeHtml(actionNote)}</div>
          ${urgencyMessage ? `<div class="top-signal-urgency">${escapeHtml(urgencyMessage)}</div>` : ''}
          <div class="top-signal-stance">Suggested stance: ${escapeHtml(suggestedStance)}</div>
        </div>
        <div class="top-signal-execution-layer">
          <span class="card-label">Execution</span>
          <div class="top-signal-execution-row"><strong>Entry</strong><span>${escapeHtml(topSignal.entryHint || 'No clear setup')}</span></div>
          <div class="top-signal-execution-row"><strong>Timing</strong><span>${escapeHtml(topSignal.timingHint || 'Wait for confirmation')}</span></div>
          <div class="top-signal-execution-row"><strong>Risk</strong><span>${escapeHtml(topSignal.riskNote || 'Standard execution risk applies')}</span></div>
        </div>
      `;
    }
    bindSignalControls();
    renderSignalsList();
  } catch (err) {
    console.error("Signal fetch error:", err);
  }
}

function getFilteredSignals() {
  return signalsState.items.filter((signal) => {
    const signalValue = String(signal.signal || "WAIT").toUpperCase();
    const strengthValue = String(signal.strength || "Weak");
    const assetValue = String(signal.asset || "").toLowerCase();

    const matchesSignal = signalsState.signal === "all" || signalValue === signalsState.signal;
    const matchesStrength = signalsState.strength === "all" || strengthValue === signalsState.strength;
    const matchesSearch = !signalsState.search || assetValue.includes(signalsState.search);

    return matchesSignal && matchesStrength && matchesSearch;
  });
}

function renderSignalsList() {
  const container = document.getElementById("signals-container");
  const actions = document.getElementById("signals-inline-actions");
  const toggle = document.getElementById("signals-view-more");
  if (!container) return;

  const filteredSignals = getFilteredSignals();
  if (!filteredSignals.length) {
    container.innerHTML = `
      <article class="signal-box wait">
        <h3>No matching signals</h3>
        <p>Adjust the signal filters or search to view more assets.</p>
      </article>
    `;
    if (actions) actions.style.display = "none";
    return;
  }

  const visibleSignals = signalsState.expanded ? filteredSignals : filteredSignals.slice(0, 5);
  container.innerHTML = visibleSignals.map((signal) => {
    const direction = String(signal.signal || "WAIT").toLowerCase();
    return `
      <article class="signal-box ${direction}">
        <div class="signal-header-row">
          <h3>${escapeHtml(signal.asset || "Asset")}</h3>
          <span class="signal-direction-pill ${direction}">${escapeHtml(signal.signal || "WAIT")}</span>
        </div>
        <div class="signal-meta-row">
          <p class="signal-confidence">Confidence: ${escapeHtml(signal.confidence ?? 0)}%</p>
          <span class="signal-strength-pill">${escapeHtml(signal.strength || "Weak")}</span>
        </div>
        <p>Convergence: ${escapeHtml(signal.convergenceScore || 0)}</p>
        <div class="signal-comment">${escapeHtml(signal.reason || "No explanation available.")}</div>
      </article>
    `;
  }).join("");

  if (actions && toggle) {
    const needsToggle = filteredSignals.length > 5;
    actions.style.display = needsToggle ? "flex" : "none";
    toggle.textContent = signalsState.expanded ? "Show Less" : "View More";
  }
}

function bindSignalControls() {
  const searchInput = document.getElementById("signals-search");
  const signalFilter = document.getElementById("signals-signal-filter");
  const strengthFilter = document.getElementById("signals-strength-filter");
  const toggle = document.getElementById("signals-view-more");

  if (searchInput && searchInput.dataset.boundSignals !== "true") {
    searchInput.dataset.boundSignals = "true";
    searchInput.addEventListener("input", () => {
      signalsState.search = String(searchInput.value || "").trim().toLowerCase();
      signalsState.expanded = false;
      renderSignalsList();
    });
  }

  if (signalFilter && signalFilter.dataset.boundSignals !== "true") {
    signalFilter.dataset.boundSignals = "true";
    signalFilter.addEventListener("change", () => {
      signalsState.signal = signalFilter.value || "all";
      signalsState.expanded = false;
      renderSignalsList();
    });
  }

  if (strengthFilter && strengthFilter.dataset.boundSignals !== "true") {
    strengthFilter.dataset.boundSignals = "true";
    strengthFilter.addEventListener("change", () => {
      signalsState.strength = strengthFilter.value || "all";
      signalsState.expanded = false;
      renderSignalsList();
    });
  }

  if (toggle && toggle.dataset.boundSignals !== "true") {
    toggle.dataset.boundSignals = "true";
    toggle.addEventListener("click", () => {
      signalsState.expanded = !signalsState.expanded;
      renderSignalsList();
    });
  }
}

function controlSectionsByPlan() {
  const plan = localStorage.getItem("selectedPlan");
  const showIf = selector => document.querySelectorAll(selector).forEach(el => { el.style.display = "block"; });
  const hideIf = selector => document.querySelectorAll(selector).forEach(el => { el.style.display = "none"; });

  showIf("#signals-section");
  showIf("#notifications-section");

  if (isOwnerWallet()) {
    showIf("#api-section");
    showIf("#stocks-section");
    showIf("#nft-section");
    showIf("#presale-section");
    showIf("#unlock-section");
    return;
  }

  if (isEmailUser()) {
    ensureEmailAccessBanner(getStoredEmailUser(), getStoredPaymentStatus());
  }

  if (isFreeEmailUser()) {
    showIf("#api-section");
    showIf("#stocks-section");
    showIf("#nft-section");
    showIf("#presale-section");
    showIf("#unlock-section");
    applyFreeUserLocks();
    return;
  }

  const freeBanner = document.getElementById("free-access-banner");
  if (freeBanner && !isEmailUser()) freeBanner.remove();

  if (!plan) return;

  if (plan === "monthly" || plan === "yearly") {
    showIf("#api-section");
    showIf("#stocks-section");
  } else {
    hideIf("#api-section");
    hideIf("#stocks-section");
  }

  if (plan === "yearly") {
    showIf("#nft-section");
    showIf("#presale-section");
    showIf("#unlock-section");
  } else {
    hideIf("#nft-section");
    hideIf("#presale-section");
    hideIf("#unlock-section");
  }
}

async function requestAdminChallenge(walletAddress) {
  const res = await fetch(`${API_BASE}/admin/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ walletAddress })
  });
  return res.json();
}

async function verifyAdminChallenge(challengeId, walletAddress, signature) {
  const res = await fetch(`${API_BASE}/admin/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ challengeId, walletAddress, signature })
  });
  return res.json();
}

async function getAdminAuthStatus() {
  const res = await fetch(`${API_BASE}/admin/auth/status`, { credentials: "include" });
  return res.json();
}

async function signAdminMessage(walletAddress, message) {
  if (!window.ethereum) throw new Error("Wallet provider not available");
  return window.ethereum.request({ method: "personal_sign", params: [message, walletAddress] });
}

async function ensureAdminAuth() {
  if (!isOwnerWallet()) return false;
  const status = await getAdminAuthStatus();
  if (status.authenticated) return true;

  const walletAddress = localStorage.getItem("walletAddress");
  if (!walletAddress) return false;

  const challenge = await requestAdminChallenge(walletAddress);
  if (!challenge.challengeId || !challenge.message) throw new Error(challenge.error || "Failed to get admin challenge");

  const signature = await signAdminMessage(walletAddress, challenge.message);
  const verification = await verifyAdminChallenge(challenge.challengeId, walletAddress, signature);
  if (!verification.authenticated) throw new Error(verification.error || "Admin authentication failed");
  return true;
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { ...(options.headers || {}) }
  });

  if (res.status === 401 || res.status === 403) throw new Error("Admin authentication required");
  return res.json();
}

function getAdminInputValue(id) {
  return document.getElementById(id)?.value?.trim().toLowerCase() || "";
}

function setAdminRefreshStatus(label, note) {
  const statusNode = document.getElementById("admin-stat-refresh");
  const noteNode = document.getElementById("admin-stat-refresh-note");
  if (statusNode) statusNode.textContent = label;
  if (noteNode) noteNode.textContent = note;
}

function getFilteredUsers() {
  const search = getAdminInputValue("admin-user-search");
  const planFilter = getAdminInputValue("admin-user-plan-filter") || "all";
  const accessFilter = getAdminInputValue("admin-user-access-filter") || "all";

  return adminState.users.filter(user => {
    const wallet = String(user.walletAddress || "").toLowerCase();
    const plan = String(user.plan || "none").toLowerCase() || "none";
    const source = String(user.source || "").toLowerCase();
    const freeAccess = Boolean(user.freeAccess);
    const matchesSearch = !search || [wallet, plan, source].some(value => value.includes(search));
    const matchesPlan = planFilter === "all" || plan === planFilter;
    const matchesAccess = accessFilter === "all" || (accessFilter === "free" && freeAccess) || (accessFilter === "paid" && !freeAccess);
    return matchesSearch && matchesPlan && matchesAccess;
  });
}

function getFilteredSubscriptions() {
  const search = getAdminInputValue("admin-subscription-search");
  const planFilter = getAdminInputValue("admin-subscription-plan-filter") || "all";
  const statusFilter = getAdminInputValue("admin-subscription-status-filter") || "all";

  return adminState.subscriptions.filter(item => {
    const wallet = String(item.walletAddress || "").toLowerCase();
    const plan = String(item.plan || "").toLowerCase();
    const source = String(item.source || "").toLowerCase();
    const status = String(item.status || "active").toLowerCase();
    const reason = String(item.reason || "").toLowerCase();
    const matchesSearch = !search || [wallet, plan, source, status, reason].some(value => value.includes(search));
    const matchesPlan = planFilter === "all" || plan === planFilter;
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });
}

function getFilteredEvents() {
  const search = getAdminInputValue("admin-event-search");
  return adminState.events.filter(event => {
    const haystack = [event.type, event.walletAddress, event.detail, event.createdAt].map(value => String(value || "").toLowerCase());
    return !search || haystack.some(value => value.includes(search));
  });
}

function getFilteredPendingPayments() {
  const search = getAdminInputValue("admin-pending-search");
  const statusFilter = getAdminInputValue("admin-pending-status-filter") || "all";

  return adminState.pendingPayments.filter(item => {
    const haystack = [item.email, item.selectedPlan, item.selectedNetwork, item.amount, item.walletAddressShown, item.timestamp, item.status]
      .map(value => String(value || "").toLowerCase());
    const matchesSearch = !search || haystack.some(value => value.includes(search));
    const status = String(item.status || "pending").toLowerCase();
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    return matchesSearch && matchesStatus;
  });
}

function updateAdminStats() {
  const users = adminState.users;
  const subscriptions = adminState.subscriptions;
  const events = adminState.events;
  const filteredUsers = getFilteredUsers();
  const freeUsers = users.filter(user => user.freeAccess).length;
  const activeSubscriptions = subscriptions.filter(item => String(item.status || "active").toLowerCase() === "active").length;
  const yearlyCount = subscriptions.filter(item => String(item.plan || "").toLowerCase() === "yearly").length;
  const monthlyCount = subscriptions.filter(item => String(item.plan || "").toLowerCase() === "monthly").length;
  const dailyCount = subscriptions.filter(item => String(item.plan || "").toLowerCase() === "daily").length;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
  const lastEvent = events[0];

  rememberHistory("users", users.length);
  rememberHistory("subscriptions", subscriptions.length);
  rememberHistory("yearly", yearlyCount);
  rememberHistory("events", events.length);
  rememberHistory("visibleUsers", filteredUsers.length);
  rememberHistory("refresh", adminState.history.refresh.length ? adminState.history.refresh[adminState.history.refresh.length - 1] + 1 : 1);

  animateNumber(document.getElementById("admin-stat-users"), users.length);
  animateNumber(document.getElementById("admin-stat-subscriptions"), subscriptions.length);
  animateNumber(document.getElementById("admin-stat-yearly"), yearlyCount);
  animateNumber(document.getElementById("admin-stat-events"), events.length);
  animateNumber(document.getElementById("admin-stat-visible-users"), filteredUsers.length);

  document.getElementById("admin-stat-free").textContent = `${freeUsers} free access`;
  document.getElementById("admin-stat-active").textContent = `${activeSubscriptions} active`;
  document.getElementById("admin-stat-monthly").textContent = `${monthlyCount} monthly / ${dailyCount} daily`;
  document.getElementById("admin-stat-last-event").textContent = lastEvent ? `${lastEvent.type || "event"} · ${formatRelativeTime(lastEvent.createdAt)}` : "No recent events";
  document.getElementById("admin-stat-user-pages").textContent = `${totalPages} pages`;

  updateChangeBadge("admin-stat-users-change", calcChange(adminState.history.users));
  updateChangeBadge("admin-stat-subscriptions-change", calcChange(adminState.history.subscriptions));
  updateChangeBadge("admin-stat-yearly-change", calcChange(adminState.history.yearly));
  updateChangeBadge("admin-stat-events-change", calcChange(adminState.history.events));
  updateChangeBadge("admin-stat-visible-users-change", calcChange(adminState.history.visibleUsers));

  renderSparkline("admin-spark-users", adminState.history.users);
  renderSparkline("admin-spark-subscriptions", adminState.history.subscriptions, "var(--blue)");
  renderSparkline("admin-spark-yearly", adminState.history.yearly, "var(--orange)");
  renderSparkline("admin-spark-events", adminState.history.events);
  renderSparkline("admin-spark-visible-users", adminState.history.visibleUsers, "var(--blue)");
  renderSparkline("admin-spark-refresh", adminState.history.refresh, "var(--accent)");
}

function fillActionForms(walletAddress) {
  const grantWallet = document.getElementById("grant-wallet");
  const overrideWallet = document.getElementById("override-wallet");
  const userSearch = document.getElementById("admin-user-search");
  const subscriptionSearch = document.getElementById("admin-subscription-search");
  const eventSearch = document.getElementById("admin-event-search");
  if (grantWallet) grantWallet.value = walletAddress;
  if (overrideWallet) overrideWallet.value = walletAddress;
  if (userSearch) userSearch.value = walletAddress;
  if (subscriptionSearch) subscriptionSearch.value = walletAddress;
  if (eventSearch) eventSearch.value = walletAddress;
  adminState.userPage = 1;
  renderAdminData();
}

async function runInlineGrant(walletAddress) {
  const result = document.getElementById("grant-access-result");
  try {
    const data = await adminFetch("/admin/grant-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, reason: "Inline quick grant" })
    });
    if (result) result.textContent = data.message || "Completed";
    await refreshAdminData("Grant");
  } catch (err) {
    if (result) result.textContent = err.message;
  }
}

async function runInlineOverride(walletAddress) {
  const result = document.getElementById("override-plan-result");
  const plan = document.getElementById("override-plan")?.value || "monthly";
  try {
    const data = await adminFetch("/admin/override-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, plan, reason: "Inline quick override" })
    });
    if (result) result.textContent = data.message || "Completed";
    await refreshAdminData("Override");
  } catch (err) {
    if (result) result.textContent = err.message;
  }
}

function renderUsersTable() {
  const container = document.getElementById("admin-users-list");
  if (!container) return;

  const filtered = getFilteredUsers();
  const totalPages = Math.max(1, Math.ceil(filtered.length / USER_PAGE_SIZE));
  adminState.userPage = Math.min(adminState.userPage, totalPages);
  const start = (adminState.userPage - 1) * USER_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + USER_PAGE_SIZE);

  if (!pageItems.length) {
    container.innerHTML = '<div class="admin-empty">No users match the current filters.</div>';
  } else {
    container.innerHTML = `
      <div class="admin-table-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Plan</th>
              <th>Access</th>
              <th>Source</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map(user => {
              const plan = String(user.plan || "none").toLowerCase() || "none";
              const wallet = escapeHtml(user.walletAddress || "-");
              return `
                <tr>
                  <td class="admin-wallet-cell">
                    ${escapeHtml(shortWallet(user.walletAddress || "------"))}
                    <span class="admin-meta">${wallet}</span>
                  </td>
                  <td><span class="admin-pill ${plan === "yearly" ? "good" : plan === "monthly" ? "warn" : "muted"}">${escapeHtml(plan)}</span></td>
                  <td><div class="admin-pill-row"><span class="admin-pill ${user.freeAccess ? "good" : "muted"}">${user.freeAccess ? "free" : "subscriber"}</span></div></td>
                  <td>${escapeHtml(user.source || "unknown")}</td>
                  <td>${escapeHtml(formatRelativeTime(user.updatedAt))}<span class="admin-meta">${escapeHtml(formatIsoDate(user.updatedAt))}</span></td>
                  <td>
                    <div class="admin-user-actions">
                      <button class="admin-action-btn" type="button" data-action="grant" data-wallet="${wallet}">Grant</button>
                      <button class="admin-action-btn" type="button" data-action="override" data-wallet="${wallet}">Override</button>
                      <button class="admin-action-btn" type="button" data-action="view" data-wallet="${wallet}">View</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  const info = document.getElementById("admin-users-page-info");
  const prev = document.getElementById("admin-users-prev");
  const next = document.getElementById("admin-users-next");
  if (info) info.textContent = `Page ${adminState.userPage} of ${totalPages}`;
  if (prev) prev.disabled = adminState.userPage <= 1;
  if (next) next.disabled = adminState.userPage >= totalPages;
}

function renderSubscriptionsTable() {
  const container = document.getElementById("admin-subscriptions-list");
  if (!container) return;
  const filtered = getFilteredSubscriptions();

  if (!filtered.length) {
    container.innerHTML = '<div class="admin-empty">No subscriptions match the current filters.</div>';
    return;
  }

  container.innerHTML = `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Source</th>
            <th>Reason</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => {
            const plan = String(item.plan || "-").toLowerCase();
            const status = String(item.status || "active").toLowerCase();
            return `
              <tr>
                <td class="admin-wallet-cell">${escapeHtml(shortWallet(item.walletAddress || "------"))}<span class="admin-meta">${escapeHtml(item.walletAddress || "-")}</span></td>
                <td><span class="admin-pill ${plan === "yearly" ? "good" : plan === "monthly" ? "warn" : "muted"}">${escapeHtml(plan)}</span></td>
                <td><span class="admin-pill ${status === "active" ? "good" : "muted"}">${escapeHtml(status)}</span></td>
                <td>${escapeHtml(item.source || "manual")}</td>
                <td>${escapeHtml(item.reason || "-")}</td>
                <td>${escapeHtml(formatRelativeTime(item.updatedAt))}<span class="admin-meta">${escapeHtml(formatIsoDate(item.updatedAt))}</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPendingPaymentsTable() {
  const container = document.getElementById("admin-pending-payments-list");
  if (!container) return;
  const filtered = getFilteredPendingPayments();

  if (!filtered.length) {
    container.innerHTML = '<div class="admin-empty">No crypto payment submissions match the current filters.</div>';
    return;
  }

  container.innerHTML = `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Plan</th>
            <th>Network</th>
            <th>Amount</th>
            <th>Destination</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => {
            const status = String(item.status || "pending").toLowerCase();
            const statusClass = status === "approved" ? "good" : status === "pending" ? "warn" : "muted";
            const shortDestination = item.walletAddressShown || item.address || "------";
            const actions = status === "pending"
              ? `<div class="admin-user-actions" style="opacity:1;transform:none;">
                  <button class="admin-action-btn" type="button" data-pending-action="approve" data-payment-id="${escapeHtml(item.id || "")}">Approve</button>
                  <button class="admin-action-btn" type="button" data-pending-action="reject" data-payment-id="${escapeHtml(item.id || "")}">Reject</button>
                </div>`
              : `<span class="admin-meta">Reviewed ${escapeHtml(formatRelativeTime(item.reviewedAt || item.updatedAt || item.timestamp))}</span>`;

            return `
              <tr>
                <td class="admin-wallet-cell">${escapeHtml(item.email || "-")}</td>
                <td><span class="admin-pill ${item.selectedPlan === "yearly" ? "good" : item.selectedPlan === "monthly" ? "warn" : "muted"}">${escapeHtml(item.selectedPlan || "-")}</span></td>
                <td>${escapeHtml(item.selectedNetwork || "-")}</td>
                <td>${escapeHtml(item.amount || "-")}</td>
                <td class="admin-wallet-cell">${escapeHtml(shortWallet(shortDestination))}<span class="admin-meta">${escapeHtml(shortDestination)}</span></td>
                <td>${escapeHtml(formatRelativeTime(item.timestamp))}<span class="admin-meta">${escapeHtml(formatIsoDate(item.timestamp))}</span></td>
                <td><span class="admin-pill ${statusClass}">${escapeHtml(status)}</span></td>
                <td>${actions}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEventsList() {
  const container = document.getElementById("admin-events-list");
  if (!container) return;
  const filtered = getFilteredEvents();
  const newKeys = new Set(filtered.map(event => `${event.type}|${event.walletAddress}|${event.createdAt}`));

  if (!filtered.length) {
    container.innerHTML = '<div class="admin-empty">No events match the current search.</div>';
    adminState.previousEventKeys = newKeys;
    return;
  }

  container.innerHTML = `
    <div class="admin-events-list">
      ${filtered.map((event, index) => {
        const key = `${event.type}|${event.walletAddress}|${event.createdAt}`;
        const isNew = !adminState.previousEventKeys.has(key);
        return `
          <div class="admin-event-row ${index === 0 ? "live" : ""} ${getEventClass(event.type)} ${isNew ? "new-event" : ""}">
            <div class="admin-event-top">
              <strong>${escapeHtml(event.type || "event")}</strong>
              <span class="admin-pill muted">${escapeHtml(formatRelativeTime(event.createdAt))}</span>
            </div>
            <div class="admin-event-detail">
              Wallet: ${escapeHtml(event.walletAddress || "-")}
              <br>
              Detail: ${escapeHtml(event.detail || "-")}
            </div>
            <div class="admin-meta">${escapeHtml(formatIsoDate(event.createdAt))}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  adminState.previousEventKeys = newKeys;
}

function renderAdminData() {
  updateAdminStats();
  renderUsersTable();
  renderSubscriptionsTable();
  renderPendingPaymentsTable();
  renderEventsList();
}

function resetUserPagination() {
  adminState.userPage = 1;
  renderAdminData();
}

function applyUserQuickFilter(button) {
  document.querySelectorAll(".admin-quick-filter").forEach(node => node.classList.toggle("active", node === button));
  const plan = button.dataset.plan || "all";
  const access = button.dataset.access || "all";
  const planSelect = document.getElementById("admin-user-plan-filter");
  const accessSelect = document.getElementById("admin-user-access-filter");
  if (planSelect) planSelect.value = plan;
  if (accessSelect) accessSelect.value = access;
  resetUserPagination();
}

function bindAdminFilters() {
  [
    "admin-user-search",
    "admin-user-plan-filter",
    "admin-user-access-filter",
    "admin-subscription-search",
    "admin-subscription-plan-filter",
    "admin-subscription-status-filter",
    "admin-pending-search",
    "admin-pending-status-filter",
    "admin-event-search"
  ].forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    const eventName = element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, () => {
      if (id.startsWith("admin-user-")) adminState.userPage = 1;
      renderAdminData();
    });
  });

  document.querySelectorAll(".admin-quick-filter").forEach(button => {
    button.addEventListener("click", () => applyUserQuickFilter(button));
  });

  document.getElementById("admin-users-prev")?.addEventListener("click", () => {
    if (adminState.userPage > 1) {
      adminState.userPage -= 1;
      renderAdminData();
    }
  });

  document.getElementById("admin-users-next")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredUsers().length / USER_PAGE_SIZE));
    if (adminState.userPage < totalPages) {
      adminState.userPage += 1;
      renderAdminData();
    }
  });

  document.getElementById("admin-users-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const walletAddress = button.dataset.wallet || "";
    const action = button.dataset.action;
    if (!walletAddress) return;

    if (action === "view") {
      fillActionForms(walletAddress);
      document.getElementById("grant-wallet")?.focus();
      return;
    }

    if (action === "grant") {
      await runInlineGrant(walletAddress);
      return;
    }

    if (action === "override") {
      await runInlineOverride(walletAddress);
    }
  });

  document.getElementById("admin-pending-payments-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-pending-action]");
    if (!button) return;
    const paymentId = button.dataset.paymentId || "";
    const action = button.dataset.pendingAction;
    if (!paymentId) return;

    if (action === "approve") {
      await submitPendingPaymentDecision(paymentId, "approve");
      return;
    }

    if (action === "reject") {
      await submitPendingPaymentDecision(paymentId, "reject");
    }
  });
}

async function loadAdminUsers() {
  const data = await adminFetch("/admin/users");
  adminState.users = Array.isArray(data.users) ? data.users : [];
}

async function loadAdminSubscriptions() {
  const data = await adminFetch("/admin/subscriptions");
  adminState.subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
}

async function loadAdminEvents() {
  const data = await adminFetch("/admin/events");
  adminState.events = Array.isArray(data.events) ? data.events : [];
}

async function loadAdminPendingPayments() {
  const data = await adminFetch("/admin/pending-crypto-payments");
  adminState.pendingPayments = Array.isArray(data.payments) ? data.payments : [];
}

async function refreshAdminData(source = "Refresh") {
  const usersContainer = document.getElementById("admin-users-list");
  const subscriptionsContainer = document.getElementById("admin-subscriptions-list");
  const pendingContainer = document.getElementById("admin-pending-payments-list");
  const eventsContainer = document.getElementById("admin-events-list");
  setAdminRefreshStatus(source, "Syncing owner dashboard...");

  try {
    await Promise.all([loadAdminUsers(), loadAdminSubscriptions(), loadAdminPendingPayments(), loadAdminEvents()]);
    renderAdminData();
    setAdminRefreshStatus("Live", `Last sync ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  } catch (err) {
    if (usersContainer) usersContainer.innerHTML = `<div class="admin-empty">${escapeHtml(err.message)}</div>`;
    if (subscriptionsContainer) subscriptionsContainer.innerHTML = `<div class="admin-empty">${escapeHtml(err.message)}</div>`;
    if (pendingContainer) pendingContainer.innerHTML = `<div class="admin-empty">${escapeHtml(err.message)}</div>`;
    if (eventsContainer) eventsContainer.innerHTML = `<div class="admin-empty">${escapeHtml(err.message)}</div>`;
    setAdminRefreshStatus("Error", err.message);
  }
}

async function submitPendingPaymentDecision(paymentId, decision) {
  const endpoint = `/admin/pending-crypto-payments/${encodeURIComponent(paymentId)}/${decision}`;
  await adminFetch(endpoint, { method: "POST" });
  await refreshAdminData(decision === "approve" ? "Approve" : "Reject");
}

async function submitGrantAccess(event) {
  event.preventDefault();
  const walletAddress = document.getElementById("grant-wallet").value.trim();
  const reason = document.getElementById("grant-reason").value.trim();
  const result = document.getElementById("grant-access-result");

  try {
    const data = await adminFetch("/admin/grant-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, reason })
    });
    if (result) result.textContent = data.message || "Completed";
    await refreshAdminData("Grant");
  } catch (err) {
    if (result) result.textContent = err.message;
  }
}

async function submitOverridePlan(event) {
  event.preventDefault();
  const walletAddress = document.getElementById("override-wallet").value.trim();
  const plan = document.getElementById("override-plan").value;
  const reason = document.getElementById("override-reason").value.trim();
  const result = document.getElementById("override-plan-result");

  try {
    const data = await adminFetch("/admin/override-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, plan, reason })
    });
    if (result) result.textContent = data.message || "Completed";
    await refreshAdminData("Override");
  } catch (err) {
    if (result) result.textContent = err.message;
  }
}

function startAdminPolling() {
  if (adminState.refreshTimer) clearInterval(adminState.refreshTimer);
  adminState.refreshTimer = setInterval(() => { refreshAdminData("Auto"); }, 30000);
}

async function initAdminPanel() {
  if (!isOwnerWallet()) return;
  const adminSection = document.getElementById("admin-section");
  if (!adminSection) return;

  try {
    const authenticated = await ensureAdminAuth();
    if (!authenticated) return;

    adminToolsEnabled = true;
    adminSection.style.display = "block";

    document.getElementById("grant-access-form")?.addEventListener("submit", submitGrantAccess);
    document.getElementById("override-plan-form")?.addEventListener("submit", submitOverridePlan);
    document.getElementById("admin-xpost-close")?.addEventListener("click", closeAdminXPostModal);
    document.getElementById("admin-xpost-copy")?.addEventListener("click", async () => {
      const preview = document.getElementById("admin-xpost-preview");
      if (!preview) return;
      try {
        await navigator.clipboard.writeText(preview.textContent || "");
      } catch (err) {
        console.error("Copy failed:", err);
      }
    });
    document.getElementById("admin-xpost-modal")?.addEventListener("click", (event) => {
      if (event.target?.id === "admin-xpost-modal") closeAdminXPostModal();
    });

    bindAdminFilters();
    bindSectionDensityControls();
    renderMarketIntelligenceItems();
    await loadUnlockCalendar();
    await refreshAdminData("Initial");
    startAdminPolling();
  } catch (err) {
    console.error("Admin auth failed:", err);
  }
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    if (isOwnerWallet()) {
      await fetch(`${API_BASE}/admin/auth/logout`, { method: "POST", credentials: "include" });
    }

    if (isEmailUser()) {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    }
  } catch (err) {
    console.error("Logout failed:", err);
  }

  if (adminState.refreshTimer) clearInterval(adminState.refreshTimer);
  clearEmailUser();
  localStorage.removeItem("walletAddress");
  localStorage.removeItem("selectedPlan");
  localStorage.removeItem("ownerAccess");
  window.location.href = "intro.html";
});

document.getElementById("upgrade-modal-close")?.addEventListener("click", closeUpgradeModal);
document.getElementById("upgrade-modal-cancel")?.addEventListener("click", closeUpgradeModal);
window.addEventListener("click", (event) => {
  const modal = document.getElementById("upgrade-modal");
  if (event.target === modal) {
    closeUpgradeModal();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const emailUser = await syncEmailUserSession();
  bindTelegramConnectUi();
  const walletAddress = localStorage.getItem("walletAddress");
  const walletLabel = document.getElementById("wallet-address");
  if (walletLabel) {
    if (walletAddress) {
      walletLabel.textContent = isOwnerWallet(walletAddress.toLowerCase())
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} • OWNER`
        : `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    } else if (emailUser) {
      const emailBadge = emailUser.accessLevel === "free" ? "FREE" : String(emailUser.plan || "paid").toUpperCase();
      walletLabel.textContent = `${emailUser.email} • ${emailBadge}`;
    }
  }

  fetchMarketSnapshot();
  setInterval(fetchMarketSnapshot, 60000);
  bindUpgradeTriggers();
  controlSectionsByPlan();
  renderTelegramAlertsCard({
    linked: false,
    alertsEligible: getEmailUserPlan() !== "free",
    telegram: null
  });
  await loadTelegramStatus();
  await loadSignals();
  await loadMarketIntelligence();
  await loadUnlockCalendar();
  initAdminPanel();
});
async function loadHunter(){const r=await fetch('/hunter-ranking.json');const d=await r.json();const c=document.getElementById('hunter-list');c.innerHTML='';d.forEach(i=>{c.innerHTML+=`<div class="signal-box ${i.classLabel === 'Parabolic Candidate' ? 'green' : i.classLabel === 'Accumulation' ? 'blue' : i.classLabel === 'Rug Pull Risk' ? 'red' : 'gray'}">
  <b>${i.asset}</b>
  <p>Score: ${i.hunterScore}</p>
  <p>Type: ${i.classLabel}</p>
  <p>Confidence: ${i.confidence}</p>
  <p>Why: ${i.hunterReason || 'No explanation'}</p>
</div>`})}

async function loadExplosion(){const r=await fetch('/explosion-feed.json');const d=await r.json();const c=document.getElementById('explosion-list');c.innerHTML='';d.forEach(i=>{c.innerHTML+=`<div class="signal-box ${i.status === 'EXPLOSION_FORMING' ? 'green' : i.status === 'FAKE_PUMP' ? 'red' : 'blue'}">
  <b>${i.asset}</b>
  <p>Status: ${i.status}</p>
  <p>Strength: ${i.strength}</p>
  <p>Accel: ${i.acceleration?.combined || 0}</p>
  <p>Why: ${i.explosionReason || 'No explanation'}</p>
</div>`})}

loadHunter();loadExplosion();
