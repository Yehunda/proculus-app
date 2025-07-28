export class Web3Modal {
  constructor(config, ethereumClient) {
    this.config = config;
    this.ethereumClient = ethereumClient;
    this.modal = null;
    this.setupModal();
  }

  setupModal() {
    const modalDiv = document.createElement('div');
    modalDiv.id = 'web3modal-container';
    modalDiv.style.position = 'fixed';
    modalDiv.style.top = '0';
    modalDiv.style.left = '0';
    modalDiv.style.width = '100vw';
    modalDiv.style.height = '100vh';
    modalDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modalDiv.style.display = 'flex';
    modalDiv.style.justifyContent = 'center';
    modalDiv.style.alignItems = 'center';
    modalDiv.style.zIndex = '1000';
    modalDiv.innerHTML = `
      <div style="background:white;padding:30px;border-radius:10px;text-align:center;">
        <h2>Connect Wallet</h2>
        <button id="connect-metamask">MetaMask</button>
        <button id="connect-coinbase">Coinbase Wallet</button>
        <button id="connect-close">Cancel</button>
      </div>
    `;

    document.body.appendChild(modalDiv);
    modalDiv.style.display = 'none';
    this.modal = modalDiv;

    document.getElementById('connect-metamask').onclick = async () => {
      try {
        const provider = window.ethereum;
        if (!provider) throw new Error("MetaMask not found");
        await provider.request({ method: 'eth_requestAccounts' });
        console.log("Connected to MetaMask");
        this.closeModal();
      } catch (e) {
        alert("Connection failed: " + e.message);
      }
    };

    document.getElementById('connect-coinbase').onclick = () => {
      alert("Coinbase Wallet connection not yet implemented");
    };

    document.getElementById('connect-close').onclick = () => {
      this.closeModal();
    };
  }

  openModal() {
    if (this.modal) this.modal.style.display = 'flex';
  }

  closeModal() {
    if (this.modal) this.modal.style.display = 'none';
  }
}
