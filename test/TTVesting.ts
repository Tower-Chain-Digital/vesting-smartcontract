import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { MockERC20, TTVesting } from "../typechain-types";

describe("TTVesting", function () {
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

    // Deploy TTVesting contract
    const TTVestingFactory = await ethers.getContractFactory("TTVesting");
    const ttVesting = await TTVestingFactory.deploy(await mockToken.getAddress()) as TTVesting;


    // Mint tokens to depositor
    await mockToken.connect(owner).mint(depositor.address, DEPOSIT_LIMIT);

    // Approve tokens for depositing
    await mockToken.connect(depositor).approve(await ttVesting.getAddress(), DEPOSIT_LIMIT);

    return { ttVesting, mockToken, owner, depositor, anotherUser };

  }

  async function deployAndInitializeFixture() {
    const { ttVesting, mockToken, owner, depositor, anotherUser } = await deployContractFixture();

    // Deposit tokens
    await ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT);

    // Initialize vesting
    await ttVesting.initializeVesting();

    return { ttVesting, mockToken, owner, depositor, anotherUser };
  }

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      const { ttVesting, mockToken } = await loadFixture(deployContractFixture);
      expect(await ttVesting.token()).to.equal(await mockToken.getAddress());
    });
  });

  describe("Token Deposit", function () {
    it("Should revert if deposit is made with a different token address", async function () {
      const { ttVesting, depositor } = await loadFixture(deployContractFixture);
      
      // Deploy another mock token
      const MockTokenFactory = await ethers.getContractFactory("MockERC20");
      const wrongToken = await MockTokenFactory.deploy("Wrong Token", "WRONG", DEPOSIT_LIMIT * 2n);

      // Mint tokens to depositor
      await wrongToken.connect(depositor).mint(depositor.address, DEPOSIT_LIMIT);

      // Approve wrong token for deposit
      await wrongToken.connect(depositor).approve(ttVesting.target, DEPOSIT_LIMIT);

      // Try to deposit with wrong token
      await expect(ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT))
        .to.be.revertedWith("Token address does not match the required deposit token");
    });
    it("Should allow depositing the exact deposit limit", async function () {
      const { ttVesting, mockToken, depositor } = await loadFixture(deployContractFixture);
      
      await expect(ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT))
        .to.emit(ttVesting, "TokensDeposited")
        .withArgs(depositor.address, DEPOSIT_LIMIT);

      expect(await ttVesting.totalTokens()).to.equal(DEPOSIT_LIMIT);
    });

    it("Should revert if deposit amount is incorrect", async function () {
      const { ttVesting, depositor } = await loadFixture(deployContractFixture);
      
      await expect(ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT / 2n))
        .to.be.revertedWith("Deposit must match the required amount");
    });
    it("Should prevent multiple deposits", async function () {
      const { ttVesting, depositor } = await loadFixture(deployContractFixture);
      await ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT);
      await ttVesting.initializeVesting();
      await expect(ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT))
        .to.be.revertedWith("Tokens already deposited");
    });
    
  });

  describe("Vesting Initialization", function () {
    it("Should allow owner to initialize vesting", async function () {
      const { ttVesting, depositor } = await loadFixture(deployContractFixture);
      
      // First deposit tokens
      await ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT);
      
      const tokensPerInstallment = DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS);
      
      await expect(ttVesting.initializeVesting())
        .to.emit(ttVesting, "VestingInitialized")
        .withArgs(FIRST_INSTALLMENT_TIMESTAMP, tokensPerInstallment);
      
      expect(await ttVesting.vestingInitialized()).to.be.true;
    });

    it("Should prevent re-initialization", async function () {
      const { ttVesting, depositor } = await loadFixture(deployContractFixture);
      
      // First deposit tokens
      await ttVesting.connect(depositor).depositTokens(DEPOSIT_LIMIT);
      
      await ttVesting.initializeVesting();
      
      await expect(ttVesting.initializeVesting())
        .to.be.revertedWith("Vesting has already been initialized");
    });
  });

  describe("Token Claims", function () {
    it("Should prevent claiming before vesting start", async function () {
      const { ttVesting, depositor } = await loadFixture(deployAndInitializeFixture);
      
      await expect(ttVesting.claimTokens())
        .to.be.revertedWith("Vesting has not started");
    });

    it("Should allow claiming tokens after vesting start", async function () {
      const { ttVesting, mockToken, owner, depositor } = await loadFixture(deployAndInitializeFixture);
      
      // Simulate time passing to vesting start
      await time.increaseTo(FIRST_INSTALLMENT_TIMESTAMP);
      
      const tokensPerInstallment = DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS);
      
      await expect(ttVesting.claimTokens())
        .to.emit(ttVesting, "TokensClaimed")
        .withArgs(owner.address, tokensPerInstallment);
    });

    it("Should calculate available installments correctly", async function () {
      const { ttVesting, depositor } = await loadFixture(deployAndInitializeFixture);
      
      // Check available installments before start
      expect(await ttVesting.getAvailableInstallments()).to.equal(0);
      
      // Simulate time passing to vesting start
      await time.increaseTo(FIRST_INSTALLMENT_TIMESTAMP);
      
      // Should now have first installment available
      expect(await ttVesting.getAvailableInstallments()).to.equal(1);
    });
  });

  describe("Detailed Monthly Claims Verification", function () {
    it("Should verify claims for each month individually", async function () {
      const { ttVesting, mockToken, owner } = await loadFixture(deployAndInitializeFixture);
      
      const tokensPerInstallment = DEPOSIT_LIMIT / BigInt(TOTAL_INSTALLMENTS);
      const initialBalance = await mockToken.balanceOf(owner.address);

      // Track claimed amounts for each month
      let totalClaimedAmount = 0n;

      // Verify claims for each month
      for (let month = 0; month < TOTAL_INSTALLMENTS; month++) {
        // Calculate timestamp for the current month
        const monthTimestamp = FIRST_INSTALLMENT_TIMESTAMP + month * 30 * 24 * 60 * 60;
        
        // Increase time to current month
        await time.increaseTo(monthTimestamp);

        // Check available installments
        const availableInstallments = await ttVesting.getAvailableInstallments();
        expect(availableInstallments).to.equal(month + 1, `Available installments incorrect for month ${month + 1}`);

        // Check releasable amount
        const releasableAmount = await ttVesting.getReleasableAmount();
        expect(releasableAmount).to.equal(tokensPerInstallment, `Releasable amount incorrect for month ${month + 1}`);

        // Claim tokens
        const claimTx = await ttVesting.claimTokens();

        // Verify claim event
        await expect(claimTx)
          .to.emit(ttVesting, "TokensClaimed")
          .withArgs(owner.address, tokensPerInstallment);

        // Update total claimed amount
        totalClaimedAmount += tokensPerInstallment;

        // Check claimed installments
        const claimedInstallments = await ttVesting.claimedInstallments();
        expect(claimedInstallments).to.equal(month + 1, `Claimed installments incorrect for month ${month + 1}`);

        // Check token balance
        const currentBalance = await mockToken.balanceOf(owner.address);
        expect(currentBalance - initialBalance).to.equal(totalClaimedAmount, `Balance incorrect after month ${month + 1} claim`);
      }

      // Verify total claimed amount matches deposit limit
      expect(totalClaimedAmount).to.equal(DEPOSIT_LIMIT, "Total claimed amount does not match deposit limit");

      // Try to claim after all installments
      const finalTimestamp = FIRST_INSTALLMENT_TIMESTAMP + TOTAL_INSTALLMENTS * 30 * 24 * 60 * 60;
      await time.increaseTo(finalTimestamp);

      await expect(ttVesting.claimTokens())
        .to.be.revertedWith("No tokens available to claim");
    });

    it("Should prevent claiming tokens out of sequence", async function () {
      const { ttVesting } = await loadFixture(deployAndInitializeFixture);
      
      // Try to claim multiple months at once
      const secondMonthTimestamp = FIRST_INSTALLMENT_TIMESTAMP + 2 * 30 * 24 * 60 * 60;
      await time.increaseTo(secondMonthTimestamp);

      // Claim tokens
      await ttVesting.claimTokens();

      // Verify claimed installments
      const claimedInstallments = await ttVesting.claimedInstallments();
      expect(claimedInstallments).to.equal(3, "Claimed installments should be 3 for third month");
    });
  });

  describe("Edge Cases", function () {
    it("Should prevent Ether transfers", async function () {
      const { ttVesting } = await loadFixture(deployContractFixture);
      
      const [sender] = await ethers.getSigners();
      
      await expect(
        sender.sendTransaction({
          to: await ttVesting.getAddress(),
          value: ethers.parseEther("1")
        })
      ).to.be.revertedWith("Contract does not accept Ether");
    });

    it("Should calculate months elapsed correctly", async function () {
      const { ttVesting } = await loadFixture(deployContractFixture);
      
      // This is an internal method, so we'll use a public method that calls it internally
      const { ttVesting: initializedVesting, depositor } = await deployAndInitializeFixture();
      
      // Simulate different timestamp scenarios
      const testCases = [
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP, expectedMonths: 1 },
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP + 29 * 24 * 60 * 60, expectedMonths: 1 },
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP + 31 * 24 * 60 * 60, expectedMonths: 2 },
        { timestamp: FIRST_INSTALLMENT_TIMESTAMP + 365 * 24 * 60 * 60, expectedMonths: 13 }
      ];

      for (const { timestamp, expectedMonths } of testCases) {
        await time.increaseTo(timestamp);
        const availableInstallments = await initializedVesting.getAvailableInstallments();
        expect(availableInstallments).to.equal(
          expectedMonths > TOTAL_INSTALLMENTS ? TOTAL_INSTALLMENTS : expectedMonths, 
          `Incorrect months elapsed for timestamp ${timestamp}`
        );
      }
    });
  });
});