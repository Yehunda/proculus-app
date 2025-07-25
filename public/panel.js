document.addEventListener("DOMContentLoaded", () => {
  const user = {
    name: "Yehunda",
    role: "Founder & Admin",
    maxSignals: "Unlimited"
  };

  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-role").textContent = user.role;
  document.getElementById("user-signals").textContent = user.maxSignals;

  const now = new Date();
  document.getElementById("last-update").textContent = now.toLocaleString();

  // Simulated signal example
  const signalBox = document.getElementById("signal-box");
  const signals = [
    {
      pair: "TIAUSDT",
      direction: "LONG",
      reason: "RSI oversold + On-chain whale accumulation",
      confidence: "High"
    },
    {
      pair: "ARBUSDT",
      direction: "SHORT",
      reason: "Volume drop + Bearish divergence",
      confidence: "Medium"
    }
  ];

  signals.forEach(signal => {
    const div = document.createElement("div");
    div.classList.add("signal");
    div.innerHTML = `
      <h3>${signal.pair} → ${signal.direction}</h3>
      <p><strong>Reason:</strong> ${signal.reason}</p>
      <p><strong>Confidence:</strong> ${signal.confidence}</p>
    `;
    signalBox.appendChild(div);
  });
});
