const OWNER_WALLET_ADDRESS = "0x4C3CFF7Df41e85d4972c5406EcF105a9AEA34b4d".toLowerCase();

function getStoredWalletAddress() {
  return (localStorage.getItem("walletAddress") || "").toLowerCase();
}

function isOwnerWallet(address = getStoredWalletAddress()) {
  return address === OWNER_WALLET_ADDRESS;
}

function getApiBase() {
  const runtimeBase = window.PROCULUS_CONFIG?.apiBase;
  const metaBase = document
    .querySelector('meta[name="proculus-api-base"]')
    ?.getAttribute('content');

  return runtimeBase || metaBase || "/api/public";
}

const API_BASE = getApiBase().replace(/\/$/, "");

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
  localStorage.removeItem("selectedPlan");
  localStorage.removeItem("ownerAccess");
}

function clearEmailUser() {
  localStorage.removeItem("proculusEmailUser");
  localStorage.removeItem("proculusAccessLevel");
  localStorage.removeItem("proculusAuthType");
}

function isFreeEmailUser() {
  const user = getStoredEmailUser();
  return Boolean(user && user.authType === "email" && user.accessLevel === "free");
}

const modeToggle = document.getElementById("mode-toggle");
const themeToggleLabel = document.getElementById("theme-toggle-label");
const walletButton = document.getElementById("wallet-connect");
const walletStatusText = document.getElementById("wallet-status-copy");
const dashboardLink = document.getElementById("dashboard-link");
const walletAddressInline = document.getElementById("wallet-address");
const logoutButton = document.getElementById("logout-btn");
const menuToggle = document.getElementById("menu-toggle");
const topbar = document.querySelector(".topbar");
const topbarMenuPanel = document.getElementById("topbar-menu-panel");
const emailAuthForm = document.getElementById("email-auth-form");
const emailAuthEmail = document.getElementById("email-auth-email");
const emailAuthPassword = document.getElementById("email-auth-password");
const emailLoginButton = document.getElementById("email-login-btn");
const emailSignupButton = document.getElementById("email-signup-btn");
const emailAuthMessage = document.getElementById("email-auth-message");

const modal = document.getElementById("modal");
const modalText = document.getElementById("modal-text");
const modalWalletButton = document.getElementById("modal-wallet-btn");
const modalEmailAuthForm = document.getElementById("modal-email-auth-form");
const modalEmailAuthEmail = document.getElementById("modal-email-auth-email");
const modalEmailAuthPassword = document.getElementById("modal-email-auth-password");
const modalEmailLoginButton = document.getElementById("modal-email-login-btn");
const modalEmailSignupButton = document.getElementById("modal-email-signup-btn");
const modalEmailAuthMessage = document.getElementById("modal-email-auth-message");
const closeModal = document.getElementById("closeModal");
const cancelModal = document.getElementById("cancel-modal");

const engineTimestamp = document.getElementById("engine-timestamp");
const heroEngineState = document.getElementById("hero-engine-state");
const stripEngineStatus = document.getElementById("strip-engine-status");
const latestSignalLabel = document.getElementById("latest-signal-label");
const latestSignalTime = document.getElementById("latest-signal-time");
const liveStateLabel = document.getElementById("live-state-label");
const engineModeLabel = document.getElementById("engine-mode-label");
const engineOutputLabel = document.getElementById("engine-output-label");
const feedCycleLabel = document.getElementById("feed-cycle-label");
const engineFeed = document.getElementById("engine-feed");

const trendStatus = document.getElementById("trend-status");
const momentumStatus = document.getElementById("momentum-status");
const sentimentStatus = document.getElementById("sentiment-status");
const onchainStatus = document.getElementById("onchain-status");
const riskStatus = document.getElementById("risk-status");

const previewPair = document.getElementById("preview-pair");
const previewDirection = document.getElementById("preview-direction");
const previewEntry = document.getElementById("preview-entry");
const previewTarget = document.getElementById("preview-target");
const previewStop = document.getElementById("preview-stop");
const previewConfidence = document.getElementById("preview-confidence");
const confidenceMeterBar = document.getElementById("confidence-meter-bar");

