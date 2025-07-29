// Tema geçişi
document.getElementById("mode-toggle").addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  localStorage.setItem("theme", document.body.classList.contains("light-mode") ? "light" : "dark");
});

// Sayfa yüklendiğinde tema ve cüzdan kontrolü
window.addEventListener("DOMContentLoaded", () => {
  // Tema kontrolü
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
  }

  // Cüzdan durumu kontrolü
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

  loadSuccessWall(); // Başarılı sinyalleri getir
  fetchPrices(); // Coin fiyatlarını getir
});

// Modal sistemi
document.querySelectorAll(".subscribe-btn").forEach(button => {
  button.addEventListener("click", () => {
    const plan = button.getAttribute("data-plan");
    document.getElementById("modal-text").innerText = `Do you want to activate the "${plan}" plan?`;
    document.getElementById("modal").style.display = "block";
    document.getElementById("confirm-btn").setAttribute("data-plan", plan);
  });
});

document.getElementById("confirm-btn").onclick = () => {
  const selectedPlan = document.getElementById("confirm-btn").getAttribute("data-plan");
  const wallet = localStorage.getItem("walletAddress");
  if (!wallet) return alert("Please connect your wallet before proceeding.");
  localStorage.setItem("selectedPlan", selectedPlan);
  window.location.href = "panel.html";
};

document.getElementById("closeModal").onclick = () => {
  document.getElementById("modal").style.display = "none";
};

window.onclick = (e) => {
  if (e.target.classList.contains("modal")) {
    document.getElementById("modal").style.display = "none";
  }
};

// Başarılı sinyalleri çek
async function loadSuccessWall() {
  try {
    const res = await fetch('https://proculus-backend-url.com/success-signals.json'); // doğru backend yolunu yaz
    const signals = await res.json();
    const container = document.getElementById('success-container');
    container.innerHTML = "";

    signals.forEach(signal => {
      const typeClass = signal.type.toLowerCase();
      const logo = `https://cryptoicon-api.pages.dev/api/icon/${signal.pair.slice(0, 3).toLowerCase()}`;

      const card = document.createElement("div");
      card.className = `success-card ${typeClass}`;
      card.innerHTML = `
        <div class="pair"><img src="${logo}" alt=""> ${signal.pair}</div>
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

// Coin fiyatlarını çek
async function fetchPrices() {
  const coinIds = [
    'bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple', 'avalanche-2', 'chainlink',
    'polkadot', 'monero', 'dogecoin', 'tron', 'cardano', 'hyperliquid', 'sui', 'bittensor',
    'ethena', 'ondo', 'pepe', 'kaspa', 'arbitrum', 'render', 'celestia', 'hacash', 'hacash-diamond'
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
      document.getElementById(id).innerText = `${key.toUpperCase()}: $${price}`;
    }

    const globalRes = await fetch("https://api.coingecko.com/api/v3/global");
    const global = await globalRes.json();
    document.getElementById("btc-dominance").innerText = `BTC Dominance: ${global.data.market_cap_percentage.btc.toFixed(2)}%`;
    document.getElementById("total-market-cap").innerText = `Total Market Cap: $${global.data.total_market_cap.usd.toLocaleString()}`;
  } catch (err) {
    console.error("Price fetch error:", err);
  }
}
