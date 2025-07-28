import { Web3Modal } from './web3modal/html.js';
import { EthereumClient, w3mConnectors, w3mProvider } from './web3modal/ethereum.js';
import { configureChains, createConfig } from './web3modal/core.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './web3modal/chains.js';

// ✅ Web3Modal Configuration
const projectId = 'demo'; // ⚠️ Replace this with your actual project ID from WalletConnect

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

// ✅ Save wallet address and update UI
async function saveWalletAddress() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const address = accounts[0];
      if (address) {
        localStorage.setItem('walletAddress', address);

        const walletButton = document.getElementById('wallet-connect');
        const walletSpan = document.getElementById('wallet-address');

        if (walletButton) {
          walletButton.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        }

        if (walletSpan) {
          walletSpan.textContent = `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`;
        }

        // Show logout button if available
        if (typeof toggleLogoutVisibility === 'function') {
          toggleLogoutVisibility(true);
        }

        // ✅ Redirect to panel
        window.location.href = 'panel.html';
      }
    } catch (error) {
      console.error("Failed to fetch address:", error);
    }
  }
}

// ✅ Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  const walletButton = document.getElementById('wallet-connect');

  const saved = localStorage.getItem('walletAddress');
  if (saved && walletButton) {
    walletButton.textContent = `${saved.slice(0, 6)}...${saved.slice(-4)}`;
    if (typeof toggleLogoutVisibility === 'function') {
      toggleLogoutVisibility(true);
    }
  }

  if (walletButton) {
    walletButton.addEventListener('click', async () => {
      const isConnected = localStorage.getItem('walletAddress');
      if (!isConnected) {
        await modal.openModal();
        await saveWalletAddress();
      }
    });
  }

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => {
      saveWalletAddress();
    });
  }

  saveWalletAddress();
});
