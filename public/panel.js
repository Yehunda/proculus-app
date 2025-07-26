console.log("JS file loaded");

// === BTC LIVE PRICE ===
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

// === LOAD SIGNALS ===
async function loadSignals() {
  console.log("Trying to fetch signals...");
  try {
    const response = await fetch("public/signals.json");
    const signals = await response.json();
    console.log("Signals received:", signals);
    
    const container = document.getElementById("signals-container");

    signals.forEach(signal => {
      const box = document.createElement("div");
      box.className = `signal-box ${signal.type.toLowerCase()}`;
      box.innerHTML = `
        <h3>${signal.pair} — ${signal.type}</h3>
        <p>Entry: $${signal.entry}</p>
        <p>Target: $${signal.target}</p>
        <p>Stop Loss: $${signal.stop}</p>
        <div class="signal-comment">Reason: ${signal.comment}</div>
      `;
      container.appendChild(box);
    });
  } catch (error) {
    console.error("Failed to load signals:", error);
  }
}
loadSignals();

// === FILTER BUTTONS ===
function filterSignals(type) {
  const boxes = document.querySelectorAll(".signal-box");
  boxes.forEach(box => {
    box.style.display = type === "all" || box.classList.contains(type) ? "block" : "none";
  });
}

// === MODAL SYSTEM ===
const modal = document.getElementById("modal");
const modalText = document.getElementById("modal-text");
const confirmBtn = document.getElementById("confirm-btn");
const closeModal = document.getElementById("closeModal");

document.querySelectorAll(".subscribe-btn").forEach(button => {
  button.addEventListener("click", () => {
    const plan = button.closest(".card").querySelector("h3").innerText;
    modalText.innerText = `Do you want to activate the ${plan} plan?`;
    modal.style.display = "block";
    confirmBtn.setAttribute("data-plan", plan.toLowerCase());
  });
});

confirmBtn.onclick = () => {
  const selectedPlan = confirmBtn.getAttribute("data-plan");
  localStorage.setItem("selectedPlan", selectedPlan);
  alert(`"${selectedPlan}" plan activated!`);
  modal.style.display = "none";
};

closeModal.onclick = () => {
  modal.style.display = "none";
};

window.onclick = (event) => {
  if (event.target.classList.contains("modal")) {
    modal.style.display = "none";
  }
};

// === MOBILE MENU TOGGLE ===
const hamburger = document.getElementById("hamburger-menu");
const mobileMenu = document.getElementById("mobile-menu");

hamburger.addEventListener("click", () => {
  mobileMenu.classList.toggle("show");
});
window.addEventListener("click", function(event) {
  if (!hamburger.contains(event.target) && !mobileMenu.contains(event.target)) {
    mobileMenu.classList.remove("show");
  }
});
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed");
  fetchBTCPrice();
  setInterval(fetchBTCPrice, 60000);
  loadSignals();
});
