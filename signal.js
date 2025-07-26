document.addEventListener("DOMContentLoaded", function () {
  const container = document.getElementById("signal-container");

  const signals = [
    {
      coin: "BTC/USDT",
      direction: "LONG",
      time: "15:00 UTC",
      confidence: "High",
      source: "On-chain, Social & Technical"
    },
    {
      coin: "ETH/USDT",
      direction: "SHORT",
      time: "15:10 UTC",
      confidence: "Medium",
      source: "Technical + News"
    },
    {
      coin: "SOL/USDT",
      direction: "LONG",
      time: "15:20 UTC",
      confidence: "High",
      source: "On-chain surge"
    },
    {
      coin: "ARB/USDT",
      direction: "LONG",
      time: "15:30 UTC",
      confidence: "High",
      source: "Social Buzz + TA"
    },
    {
      coin: "MATIC/USDT",
      direction: "SHORT",
      time: "15:35 UTC",
      confidence: "Low",
      source: "Mixed sentiment"
    }
  ];

  signals.forEach((signal) => {
    const card = document.createElement("div");
    card.className = "signal-card";
    card.innerHTML = `
      <h2>${signal.coin}</h2>
      <p><strong>Direction:</strong> ${signal.direction}</p>
      <p><strong>Time:</strong> ${signal.time}</p>
      <p><strong>Confidence:</strong> ${signal.confidence}</p>
      <p><strong>Source:</strong> ${signal.source}</p>
    `;
    container.appendChild(card);
  });
});
