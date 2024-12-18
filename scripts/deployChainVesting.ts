import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with the account:", deployer.address);

  // Contract Deployment Parameters
  const TOKEN_ADDRESS = "0x1dd3346BB9195Fa677ceF41f9727cb515214f61f"; // Replace with the actual token address
//   const FIRST_INSTALLMENT_TIMESTAMP = Math.floor(new Date("2025-01-01T09:00:00Z").getTime() / 1000);

  console.log("Token Address:", TOKEN_ADDRESS);

  // Fetch the Contract Factory
  const ChainVesting = await ethers.getContractFactory("ChainVesting");

  // Deploy the Contract
  const chainVesting = await ChainVesting.deploy(TOKEN_ADDRESS);

  await chainVesting.waitForDeployment();
  const deployedAddress = await chainVesting.getAddress();

  console.log("ChainVesting deployed to:", deployedAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error deploying the contract:", error);
    process.exit(1);
  });
