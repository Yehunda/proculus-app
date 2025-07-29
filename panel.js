console.log("JS loaded");

// === BTC PRICE FETCH ===
async function fetchBTCPrice() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await res.json();
    document.getElementById("btc-price").textContent = `$${data.bitcoin.usd}`;
  } catch (err) {
    console.error("BTC price error:", err);
  }
}

// === LOAD SIGNALS BASED ON PLAN ===
async function loadSignals() {
  try {
    const res = await fetch("signals.json");
    const signals = await res.json();

    const plan = localStorage.getItem("selectedPlan") || "daily";
    const maxSignals = plan === "yearly" ? 3 : plan === "monthly" ? 2 : 1;

    const container = document.getElementById("signals-container");
    container.innerHTML = ""; // clear before refill

    signals.slice(0, maxSignals).forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.direction.toLowerCase()}`;
      box.innerHTML = `
        <h3>${signal.symbol} — ${signal.direction}</h3>
        <p>Entry: $${signal.entry}</p>
        <p>Target: $${signal.target}</p>
        <p>Stop Loss: $${signal.stop}</p>
        <div class="signal-comment">${signal.comment}</div>
      `;
      container.appendChild(box);
    });
  } catch (err) {
    console.error("Signal fetch error:", err);
  }
}

// === PLAN-BASED SECTION DISPLAY ===
function controlSectionsByPlan() {
  const plan = localStorage.getItem("selectedPlan") || "daily";

  const showIf = selector => {
    document.querySelectorAll(selector).forEach(el => el.style.display = "block");
  };
  const hideIf = selector => {
    document.querySelectorAll(selector).forEach(el => el.style.display = "none");
  };

  // Base for all plans
  showIf(".signals-section");
  showIf(".notifications-section");
  showIf(".risk-warning");

  // Monthly and above
  if (plan === "monthly" || plan === "yearly") {
    showIf(".api-access");
    showIf(".stocks-section");
  } else {
    hideIf(".api-access");
    hideIf(".stocks-section");
  }

  // Yearly only
  if (plan === "yearly") {
    showIf(".nft-radar");
    showIf(".presales-section");
    showIf(".token-unlock");
  } else {
    hideIf(".nft-radar");
    hideIf(".presales-section");
    hideIf(".token-unlock");
  }
}

// === DARK/LIGHT MODE TOGGLE ===
document.getElementById("theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
});

// === LOGOUT ===
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("walletAddress");
  localStorage.removeItem("selectedPlan");
  window.location.href = "intro.html";
});

// === MOBILE MENU TOGGLE ===
const hamburger = document.getElementById("hamburger-menu");
const mobileMenu = document.getElementById("mobile-menu");

hamburger.addEventListener("click", () => {
  mobileMenu.classList.toggle("show");
});

window.addEventListener("click", function (event) {
  if (!hamburger.contains(event.target) && !mobileMenu.contains(event.target)) {
    mobileMenu.classList.remove("show");
  }
});

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  fetchBTCPrice();
  setInterval(fetchBTCPrice, 60000);

  controlSectionsByPlan();
  loadSignals();
});
