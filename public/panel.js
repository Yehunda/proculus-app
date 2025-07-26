// Fetch live BTC price and update the DOM
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

// Initial fetch and refresh every 60 seconds
fetchBTCPrice();
setInterval(fetchBTCPrice, 60000);
