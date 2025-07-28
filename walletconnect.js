import { Web3Modal } from './web3modal/html.js';
import { EthereumClient, w3mConnectors, w3mProvider } from './web3modal/ethereum.js';
import { configureChains, createConfig } from './web3modal/core.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './web3modal/chains.js';

const projectId = 'demo'; // Replace with your actual Project ID if available

const chains = [mainnet, polygon, avalanche, arbitrum, optimism, base, bsc];

const { publicClient } = configureChains(chains, [w3mProvider({ projectId })]);

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, chains }),
  publicClient
});

const ethereumClient = new EthereumClient(wagmiConfig, chains);

const modal = new Web3Modal(
  {
    projectId,
    themeMode: 'dark',
    accentColor: 'default',
    walletConnectVersion: 2
  },
  ethereumClient
);

window.addEventListener('DOMContentLoaded', () => {
  const walletButton = document.getElementById('wallet-connect');
  if (walletButton) {
    walletButton.addEventListener('click', () => {
      modal.openModal();
      setTimeout(showWalletAddress, 2000);
    });
  } else {
    console.error("Wallet button not found.");
  }
});

async function showWalletAddress() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const address = accounts[0];
      if (address) {
        const walletDisplay = document.getElementById('wallet-address');
        if (walletDisplay) {
          walletDisplay.textContent = `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`;
        } else {
          console.warn("wallet-address element not found.");
        }
      }
    } catch (error) {
      console.error("Unable to fetch wallet address:", error);
    }
  } else {
    console.warn("window.ethereum not available.");
  }
}
