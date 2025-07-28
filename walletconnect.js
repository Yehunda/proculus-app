import { Web3Modal } from './web3modal/html.js';
import { EthereumClient, w3mConnectors, w3mProvider } from './web3modal/ethereum.js';
import { configureChains, createConfig } from './web3modal/core.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './web3modal/chains.js';

// ✅ Project ID – Replace this with your real one later
const projectId = 'demo';

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

// ✅ Save wallet address & UI update
async function saveWalletAddress(redirect = false) {
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

        if (typeof toggleLogoutVisibility === 'function') {
          toggleLogoutVisibility(true);
        }

        if (redirect) {
          window.location.href = 'panel.html';
        }
      }
    } catch (err) {
      console.error('Wallet address fetch failed:', err);
    }
  }
}

// ✅ On load
window.addEventListener('DOMContentLoaded', () => {
  const walletButton = document.getElementById('wallet-connect');
  const saved = localStorage.getItem('walletAddress');

  if (saved && walletButton) {
    walletButton.textContent = `${saved.slice(0, 6)}...${saved.slice(-4)}`;
    const walletSpan = document.getElementById('wallet-address');
    if (walletSpan) {
      walletSpan.textContent = `Connected: ${saved.slice(0, 6)}...${saved.slice(-4)}`;
    }
    if (typeof toggleLogoutVisibility === 'function') {
      toggleLogoutVisibility(true);
    }
  }

  // 🔌 Wallet connect click
  if (walletButton) {
    walletButton.addEventListener('click', async () => {
      if (!localStorage.getItem('walletAddress')) {
        await modal.openModal();
        await saveWalletAddress(true); // redirect to panel.html
      }
    });
  }

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => {
      saveWalletAddress();
    });
  }
});