const successContainer = document.getElementById("success-container");
const cryptoTicker = document.getElementById("crypto-ticker");
const marketPreviewContainer = document.getElementById("market-preview-container");

let selectedPlan = "monthly";

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

function formatUsd(value) {
  if (typeof value !== "number") {
    return "...";
  }

  return value >= 1000
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPct(value) {
  if (typeof value !== "number") {
    return "0.00%";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function setMessage(node, message, type = "") {
  if (!node) return;
  node.textContent = message;
  node.className = `email-auth-message${type ? ` ${type}` : ""}`;
}

function setEmailAuthMessage(message, type = "") {
  setMessage(emailAuthMessage, message, type);
}

function setModalEmailAuthMessage(message, type = "") {
  setMessage(modalEmailAuthMessage, message, type);
}

function getIntroMarketPreviewHref() {
  const walletAddress = localStorage.getItem("walletAddress");
  const emailUser = getStoredEmailUser();
  return walletAddress || emailUser ? "/panel.html" : "#";
}

function getIntroMarketPreviewCtaLabel() {
  const walletAddress = localStorage.getItem("walletAddress");
  const emailUser = getStoredEmailUser();
  return walletAddress || emailUser ? "Go To Dashboard" : "Unlock Full Analysis";
}

async function loadMarketPreview() {
  if (!marketPreviewContainer) {
    return;
  }

  try {
    const res = await fetch('/market-intelligence.json', {
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Market intelligence preview request failed: ${res.status}`);
    }

    const items = await res.json();
    const entries = Array.isArray(items) ? items.slice(0, 2) : [];

    if (!entries.length) {
      marketPreviewContainer.innerHTML = `
        <article class="market-preview-card glass-card">
          <span class="card-label">No Feed</span>
          <h3>No preview items are available yet.</h3>
          <p>Market intelligence entries will appear here once the feed updates.</p>
        </article>
      `;
      return;
    }

    marketPreviewContainer.innerHTML = entries.map((item) => `
      <article class="market-preview-card glass-card">
        <div class="market-preview-topline">
          <span class="market-category-pill">${escapeHtml(item.category || 'General')}</span>
          <span class="market-risk-pill risk-${String(item.riskLevel || 'medium').toLowerCase()}">${escapeHtml(item.riskLevel || 'Medium')} Risk</span>
        </div>
        <h3>${escapeHtml(item.title || 'Untitled')}</h3>
        <p class="market-preview-summary">${escapeHtml(item.summary || '')}</p>
        <a href="${getIntroMarketPreviewHref()}" class="secondary-btn market-preview-cta" data-market-preview-cta="true">${getIntroMarketPreviewCtaLabel()}</a>
      </article>
    `).join('');

    marketPreviewContainer.querySelectorAll('[data-market-preview-cta="true"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const walletAddress = localStorage.getItem("walletAddress");
        const emailUser = getStoredEmailUser();
        if (!walletAddress && !emailUser) {
          event.preventDefault();
          openPlanModal('monthly');
        }
      });
    });
  } catch (err) {
    console.error('Failed to load market preview:', err);
    marketPreviewContainer.innerHTML = `
      <article class="market-preview-card glass-card">
        <span class="card-label">Unavailable</span>
        <h3>Market intelligence preview could not be loaded.</h3>
        <p>The feed is temporarily unavailable. Try again later.</p>
      </article>
    `;
  }
}

async function loadMarketTicker() {
  if (!cryptoTicker) {
    return;
  }

  try {
    const [pricesRes, globalRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${TICKER_IDS}&vs_currencies=usd&include_24hr_change=true`),
      fetch("https://api.coingecko.com/api/v3/global")
    ]);

    const data = await pricesRes.json();
    const globalData = await globalRes.json();

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

    cryptoTicker.innerHTML = `<div class="ticker-group">${renderGroup()}</div><div class="ticker-group">${renderGroup()}</div>`;
  } catch (err) {
    console.error("Failed to load market ticker:", err);
  }
}

const engineScenarios = [
  {
    mode: "Consensus Locked",
    output: "Signal Ready",
    heroState: "Validating Setups",
    stripStatus: "Monitoring",
    liveState: "Validating",
    latestSignal: "SOL/USDT Long",
    latestTime: "Issued 8m ago",
    preview: {
      pair: "SOL/USDT",
      direction: "Long",
      entry: "148.20",
      target: "157.90",
      stop: "143.60",
      confidence: 86
    },
    agents: {
      trend: "Bullish",
      momentum: "Expanding",
      sentiment: "Improving",
      onchain: "Neutral+",
      risk: "Contained"
    },
    feed: [
      "BTC/USDT structure sweep complete",
      "Momentum agent detected continuation pressure",
      "Risk agent validated stop distance"
    ]
  },
  {
    mode: "Cross-Agent Review",
    output: "Setup Forming",
    heroState: "Scanning Rotation",
    stripStatus: "Scanning",
    liveState: "Monitoring",
    latestSignal: "LINK/USDT Watch",
    latestTime: "Updated 3m ago",
    preview: {
      pair: "LINK/USDT",
      direction: "Long",
      entry: "17.42",
      target: "18.35",
      stop: "16.88",
      confidence: 74
    },
    agents: {
      trend: "Rising",
      momentum: "Building",
      sentiment: "Neutral",
      onchain: "Stable",
      risk: "Watching"
    },
    feed: [
      "ETH beta rotation influencing majors",
      "Sentiment agent flagged improving social tone",
      "Core waiting for volatility compression"
    ]
  },
  {
    mode: "Risk Filter Active",
    output: "Awaiting Confirmation",
    heroState: "Filtering Noise",
    stripStatus: "Risk Review",
    liveState: "Threshold Check",
    latestSignal: "BTC/USDT Short Watch",
    latestTime: "Updated 1m ago",
    preview: {
      pair: "BTC/USDT",
      direction: "Short",
      entry: "64,210",
      target: "62,980",
      stop: "64,920",
      confidence: 68
    },
    agents: {
      trend: "Weakening",
      momentum: "Diverging",
      sentiment: "Fading",
      onchain: "Neutral",
      risk: "Strict"
    },
    feed: [
      "Momentum agent detected bearish divergence",
      "Risk agent widened invalidation threshold",
      "Core delayed issuance pending volume check"
    ]
  }
];

function formatWallet(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}


function initFaqAccordion() {
  const accordion = document.getElementById("faq-accordion");
  if (!accordion) {
    return;
  }

  const items = Array.from(accordion.querySelectorAll(".faq-item"));

  const openItem = (targetItem) => {
    items.forEach((item) => {
      const trigger = item.querySelector(".faq-trigger");
      const panel = item.querySelector(".faq-panel");
      const shouldOpen = item === targetItem;

      item.classList.toggle("is-open", shouldOpen);
      if (trigger) {
        trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      }
      if (panel) {
        panel.style.maxHeight = shouldOpen ? `${panel.scrollHeight}px` : "0px";
      }
    });
  };

  items.forEach((item) => {
    const panel = item.querySelector(".faq-panel");
    if (panel) {
      panel.style.maxHeight = "0px";
    }
  });

  const handleAccordionToggle = (event) => {
    const trigger = event.target.closest(".faq-trigger");
    if (!trigger || !accordion.contains(trigger)) {
      return;
    }

    event.preventDefault();
    const item = trigger.closest(".faq-item");
    if (!item) {
      return;
    }

    openItem(item);
  };

  accordion.addEventListener("click", handleAccordionToggle);
  accordion.addEventListener("touchend", handleAccordionToggle, { passive: false });

  const initialOpenItem = items.find((item) => item.classList.contains("is-open")) || items[0];
  if (initialOpenItem) {
    openItem(initialOpenItem);
  }

  window.addEventListener("resize", () => {
    const currentOpenItem = items.find((item) => item.classList.contains("is-open"));
    if (currentOpenItem) {
      openItem(currentOpenItem);
    }
  });
}

function openTopbarMenu() {
  if (!topbar || !menuToggle) {
    return;
  }

  topbar.classList.add("menu-open");
  document.body.classList.add("menu-open");
  menuToggle.setAttribute("aria-expanded", "true");
}

function closeTopbarMenu() {
  if (!topbar || !menuToggle) {
    return;
  }

  topbar.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function toggleTopbarMenu() {
  if (topbar?.classList.contains("menu-open")) {
    closeTopbarMenu();
    return;
  }

  openTopbarMenu();
}

function setTheme(mode) {
  const light = mode === "light";
  document.body.classList.toggle("light-mode", light);
  localStorage.setItem("theme", light ? "light" : "dark");
  if (themeToggleLabel) {
    themeToggleLabel.textContent = light ? "Light" : "Dark";
  }
}

function updateWalletUI() {
  const walletAddress = localStorage.getItem("walletAddress");
  const emailUser = getStoredEmailUser();

  if (walletAddress) {
    if (walletButton) {
      walletButton.style.display = "none";
    }
    if (dashboardLink) {
      dashboardLink.style.display = "inline-flex";
    }

    if (walletAddressInline) {
      walletAddressInline.textContent = isOwnerWallet(walletAddress.toLowerCase())
        ? "Owner Connected"
        : "Wallet Connected";
    }

    if (walletStatusText) {
      walletStatusText.textContent = isOwnerWallet(walletAddress.toLowerCase())
        ? `Owner wallet ${formatWallet(walletAddress)} connected. Full terminal access is enabled.`
        : `Connected wallet ${formatWallet(walletAddress)}. Dashboard is ready.`;
    }

    if (logoutButton) {
      logoutButton.style.display = "inline-flex";
    }
    return;
  }

  if (emailUser) {
    if (walletButton) {
      walletButton.style.display = "none";
    }
    if (dashboardLink) {
      dashboardLink.style.display = "inline-flex";
    }
    if (walletAddressInline) {
      walletAddressInline.textContent = emailUser.email;
    }
    if (walletStatusText) {
      walletStatusText.textContent = `Logged in as ${emailUser.email}. Free dashboard access is enabled.`;
    }
    if (logoutButton) {
      logoutButton.style.display = "inline-flex";
    }
    return;
  }

  if (walletButton) {
    walletButton.style.display = "inline-flex";
    walletButton.textContent = "Login / Signup";
  }
  if (dashboardLink) dashboardLink.style.display = "none";
  if (walletAddressInline) walletAddressInline.textContent = "";
  if (walletStatusText) {
    walletStatusText.textContent = "No wallet connected. Select a tier to continue into the terminal.";
  }
  if (logoutButton) logoutButton.style.display = "none";
}

async function syncEmailSession() {
  try {
    const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
    const data = await res.json();
    if (data.authenticated && data.user) {
      persistEmailUser(data.user);
      return data.user;
    }
  } catch (err) {
    console.error("Email session sync failed:", err);
  }

  clearEmailUser();
  return null;
}

async function submitEmailAuth(mode, options = {}) {
  const emailInput = options.emailInput || emailAuthEmail;
  const passwordInput = options.passwordInput || emailAuthPassword;
  const messageSetter = options.messageSetter || setEmailAuthMessage;
  const email = emailInput?.value?.trim() || "";
  const password = passwordInput?.value || "";

  if (!email || !password) {
    messageSetter("Email and password are required.", "error");
    return;
  }

  try {
    messageSetter(mode === "signup" ? "Creating free account..." : "Signing in...");
    const res = await fetch(`${API_BASE}/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok || !data.authenticated || !data.user) {
      throw new Error(data.error || "Authentication failed");
    }

    persistEmailUser(data.user);
    messageSetter("Free dashboard access ready. Redirecting...", "success");
    updateWalletUI();
    closePlanModal();
    window.location.href = "panel.html";
  } catch (err) {
    messageSetter(err.message, "error");
  }
}

window.onWalletConnectionChange = () => {
  updateWalletUI();

  const walletAddress = localStorage.getItem("walletAddress");
  if (walletAddress && isOwnerWallet(walletAddress.toLowerCase())) {
    localStorage.setItem("ownerAccess", "true");
    localStorage.removeItem("selectedPlan");
    clearEmailUser();
    window.location.href = "panel.html";
  }
};

function updateTimestamp() {
  if (engineTimestamp) {
    engineTimestamp.textContent = `Synced ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }
}

function renderEngineScenario(scenario, cycleIndex) {
  engineModeLabel.textContent = scenario.mode;
  engineOutputLabel.textContent = scenario.output;
  heroEngineState.textContent = scenario.heroState;
  stripEngineStatus.textContent = scenario.stripStatus;
  liveStateLabel.textContent = scenario.liveState;
  latestSignalLabel.textContent = scenario.latestSignal;
  latestSignalTime.textContent = scenario.latestTime;
  feedCycleLabel.textContent = `Engine cycle ${String(421 + cycleIndex).padStart(4, "0")}`;

  previewPair.textContent = scenario.preview.pair;
  previewDirection.textContent = scenario.preview.direction;
  previewDirection.className = `direction-pill ${scenario.preview.direction.toLowerCase()}`;
  previewEntry.textContent = scenario.preview.entry;
  previewTarget.textContent = scenario.preview.target;
  previewStop.textContent = scenario.preview.stop;
  previewConfidence.textContent = `${scenario.preview.confidence}%`;
  confidenceMeterBar.style.width = `${scenario.preview.confidence}%`;

  trendStatus.textContent = scenario.agents.trend;
  momentumStatus.textContent = scenario.agents.momentum;
  sentimentStatus.textContent = scenario.agents.sentiment;
  onchainStatus.textContent = scenario.agents.onchain;
  riskStatus.textContent = scenario.agents.risk;

  engineFeed.innerHTML = "";
  scenario.feed.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    engineFeed.appendChild(item);
  });
}

async function loadSuccessWall() {
  try {
    const res = await fetch(`${API_BASE}/success-signals`, {
      headers: { Accept: "application/json" }
    });
    const signals = await res.json();

    if (!Array.isArray(signals)) {
      successContainer.innerHTML = "";
      return;
    }

    successContainer.innerHTML = "";

    signals.slice(0, 3).forEach((signal) => {
      const signalType = String(signal.type || "").toLowerCase();
      const positive = !signalType.includes("short");

      const card = document.createElement("article");
      card.className = "outcome-card glass-card";
      card.innerHTML = `
        <div class="outcome-top">
          <h3>${signal.pair || "Signal"}</h3>
          <span class="outcome-badge ${positive ? "positive" : ""}">${signal.type || "Closed"}</span>
        </div>
        <p>Entry ${signal.entry ?? "-"} · Target ${signal.target ?? "-"} · Stop ${signal.stop ?? "-"}</p>
        <small>${signal.comment || "Validated by the Proculus engine."}</small>
      `;
      successContainer.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load success wall:", err);
  }
}

function openPlanModal(plan) {
  selectedPlan = plan;
  modalText.textContent = "Continue with wallet or sign up with email for free dashboard access.";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function startPaidCheckout(plan) {
  const normalizedPlan = String(plan || "monthly").toLowerCase();
  if (!["daily", "monthly", "yearly"].includes(normalizedPlan)) {
    return;
  }

  localStorage.setItem("selectedPlan", normalizedPlan);
  localStorage.removeItem("ownerAccess");
  window.location.href = "/checkout.html";
}

function closePlanModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

menuToggle?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleTopbarMenu();
});

document.querySelectorAll(".menu-link, #dashboard-link").forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenu();
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarMenu();
  }
});

