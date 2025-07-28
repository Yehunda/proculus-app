// ethereum.js

import { mainnet, polygon, avalanche, arbitrum, optimism, base, bsc } from './chains.js';

export class EthereumClient {
  constructor(config, chains) {
    this.config = config;
    this.chains = chains;
    this.connectedWallet = null;
  }

  async connect() {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        this.connectedWallet = accounts[0];
        console.log('Connected account:', this.connectedWallet);
        return this.connectedWallet;
      } catch (err) {
        console.error('User denied wallet connection:', err);
        throw err;
      }
    } else {
      alert('No wallet provider found. Please install MetaMask or WalletConnect-compatible wallet.');
      throw new Error('No wallet provider');
    }
  }

  async getChainId() {
    if (!window.ethereum) return null;
    try {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      return parseInt(chainIdHex, 16);
    } catch (err) {
      console.error('Error getting chain ID:', err);
      return null;
    }
  }

  async switchNetwork(targetChainId) {
    if (!window.ethereum) return;
    const hexChainId = '0x' + targetChainId.toString(16);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }]
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        const targetChain = this.chains.find(c => c.id === targetChainId);
        if (!targetChain) throw new Error('Chain config not found');
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: hexChainId,
              chainName: targetChain.name,
              nativeCurrency: targetChain.nativeCurrency,
              rpcUrls: targetChain.rpcUrls.default.http,
              blockExplorerUrls: [targetChain.blockExplorers.default.url]
            }]
          });
        } catch (addError) {
          console.error('Add chain error:', addError);
          throw addError;
        }
      } else {
        throw switchError;
      }
    }
  }
}

export function w3mConnectors({ projectId, chains }) {
  return [
    {
      name: 'Injected',
      connect: async () => {
        if (!window.ethereum) throw new Error('No Ethereum provider found');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        return accounts[0];
      }
    }
    // Ek cüzdanlar burada listelenebilir.
  ];
}

export function w3mProvider({ projectId }) {
  return {
    request: async (args) => {
      if (!window.ethereum) throw new Error('No provider');
      return await window.ethereum.request(args);
    }
  };
}
