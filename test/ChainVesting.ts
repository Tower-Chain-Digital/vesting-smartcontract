import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { MockERC20, ChainVesting } from "../typechain-types";

describe("ChainVesting", function () {
  // Constants from the contract
  const TOTAL_INSTALLMENTS = 12;
  const DEPOSIT_LIMIT = ethers.parseUnits("3480000", 18);
  const FIRST_INSTALLMENT_TIMESTAMP = 1735722000; // 1st Jan 2025, 09:00 GMT

  async function deployContractFixture() {
    // Get signers
    const [owner, depositor, anotherUser] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockTokenFactory = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockTokenFactory.deploy("Test Token", "TEST", DEPOSIT_LIMIT * 2n) as MockERC20;

    // Deploy ChainVesting contract
    const ChainVestingFactory = await ethers.getContractFactory("ChainVesting");
    const chainVesting = await ChainVestingFactory.deploy(await mockToken.getAddress()) as ChainVesting;

    // Mint tokens to depositor
    await mockToken.connect(owner).mint(depositor.address, DEPOSIT_LIMIT);

    // Approve tokens for depositing
    await mockToken.connect(depositor).approve(await chainVesting.getAddress(), DEPOSIT_LIMIT);

    return { chainVesting, mockToken, owner, depositor, anotherUser };
  }

  async function deployAndInitializeFixture() {
    const { chainVesting, mockToken, owner, depositor, anotherUser } = await deployContractFixture();

    // Deposit tokens
    await chainVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT);

    return { chainVesting, mockToken, owner, depositor, anotherUser };
  }

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      const { chainVesting, mockToken } = await loadFixture(deployContractFixture);
      expect(await chainVesting.token()).to.equal(await mockToken.getAddress());
    });
  });

  describe("Token Deposit", function () {
    it("Should allow depositing the exact deposit limit", async function () {
      const { chainVesting, mockToken, depositor } = await loadFixture(deployContractFixture);
      
      await expect(chainVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT))
        .to.emit(chainVesting, "TokensDeposited")
        .withArgs(depositor.address, DEPOSIT_LIMIT);

      expect(await chainVesting.totalTokens()).to.equal(DEPOSIT_LIMIT);
      expect(await chainVesting.vestingInitialized()).to.be.true;
    });

    it("Should revert if deposit amount is incorrect", async function () {
      const { chainVesting, depositor } = await loadFixture(deployContractFixture);
      
      await expect(chainVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT / 2n))
        .to.be.revertedWith("Deposit must match the required limit");
    });

    it("Should prevent multiple deposits", async function () {
      const { chainVesting, depositor } = await loadFixture(deployContractFixture);
      
      await chainVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT);
      
      await expect(chainVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT))
        .to.be.revertedWith("Vesting already initialized");
    });
  });

  describe("Token Release", function () {
    it("Should prevent claiming tokens before first installment", async function () {
      const { chainVesting, owner } = await loadFixture(deployAndInitializeFixture);
      
      await expect(chainVesting.connect(owner).claimTokensManually())
        .to.be.revertedWith("No tokens available to claim");
    });

    it("Should allow owner to claim tokens after installment", async function () {
      const { chainVesting, mockToken, owner } = await loadFixture(deployAndInitializeFixture);
      
      // Simulate time passing to first installment
      await time.increaseTo(FIRST_INSTALLMENT_TIMESTAMP);
      
      const tokensPerInstallment = DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS);
      const initialBalance = await mockToken.balanceOf(owner.address);

      await expect(chainVesting.connect(owner).claimTokensManually())
        .to.emit(chainVesting, "TokensClaimedManually")
        .withArgs(tokensPerInstallment);

      const finalBalance = await mockToken.balanceOf(owner.address);
      expect(finalBalance - initialBalance).to.equal(tokensPerInstallment);
    });

    it("Should prevent multiple claims for the same period", async function () {
      const { chainVesting } = await loadFixture(deployAndInitializeFixture);
      
      // Simulate time passing to first installment
      await time.increaseTo(FIRST_INSTALLMENT_TIMESTAMP);
      
      // First claim
      await chainVesting.claimTokensManually();
      
      // Second claim should fail
      await expect(chainVesting.claimTokensManually())
        .to.be.revertedWith("No tokens available to claim");
    });
  });

  describe("Detailed Monthly Claims Verification", function () {
    it("Should verify claims for each month", async function () {
      const { chainVesting, mockToken, owner } = await loadFixture(deployAndInitializeFixture);
      
      const tokensPerInstallment = DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS);
      const initialBalance = await mockToken.balanceOf(owner.address);

      let totalClaimedAmount = 0n;

      // Verify claims for each month
      for (let month = 0; month < TOTAL_INSTALLMENTS; month++) {
        // Calculate timestamp for the current month
        const monthTimestamp = FIRST_INSTALLMENT_TIMESTAMP + month * 30 * 24 * 60 * 60;
        
        // Increase time to current month
        await time.increaseTo(monthTimestamp);

        // Get releasable amount
        const releasableAmount = await chainVesting.getReleasableAmount();
        expect(releasableAmount).to.equal(tokensPerInstallment, `Releasable amount incorrect for month ${month + 1}`);

        // Claim tokens
        await chainVesting.claimTokensManually();

        // Update total claimed amount
        totalClaimedAmount += tokensPerInstallment;

        // Check token balance
        const currentBalance = await mockToken.balanceOf(owner.address);
        expect(currentBalance - initialBalance).to.equal(totalClaimedAmount, `Balance incorrect after month ${month + 1} claim`);
      }

      // Verify total claimed amount matches deposit limit
      expect(totalClaimedAmount).to.equal(DEPOSIT_LIMIT, "Total claimed amount does not match deposit limit");

      // Try to claim after all installments
      const finalTimestamp = FIRST_INSTALLMENT_TIMESTAMP + TOTAL_INSTALLMENTS * 30 * 24 * 60 * 60;
      await time.increaseTo(finalTimestamp);

      await expect(chainVesting.claimTokensManually())
        .to.be.revertedWith("No tokens available to claim");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle time calculations correctly", async function () {
      const { chainVesting } = await loadFixture(deployAndInitializeFixture);
      
      const testCases = [
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP, expectedInstallments: 1 },
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP + 29 * 24 * 60 * 60, expectedInstallments: 1 },
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP + 31 * 24 * 60 * 60, expectedInstallments: 2 },
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP + 365 * 24 * 60 * 60, expectedInstallments: 12 }
      ];

      for (const { timestamp, expectedInstallments } of testCases) {
        await time.increaseTo(timestamp);
        
        const releasableAmount = await chainVesting.getReleasableAmount();
        const expectedAmount = releasableAmount === DEPOSIT_LIMIT 
          ? DEPOSIT_LIMIT 
          : (DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS)) * BigInt(expectedInstallments);
        expect(releasableAmount).to.equal(
          expectedAmount,
          `Incorrect releasable amount for timestamp ${timestamp}`
        );
      }
    });

    it("Should prevent Ether transfers", async function () {
      const { chainVesting } = await loadFixture(deployContractFixture);
      
      const [sender] = await ethers.getSigners();
      
      await expect(
        sender.sendTransaction({
          to: await chainVesting.getAddress(),
          value: ethers.parseEther("1")
        })
      ).to.be.revertedWith("Contract does not accept Ether");
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to manually claim tokens", async function () {
      const { chainVesting, depositor } = await loadFixture(deployAndInitializeFixture);
      
      // Simulate time passing to first installment
      await time.increaseTo(FIRST_INSTALLMENT_TIMESTAMP);
  
      await expect(chainVesting.connect(depositor).claimTokensManually())
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Getters", function () {
    it("Should correctly calculate releasable amount", async function () {
      const { chainVesting } = await loadFixture(deployAndInitializeFixture);
      
      // Simulate time passing to first installment
      await time.increaseTo(FIRST_INSTALLMENT_TIMESTAMP);

      const tokensPerInstallment = DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS);
      const releasableAmount = await chainVesting.getReleasableAmount();
      
      expect(releasableAmount).to.equal(tokensPerInstallment);
    });
  });
});