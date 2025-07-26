// BTC live price
async function fetchBTCPrice() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await response.json();
    const price = data.bitcoin.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

    document.getElementById("btc-price").textContent = price;
  } catch (error) {
    console.error("Error fetching BTC price:", error);
    document.getElementById("btc-price").textContent = "Unable to load price";
  }
}

fetchBTCPrice();
setInterval(fetchBTCPrice, 60000);

// Load trading signals from signals.json
async function loadSignals() {
  try {
    const response = await fetch("signals.json");
    const signals = await response.json();

    const container = document.querySelector(".panel-content");

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = "signal-box";

      const html = `
        <h3>${signal.pair} — ${signal.type}</h3>
        <p>Entry: $${signal.entry}</p>
        <p>Target: $${signal.target}</p>
        <p>Stop Loss: $${signal.stop}</p>
        <div class="signal-comment">
          Reason: ${signal.comment}
        </div>
      `;

      box.innerHTML = html;
      container.appendChild(box);
    });

  } catch (error) {
    console.error("Failed to load signals:", error);
  }
}

loadSignals();
