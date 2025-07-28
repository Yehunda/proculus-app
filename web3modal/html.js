// html.js

export class Web3Modal {
  constructor(options, ethereumClient) {
    this.options = options;
    this.ethereumClient = ethereumClient;
  }

  openModal() {
    const walletUrl = 'https://walletconnect.com/';
    window.open(walletUrl, '_blank', 'width=600,height=700');
  }
}