window.addEventListener("click", (event) => {
  if (!topbar?.classList.contains("menu-open")) {
    return;
  }

  if (topbar && !topbar.contains(event.target) && event.target !== modal) {
    closeTopbarMenu();
  }
});

modeToggle?.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("light-mode") ? "dark" : "light";
  setTheme(nextTheme);
});

walletButton?.addEventListener("click", (event) => {
  if (localStorage.getItem("walletAddress")) {
    return;
  }

  closeTopbarMenu();
  event.preventDefault();
  event.stopImmediatePropagation();
  openPlanModal();
}, true);

logoutButton?.addEventListener("click", async () => {
  if (isFreeEmailUser()) {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("Email logout failed:", err);
    }
  }

  clearEmailUser();
  localStorage.removeItem("walletAddress");
  localStorage.removeItem("selectedPlan");
  localStorage.removeItem("ownerAccess");
  updateWalletUI();
  closeTopbarMenu();
});

document.querySelectorAll(".subscribe-btn").forEach((button) => {
  button.addEventListener("click", () => {
    startPaidCheckout(button.dataset.plan || "monthly");
  });
});

modalEmailAuthForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitEmailAuth("login", {
    emailInput: modalEmailAuthEmail,
    passwordInput: modalEmailAuthPassword,
    messageSetter: setModalEmailAuthMessage
  });
});

