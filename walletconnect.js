// walletconnect.js

import { EthereumClient, w3mConnectors, w3mProvider } from './ethereum.js';
import { Web3Modal } from './html.js';
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

// Supported blockchain networks
const chains = [mainnet, polygon, avalanche, arbitrum, optimism, base, bsc];

// Project ID from Web3Modal dashboard (use your own in production)
const projectId = 'demo';

// Configure providers
const { publicClient } = configureChains(chains, [w3mProvider({ projectId })]);

// Create Wagmi config
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, chains }),
  publicClient
});

// Initialize Ethereum client
const ethereumClient = new EthereumClient(wagmiConfig, chains);

// Create Web3Modal instance
const modal = new Web3Modal(
  {
    projectId,
    themeMode: 'dark',
    accentColor: 'default',
    walletConnectVersion: 2
  },
  ethereumClient
);

// Attach click event to the login/signup button
const walletButton = document.getElementById('wallet-connect');
if (walletButton) {
  walletButton.addEventListener('click', () => {
    modal.openModal();
  });
}
