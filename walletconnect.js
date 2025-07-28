import { Web3Modal } from './web3modal/html.js';
import { EthereumClient, w3mConnectors, w3mProvider } from './web3modal/ethereum.js';
import { configureChains, createConfig } from './web3modal/core.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './web3modal/chains.js';

const projectId = 'demo'; // Gerçek ID varsa buraya yaz

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
    console.error("Wallet button not found.");
  }
});
