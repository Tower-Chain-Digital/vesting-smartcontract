import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with the account:", deployer.address);

  // Contract Deployment Parameters
  const TOKEN_ADDRESS = "0x1dd3346BB9195Fa677ceF41f9727cb515214f61f"; // Replace with the actual token address

  console.log("Token Address:", TOKEN_ADDRESS);

  // Fetch the Contract Factory
  const TTVesting = await ethers.getContractFactory("TTVesting");

  // Deploy the Contract
  const ttVesting = await TTVesting.deploy(TOKEN_ADDRESS);

  await ttVesting.waitForDeployment();

  // Use await to resolve the address
  const deployedAddress = await ttVesting.getAddress();

  console.log("TTVesting deployed to:", deployedAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error deploying the contract:", error);
    process.exit(1);
  });
