import { Web3Modal } from 'https://unpkg.com/@web3modal/html@2.7.2/dist/index.js';
import { EthereumClient, w3mConnectors, w3mProvider } from 'https://unpkg.com/@web3modal/ethereum@2.7.2/dist/index.js';
import { configureChains, createConfig } from 'https://unpkg.com/@wagmi/core@1.4.0/dist/index.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from 'https://unpkg.com/@wagmi/chains@1.4.0/dist/index.js';

const projectId = 'demo'; // kendi Project ID’n varsa buraya yaz

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
    });
  } else {
    console.error("Wallet button not found in DOM.");
  }
});
