console.log("✅ Panel.js loaded");

// === BTC LIVE PRICE ===
async function fetchBTCPrice() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await res.json();
    const price = data.bitcoin.usd.toLocaleString("en-US", { style: "currency", currency: "USD" });
    document.getElementById("btc-price").textContent = price;
  } catch (e) {
    console.error("BTC fetch error:", e);
    document.getElementById("btc-price").textContent = "N/A";
  }
}

// === LOAD SIGNALS ===
async function loadSignals() {
  try {
    const response = await fetch("signals.json");
    const signals = await response.json();
    const container = document.getElementById("signals-container");

    container.innerHTML = ""; // clear before append

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.direction.toUpperCase()}`;
      box.innerHTML = `
        <h3>${signal.symbol} — ${signal.direction}</h3>
        <p><strong>Entry:</strong> $${signal.entry}</p>
        <p><strong>Target:</strong> $${signal.target}</p>
        <p><strong>Stop Loss:</strong> $${signal.stop}</p>
        <div class="signal-comment">📌 ${signal.comment}</div>
      `;
      container.appendChild(box);
    });
  } catch (err) {
    console.error("Signal fetch error:", err);
  }
}

// === FILTER SIGNALS ===
function filterSignals(type) {
  const boxes = document.querySelectorAll(".signal-box");
  boxes.forEach(box => {
    box.style.display = (type === "all" || box.classList.contains(type.toUpperCase())) ? "block" : "none";
  });
}

// === API & NOTIFICATION OPTIONS ===
document.querySelectorAll(".api-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    alert(`🌐 API access for ${btn.dataset.api} requested!`);
  });
});

document.querySelectorAll(".notify-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    alert(`🔔 Notification enabled via ${btn.dataset.channel}`);
  });
});

// === LOGOUT ===
const logoutBtn = document.getElementById("logout-btn");
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("walletAddress");
  window.location.href = "intro.html";
});

// === THEME INIT ===
window.addEventListener("DOMContentLoaded", () => {
  fetchBTCPrice();
  loadSignals();
  setInterval(fetchBTCPrice, 60000);

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light-mode");

  const walletAddr = localStorage.getItem("walletAddress");
  if (!walletAddr) {
    alert("⚠️ Wallet not connected. Redirecting...");
    window.location.href = "intro.html";
  }
});
