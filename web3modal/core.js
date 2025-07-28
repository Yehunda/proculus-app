// core.js
import { configureChains as wagmiConfigureChains } from './wagmi-config.js';
import { createConfig as wagmiCreateConfig } from './wagmi-config.js';

export const configureChains = wagmiConfigureChains;
export const createConfig = wagmiCreateConfig;
