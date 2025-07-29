console.log("🔧 Panel JS loaded");

// === BTC Live Price ===
async function fetchBTCPrice() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await res.json();
    const price = data.bitcoin.usd.toLocaleString("en-US", { style: "currency", currency: "USD" });
    document.getElementById("btc-price").textContent = price;
  } catch (err) {
    console.error("❌ BTC price error:", err);
    document.getElementById("btc-price").textContent = "Load error";
  }
}

// === Load Signals ===
async function loadSignals() {
  console.log("📡 Fetching signals...");
  try {
    const res = await fetch("signals.json");
    const signals = await res.json();
    const container = document.getElementById("signals-container");
    container.innerHTML = "";

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.direction.toLowerCase()}`;
      box.innerHTML = `
        <h3>${signal.symbol} — ${signal.direction}</h3>
        <p><strong>Entry:</strong> $${signal.entry}</p>
        <p><strong>Target:</strong> $${signal.target}</p>
        <p><strong>Stop Loss:</strong> $${signal.stop}</p>
        <div class="signal-comment">${signal.comment}</div>
      `;
      container.appendChild(box);
    });
  } catch (err) {
    console.error("❌ Failed to load signals:", err);
  }
}

// === Notification & API Save ===
document.getElementById("save-options").addEventListener("click", () => {
  const checkedAPIs = [...document.querySelectorAll(".api-option input:checked")].map(i => i.value);
  const checkedNotifs = [...document.querySelectorAll(".notif-option input:checked")].map(i => i.value);

  localStorage.setItem("apiSelection", JSON.stringify(checkedAPIs));
  localStorage.setItem("notifSelection", JSON.stringify(checkedNotifs));

  alert("✅ Preferences saved!");
});

// === Theme Support ===
document.getElementById("mode-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
});

// === Theme Load on Init ===
window.addEventListener("DOMContentLoaded", () => {
  // Theme
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }

  // Wallet control
  const wallet = localStorage.getItem("walletAddress");
  if (!wallet) {
    window.location.href = "intro.html";
  }

  // Price + Signals
  fetchBTCPrice();
  loadSignals();
  setInterval(fetchBTCPrice, 60000);
});
