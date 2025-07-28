export class Web3Modal {
  constructor(config, ethereumClient) {
    this.config = config;
    this.ethereumClient = ethereumClient;
  }

  openModal() {
    console.log("Web3Modal opened (mock mode)");
    // You can replace this with actual modal UI later
    alert("Web3Modal opened (mock mode)");
  }
}
