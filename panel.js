// === PANEL.JS ===

console.log("Panel JS loaded");

// === BTC & ETH LIVE PRICE ===
async function fetchPrice(symbol, elementId) {
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`);
    const data = await response.json();
    const price = data[symbol].usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    document.getElementById(elementId).textContent = price;
  } catch (err) {
    console.error("Price fetch error:", err);
  }
}

function loadPrices() {
  fetchPrice("bitcoin", "btc-price");
  fetchPrice("ethereum", "eth-price");
}

// === LOAD SIGNALS ===
async function loadSignals() {
  try {
    const response = await fetch('signals.json');
    const signals = await response.json();
    const container = document.getElementById("signals-container");
    container.innerHTML = '';

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.direction.toLowerCase()}`;
      box.innerHTML = `
        <h3>${signal.symbol} — ${signal.direction}</h3>
        <p><strong>Entry:</strong> $${signal.entry}</p>
        <p><strong>Target:</strong> $${signal.target}</p>
        <p><strong>Stop:</strong> $${signal.stop}</p>
        <p class="signal-comment">${signal.comment}</p>
      `;
      container.appendChild(box);
    });
  } catch (error) {
    console.error("Failed to load signals:", error);
  }
}

// === DARK/LIGHT MODE TOGGLE ===
document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
});

// === LOGOUT ===
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("walletAddress");
  window.location.href = "intro.html";
});

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  loadPrices();
  loadSignals();
  setInterval(loadPrices, 60000);

  // Hide premium sections if not yearly
  const plan = localStorage.getItem("selectedPlan");
  if (plan !== "yearly") {
    document.querySelectorAll(".yearly-only").forEach(el => el.style.display = "none");
  }
  if (plan !== "monthly" && plan !== "yearly") {
    document.querySelectorAll(".monthly-only").forEach(el => el.style.display = "none");
  }
});
