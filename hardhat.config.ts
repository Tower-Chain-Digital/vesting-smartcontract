import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    arthera: {
      url: process.env.ARTHERA_URL_MAINNET,
      chainId: 10242,
      accounts: process.env.PK_ARTHERA_MAINNET !== undefined ? [process.env.PK_ARTHERA_MAINNET] : [],
    }
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  }
};

export default config;