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

    const container = document.getElementById("signals-container");

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.type.toLowerCase()}`;

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

function filterSignals(type) {
  const boxes = document.querySelectorAll(".signal-box");

  boxes.forEach(box => {
    if (type === "all") {
      box.style.display = "block";
    } else {
      box.style.display = box.classList.contains(type) ? "block" : "none";
    }
  });
}

// MODAL EVENTLERİ
document.querySelectorAll('.subscribe-btn').forEach(button => {
  button.addEventListener('click', () => {
    const plan = button.closest('.card').querySelector('h3').innerText;
    document.getElementById('modal-text').innerText = `Do you want to activate the ${plan} plan?`;
    document.getElementById('modal').style.display = 'block';
    document.getElementById('confirm-btn').setAttribute('data-plan', plan.toLowerCase());
  });
});

document.getElementById('closeModal').onclick = () => {
  document.getElementById('modal').style.display = 'none';
};

document.getElementById('confirm-btn').onclick = () => {
  const selectedPlan = document.getElementById('confirm-btn').getAttribute('data-plan');
  localStorage.setItem('selectedPlan', selectedPlan);
  alert(`"${selectedPlan}" plan activated!`);
  document.getElementById('modal').style.display = 'none';
};

window.onclick = (event) => {
  if (event.target.classList.contains('modal')) {
    document.getElementById('modal').style.display = 'none';
  }
};
