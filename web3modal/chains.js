export const mainnet = {
  id: 1,
  name: 'Ethereum',
  network: 'mainnet',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.ankr.com/eth']
    }
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://etherscan.io'
    }
  }
};

export const polygon = {
  id: 137,
  name: 'Polygon',
  network: 'polygon',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://polygon-rpc.com']
    }
  },
  blockExplorers: {
    default: {
      name: 'Polygonscan',
      url: 'https://polygonscan.com'
    }
  }
};

export const avalanche = {
  id: 43114,
  name: 'Avalanche',
  network: 'avalanche',
  nativeCurrency: {
    name: 'AVAX',
    symbol: 'AVAX',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://api.avax.network/ext/bc/C/rpc']
    }
  },
  blockExplorers: {
    default: {
      name: 'Snowtrace',
      url: 'https://snowtrace.io'
    }
  }
};

export const arbitrum = {
  id: 42161,
  name: 'Arbitrum One',
  network: 'arbitrum',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://arb1.arbitrum.io/rpc']
    }
  },
  blockExplorers: {
    default: {
      name: 'Arbiscan',
      url: 'https://arbiscan.io'
    }
  }
};

export const optimism = {
  id: 10,
  name: 'Optimism',
  network: 'optimism',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://mainnet.optimism.io']
    }
  },
  blockExplorers: {
    default: {
      name: 'Optimism Explorer',
      url: 'https://optimistic.etherscan.io'
    }
  }
};

export const base = {
  id: 8453,
  name: 'Base',
  network: 'base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://mainnet.base.org']
    }
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://basescan.org'
    }
  }
};

export const bsc = {
  id: 56,
  name: 'Binance Smart Chain',
  network: 'bsc',
  nativeCurrency: {
    name: 'Binance Coin',
    symbol: 'BNB',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-dataseed.binance.org']
    }
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://bscscan.com'
    }
  }
};
