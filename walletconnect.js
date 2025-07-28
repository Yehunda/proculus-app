// walletconnect.js
import { EthereumClient, w3mConnectors, w3mProvider } from './web3modal/ethereum.js';
import { Web3Modal } from './web3modal/html.js';
import { configureChains, createConfig } from './web3modal/wagmi.js';
import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './web3modal/wagmi.js';

const chains = [mainnet, polygon, avalanche, arbitrum, optimism, base, bsc];
const projectId = "demo";

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
    themeMode: "dark",
    accentColor: "default",
    walletConnectVersion: 2
  },
  ethereumClient
);

const walletBtn = document.getElementById("wallet-connect");
if (walletBtn) {
  walletBtn.addEventListener("click", () => {
    modal.openModal();
  });
}
