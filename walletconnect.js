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

const chains = [mainnet, polygon, avalanche, arbitrum, optimism, base, bsc];
const projectId = 'demo';

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

const walletButton = document.getElementById('wallet-connect');
if (walletButton) {
  walletButton.addEventListener('click', () => {
    modal.openModal();
  });
}
