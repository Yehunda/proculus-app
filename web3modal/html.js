import { Web3Modal as Web3ModalLib } from './web3modal-lib/html.js';
import { EthereumClient } from './ethereum.js';
import { configureChains, createConfig } from './core.js';
import { w3mConnectors, w3mProvider } from './w3m.js';
import {
  mainnet, polygon, avalanche,
  arbitrum, optimism, base, bsc
} from './chains.js';

const projectId = 'demo'; // Gerçek project ID varsa buraya yaz

const chains = [mainnet, polygon, avalanche, arbitrum, optimism, base, bsc];

const { publicClient } = configureChains(chains, [w3mProvider({ projectId })]);

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, chains }),
  publicClient
});

const ethereumClient = new EthereumClient(wagmiConfig, chains);

export class Web3Modal {
  constructor(config = {}) {
    this.modal = new Web3ModalLib({
      projectId: config.projectId || projectId,
      themeMode: config.themeMode || 'dark',
      accentColor: config.accentColor || 'default',
      walletConnectVersion: 2
    }, ethereumClient);
  }

  openModal() {
    this.modal.openModal();
  }
}
