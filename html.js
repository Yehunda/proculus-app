import { Web3Modal } from '@web3modal/html';
import { EthereumClient } from '@web3modal/ethereum';
import { walletConnectConnector } from './walletconnect';
import { wagmiConfig, chains } from './wagmi';

const ethereumClient = new EthereumClient(wagmiConfig, chains);

const modal = new Web3Modal({
  projectId: 'demo',
  themeMode: 'dark',
}, ethereumClient);

const walletBtn = document.getElementById('wallet-connect');
walletBtn.addEventListener('click', () => {
  modal.openModal();
});
