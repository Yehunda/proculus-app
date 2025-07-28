import { configureChains, createConfig } from '@wagmi/core';
import { publicProvider } from '@wagmi/core/providers/public';
import {
  mainnet,
  polygon,
  arbitrum,
  avalanche,
  optimism,
  base,
  bsc,
} from '@wagmi/core/chains';

export const { chains, publicClient } = configureChains(
  [mainnet, polygon, arbitrum, avalanche, optimism, base, bsc],
  [publicProvider()],
);

export const wagmiConfig = createConfig({
  autoConnect: true,
  publicClient,
});
