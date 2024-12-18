import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with the account:", deployer.address);

  // Contract Deployment Parameters
  const TOKEN_ADDRESS = "0x69D349E2009Af35206EFc3937BaD6817424729F7"; // Replace with the actual token address

  console.log("Token Address:", TOKEN_ADDRESS);
  const TTVesting = await ethers.getContractFactory("TTVesting");
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