modalEmailSignupButton?.addEventListener("click", async () => {
  await submitEmailAuth("signup", {
    emailInput: modalEmailAuthEmail,
    passwordInput: modalEmailAuthPassword,
    messageSetter: setModalEmailAuthMessage
  });
});

modalWalletButton?.addEventListener("click", async () => {
  let walletAddress = localStorage.getItem("walletAddress");

  if (!walletAddress && window.proculusWallet?.connect) {
    walletAddress = await window.proculusWallet.connect();
  }

  if (!walletAddress) {
    setModalEmailAuthMessage("Please connect your wallet before proceeding.", "error");
    return;
  }

  if (isOwnerWallet(walletAddress.toLowerCase())) {
    localStorage.setItem("ownerAccess", "true");
    localStorage.removeItem("selectedPlan");
    clearEmailUser();
    closePlanModal();
    window.location.href = "panel.html";
    return;
  }

  closePlanModal();
});

closeModal?.addEventListener("click", closePlanModal);
cancelModal?.addEventListener("click", closePlanModal);

topbarMenuPanel?.addEventListener("click", (event) => {
  if (event.target === topbarMenuPanel || event.target.classList.contains("topbar-menu-backdrop")) {
    closeTopbarMenu();
    return;
  }

  const sheet = topbarMenuPanel.querySelector(".topbar-menu-sheet");
  if (sheet && sheet.contains(event.target)) {
    event.stopPropagation();
  }
});

