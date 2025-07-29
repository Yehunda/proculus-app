// === BTC PRICE ===
async function fetchBTCPrice() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await response.json();
    const price = data.bitcoin.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    document.getElementById("btc-price").textContent = price;
  } catch (error) {
    document.getElementById("btc-price").textContent = "Error";
  }
}

// === LOAD SIGNALS ===
async function loadSignals() {
  try {
    const response = await fetch("signals.json");
    const signals = await response.json();
    const container = document.getElementById("signals-container");
    container.innerHTML = "";

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.direction.toLowerCase()}`;
      box.innerHTML = `
        <h3>${signal.symbol} — ${signal.direction}</h3>
        <p>Entry: $${signal.entry}</p>
        <p>Target: $${signal.target}</p>
        <p>Stop: $${signal.stop}</p>
        <div class="signal-comment">Reason: ${signal.comment}</div>
      `;
      container.appendChild(box);
    });
  } catch (err) {
    console.error("Error loading signals:", err);
  }
}

// === FILTERS ===
function filterSignals(type) {
  const boxes = document.querySelectorAll(".signal-box");
  boxes.forEach(box => {
    box.style.display = (type === "all" || box.classList.contains(type)) ? "block" : "none";
  });
}

// === THEME TOGGLE ===
const toggleThemeBtn = document.getElementById("toggle-theme");
toggleThemeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
});

// === NOTIFICATIONS ===
const notificationOptions = document.querySelectorAll('.notification-options input');
notificationOptions.forEach(option => {
  option.addEventListener('change', () => {
    const selected = Array.from(notificationOptions)
      .filter(i => i.checked)
      .map(i => i.value);
    localStorage.setItem('selectedNotifications', JSON.stringify(selected));
  });
});

// === LOGOUT ===
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("walletAddress");
  window.location.href = "intro.html";
});

// === INIT ===
window.addEventListener("DOMContentLoaded", () => {
  fetchBTCPrice();
  setInterval(fetchBTCPrice, 60000);
  loadSignals();
});
