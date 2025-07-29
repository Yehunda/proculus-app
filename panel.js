console.log("JS file loaded");

// === LOAD BTC PRICE ===
async function fetchBTCPrice() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await response.json();
    const price = data.bitcoin.usd.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    document.getElementById("btc-price").textContent = price;
  } catch (error) {
    console.error("Error fetching BTC price:", error);
    document.getElementById("btc-price").textContent = "Unable to load";
  }
}

// === LOAD SIGNALS ===
async function loadSignals() {
  try {
    const response = await fetch("signals.json");
    const signals = await response.json();

    const container = document.getElementById("signals-container");
    container.innerHTML = ""; // Clear existing

    const selectedPlan = localStorage.getItem("selectedPlan") || "daily";
    const signalCount = selectedPlan === "yearly" ? 3 : selectedPlan === "monthly" ? 2 : 1;

    signals.slice(0, signalCount).forEach((signal) => {
      const box = document.createElement("div");
      box.className = "signal-box";

      const directionClass = signal.direction.toLowerCase() === "long" ? "signal-long" : "signal-short";

      box.innerHTML = `
        <div class="signal-header">
          <span>${signal.symbol} — <span class="${directionClass}">${signal.direction}</span></span>
        </div>
        <div>Entry: $${signal.entry}</div>
        <div>Target: $${signal.target}</div>
        <div>Stop: $${signal.stop}</div>
        <div class="signal-comment">Reason: ${signal.comment}</div>
      `;
      container.appendChild(box);
    });
  } catch (error) {
    console.error("Failed to load signals:", error);
  }
}

// === FILTER SIGNALS (Optional, can be used with UI filter buttons) ===
function filterSignals(type) {
  const boxes = document.querySelectorAll(".signal-box");
  boxes.forEach((box) => {
    box.style.display = type === "all" || box.classList.contains(type) ? "block" : "none";
  });
}

// === DISPLAY SECTIONS BASED ON PLAN ===
function setupPanelByPlan() {
  const plan = localStorage.getItem("selectedPlan") || "daily";

  // Show relevant sections
  const apiBox = document.getElementById("api-box");
  const stockBox = document.getElementById("stock-box");
  const nftBox = document.getElementById("nft-box");
  const presaleBox = document.getElementById("presale-box");
  const unlockBox = document.getElementById("unlock-box");

  if (plan === "daily") {
    apiBox?.remove();
    stockBox?.remove();
    nftBox?.remove();
    presaleBox?.remove();
    unlockBox?.remove();
  }

  if (plan === "monthly") {
    nftBox?.remove();
    presaleBox?.remove();
    unlockBox?.remove();
  }

  // Yearly sees all
}

// === NOTIFICATION SELECTION ===
document.getElementById("notification-form")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const selected = [];
  document.querySelectorAll("input[name='notification']:checked").forEach((el) => {
    selected.push(el.value);
  });
  alert("Notifications selected: " + selected.join(", "));
});

// === LOGOUT ===
const logoutBtn = document.getElementById("logout-btn");
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("walletAddress");
  localStorage.removeItem("selectedPlan");
  window.location.href = "intro.html";
});

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  fetchBTCPrice();
  loadSignals();
  setupPanelByPlan();
  setInterval(fetchBTCPrice, 60000);
});
