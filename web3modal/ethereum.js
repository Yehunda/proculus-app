export class EthereumClient {
  constructor(config, chains) {
    this.config = config;
    this.chains = chains;
  }
}

export function w3mConnectors({ projectId, chains }) {
  return [
    {
      id: 'injected',
      name: 'Injected',
      ready: true
    }
  ];
}

export function w3mProvider({ projectId }) {
  return {
    request: async ({ method, params }) => {
      return Promise.resolve();
    }
  };
}