window.addEventListener("click", (event) => {
  if (event.target === modal) {
    closePlanModal();
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  setTheme(localStorage.getItem("theme") || "dark");
  const emailUser = await syncEmailSession();
  updateWalletUI();
  updateTimestamp();
  loadSuccessWall();
  initFaqAccordion();
  loadMarketTicker();
  loadMarketPreview();

  const pricingView = window.location.hash === "#pricing";
  const fromPanelView = new URLSearchParams(window.location.search).get("fromPanel") === "1";
  const walletAddress = localStorage.getItem("walletAddress");
  if (walletAddress && isOwnerWallet(walletAddress.toLowerCase())) {
    localStorage.setItem("ownerAccess", "true");
    localStorage.removeItem("selectedPlan");
  }

  if (!pricingView && !fromPanelView && walletAddress && (isOwnerWallet(walletAddress.toLowerCase()) || localStorage.getItem("selectedPlan"))) {
    window.location.href = "panel.html";
    return;
  }

  if (!pricingView && !fromPanelView && !walletAddress && emailUser) {
    window.location.href = "panel.html";
    return;
  }

  let scenarioIndex = 0;
  renderEngineScenario(engineScenarios[scenarioIndex], scenarioIndex);

  setInterval(() => {
    scenarioIndex = (scenarioIndex + 1) % engineScenarios.length;
    renderEngineScenario(engineScenarios[scenarioIndex], scenarioIndex);
    updateTimestamp();
  }, 5000);

  setInterval(loadMarketTicker, 60000);
});
