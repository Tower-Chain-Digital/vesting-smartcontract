import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contract with account:", deployer.address);

    // Specify the initial supply: 10,000,000 tokens (with 18 decimals)
    const initialSupply = ethers.parseEther("10000000");

    // Compile the contract and deploy
    const Token = await ethers.getContractFactory("TestToken");
    const token = await Token.deploy(initialSupply);

    // Wait for the deployment to complete
    await token.waitForDeployment();

    console.log("TestToken deployed to:", await token.getAddress());
    console.log("Initial supply:", initialSupply.toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error deploying contract:", error);
        process.exit(1);
    });
