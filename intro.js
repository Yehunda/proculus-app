// 🌙 Tema yönetimi
const modeToggle = document.getElementById("mode-toggle");
modeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
});

// 🌐 Sayfa yüklendiğinde tema + cüzdan kontrolü
window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }

  const walletAddress = localStorage.getItem("walletAddress");
  const walletBtn = document.getElementById("wallet-connect");
  const addressSpan = document.getElementById("wallet-address");
  const logoutBtn = document.getElementById("logout-btn");

  if (walletAddress) {
    walletBtn.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    addressSpan.textContent = `Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    logoutBtn.style.display = "inline-block";
  }

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("walletAddress");
    walletBtn.textContent = "Login / Signup";
    addressSpan.textContent = "";
    logoutBtn.style.display = "none";
  });

  // Otomatik yönlendirme
  if (walletAddress && localStorage.getItem("selectedPlan")) {
    window.location.href = "panel.html";
  }
});

// 💰 Coin fiyatlarını çek (CoinGecko)
async function fetchPrices() {
  const coinIds = [
    'bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple', 'avalanche-2', 'chainlink',
    'polkadot', 'monero', 'dogecoin', 'tron', 'cardano', 'hyperliquid', 'sui',
    'bittensor', 'ethena', 'ondo', 'pepe', 'kaspa', 'arbitrum', 'render',
    'celestia', 'hacash', 'hacash-diamond'
  ];

  const map = {
    bitcoin: 'btc-price', ethereum: 'eth-price', solana: 'sol-price', binancecoin: 'bnb-price',
    ripple: 'xrp-price', 'avalanche-2': 'avax-price', chainlink: 'link-price', polkadot: 'dot-price',
    monero: 'xmr-price', dogecoin: 'doge-price', tron: 'trx-price', cardano: 'ada-price',
    hyperliquid: 'hype-price', sui: 'sui-price', bittensor: 'tao-price', ethena: 'ena-price',
    ondo: 'ondo-price', pepe: 'pepe-price', kaspa: 'kaspa-price', arbitrum: 'arbitrum-price',
    render: 'render-price', celestia: 'celestia-price',
    hacash: 'hacash-price', 'hacash-diamond': 'hacash-diamond-price'
  };

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd`);
    const data = await res.json();
    for (const [key, id] of Object.entries(map)) {
      const price = data[key]?.usd?.toLocaleString() || 'Error';
      document.getElementById(id).innerText = `${key.toUpperCase().replace(/-/g, ' ')}: $${price}`;
    }

    const globalRes = await fetch("https://api.coingecko.com/api/v3/global");
    const global = await globalRes.json();
    document.getElementById("btc-dominance").innerText = `BTC Dominance: ${global.data.market_cap_percentage.btc.toFixed(2)}%`;
    document.getElementById("total-market-cap").innerText = `Total Market Cap: $${global.data.total_market_cap.usd.toLocaleString()}`;
  } catch (err) {
    console.error("Price fetch error:", err);
  }
}
fetchPrices();
setInterval(fetchPrices, 60000);

// 📢 Modal kontrol ve plan onaylama
const modal = document.getElementById("modal");
const modalText = document.getElementById("modal-text");
const confirmBtn = document.getElementById("confirm-btn");
const closeModal = document.getElementById("closeModal");

document.querySelectorAll(".subscribe-btn").forEach(button => {
  button.addEventListener("click", () => {
    const plan = button.getAttribute("data-plan");
    modalText.innerText = `Do you want to activate the "${plan}" plan?`;
    modal.style.display = "block";
    confirmBtn.setAttribute("data-plan", plan);
  });
});

confirmBtn.onclick = () => {
  const selectedPlan = confirmBtn.getAttribute("data-plan");
  localStorage.setItem("selectedPlan", selectedPlan);
  modal.style.display = "none";

  const wallet = localStorage.getItem("walletAddress");
  if (wallet) {
    window.location.href = "panel.html";
  } else {
    alert("Please connect your wallet before proceeding.");
  }
};

closeModal.onclick = () => modal.style.display = "none";
window.onclick = (e) => {
  if (e.target.classList.contains("modal")) modal.style.display = "none";
};

// Load success signals from backend
async function loadSuccessWall() {
  try {
    const res = await fetch("http://138.199.155.77:3021/api/success-signals");
    const signals = await res.json();
    const container = document.getElementById("success-container");
    container.innerHTML = "";

    // Kullanıcının tarayıcı diline göre tarih formatla
    const userLang = navigator.language || "en-US";
    const formattedDate = new Date().toLocaleString(userLang, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Güncellenme bilgisini başarı duvarına ekle
    document.querySelector(".success-wall").insertAdjacentHTML(
      "afterbegin",
      `<p class="success-meta">Last updated: ${formattedDate} – Total: ${signals.length} Successes</p>`
    );

    // İlk 3 başarılı sinyali göster
    signals.slice(0, 3).forEach(signal => {
      const logo = `https://cryptoicon-api.pages.dev/api/icon/${signal.pair.slice(0, 3).toLowerCase()}`;
      const imgTag = `<img src="${logo}" alt="" onerror="this.style.display='none'">`;

      const card = document.createElement("div");
      card.className = `success-card ${signal.type.toLowerCase()}`;
      card.innerHTML = `
        <div class="pair">${imgTag} ${signal.pair}</div>
        <div class="type">${signal.type}</div>
        <div>🎯 <strong>Entry:</strong> ${signal.entry}</div>
        <div>🚀 <strong>Target:</strong> ${signal.target}</div>
        <div>🛑 <strong>Stop:</strong> ${signal.stop}</div>
        <div class="comment">💬 ${signal.comment}</div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load success wall:", err);
  }
}

loadSuccessWall();

// 🧑 Aktif Kullanıcı Sayısı (dummy örnek, backend bağlanınca değiştirilebilir)
async function loadActiveUsers() {
  try {
    const res = await fetch('https://138.199.155.77:3021/active-users');
    const data = await res.json();
    const userPanel = document.querySelector(".active-users");
    userPanel.innerHTML = `
      <h3>Active Users</h3>
      <p>${data.count}</p>
    `;
  } catch (err) {
    console.error("Active user fetch error:", err);
    document.querySelector(".active-users").innerHTML = `<h3>Active Users</h3><p>Loading failed</p>`;
  }
}
loadActiveUsers();
setInterval(loadActiveUsers, 60000);
