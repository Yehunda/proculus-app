// wagmi-config.js
export function configureChains(chains, providers) {
  return {
    publicClient: providers[0],
    chains
  };
}

export function createConfig({ autoConnect, connectors, publicClient }) {
  return {
    autoConnect,
    connectors,
    publicClient
  };
}
