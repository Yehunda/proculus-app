import { Web3Modal } from './web3modal/html.js';
import { EthereumClient, w3mConnectors, w3mProvider } from './web3modal/ethereum.js';
import { configureChains, createConfig } from './web3modal/core.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './web3modal/chains.js';

// ✅ Web3Modal Config
const projectId = 'demo'; // Replace with your actual Project ID

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

// ✅ Show address and save to localStorage
async function saveWalletAddress() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const address = accounts[0];
      if (address) {
        localStorage.setItem('walletAddress', address);

        // Update button text
        const walletButton = document.getElementById('wallet-connect');
        if (walletButton) {
          walletButton.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        }

        // Optional extra display (e.g. in panel.html)
        const walletDisplay = document.getElementById('wallet-address');
        if (walletDisplay) {
          walletDisplay.textContent = `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`;
        }
      }
    } catch (error) {
      console.error("Failed to fetch address:", error);
    }
  }
}

// ✅ On page load, restore address & bind events
window.addEventListener('DOMContentLoaded', () => {
  const walletButton = document.getElementById('wallet-connect');

  // Restore from localStorage
  const saved = localStorage.getItem('walletAddress');
  if (saved && walletButton) {
    walletButton.textContent = `${saved.slice(0, 6)}...${saved.slice(-4)}`;
  }

  // Click to connect (only if not already connected)
  if (walletButton) {
    walletButton.addEventListener('click', () => {
      const isConnected = localStorage.getItem('walletAddress');
      if (!isConnected) {
        modal.openModal();
        setTimeout(saveWalletAddress, 2000);
      }
    });
  }

  // Listen for wallet account changes
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => {
      saveWalletAddress();
    });
  }

  // Trigger initial fetch
  saveWalletAddress();
});
