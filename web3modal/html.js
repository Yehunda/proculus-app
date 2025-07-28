// html.js

import { Web3Modal } from 'https://unpkg.com/@web3modal/html@2.7.2/dist/index.js';
import { EthereumClient, w3mConnectors, w3mProvider } from 'https://unpkg.com/@web3modal/ethereum@2.7.2/dist/index.js';
import { configureChains, createConfig } from './wagmi.js';
import {
  mainnet,
  polygon,
  avalanche,
  arbitrum,
  optimism,
  base,
  bsc
} from './wagmi.js';

// Supported networks
const chains = [mainnet, polygon, avalanche, arbitrum, optimism, base, bsc];

// Project ID (use your actual one in production)
const projectId = 'demo';

// Configure Wagmi and EthereumClient
const { publicClient } = configureChains(chains, [w3mProvider({ projectId })]);

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, chains }),
  publicClient
});

const ethereumClient = new EthereumClient(wagmiConfig, chains);

// Create modal instance
const modal = new Web3Modal(
  {
    projectId,
    themeMode: 'dark',
    accentColor: 'default',
    walletConnectVersion: 2
  },
  ethereumClient
);

// Connect wallet on button click
const walletBtn = document.getElementById('wallet-connect');
if (walletBtn) {
  walletBtn.addEventListener('click', () => {
    modal.openModal();
  });
}
