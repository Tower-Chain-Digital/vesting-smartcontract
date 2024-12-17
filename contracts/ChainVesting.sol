// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ChainlinkKeeperCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

contract ChainVesting is Ownable, ReentrancyGuard, ChainlinkKeeperCompatibleInterface {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    uint256 public constant TOTAL_INSTALLMENTS = 12; // Number of installments
    uint256 public constant DEPOSIT_LIMIT = 3_480_000 * 10 ** 18; // Total deposit limit
    uint256 public immutable FIRST_INSTALLMENT_TIMESTAMP = 1735722000; // 1st Jan 2025, 09:00 GMT

    uint256 public tokensPerInstallment;
    uint256 public totalTokens;
    uint256 public claimedInstallments;

    bool public vestingInitialized = false;

    event TokensDeposited(address indexed depositor, uint256 amount);
    event TokensReleased(uint256 installmentNumber, uint256 amount);
    event VestingInitialized(uint256 firstInstallmentTimestamp, uint256 tokensPerInstallment);
    event TokensClaimedManually(uint256 amount);

    constructor(IERC20 _token) {
        token = _token;
    }

    /**
     * @dev Deposit tokens into the contract.
     */
    function depositTokens(uint256 amount) external nonReentrant {
        require(!vestingInitialized, "Vesting already initialized");
        require(amount == DEPOSIT_LIMIT, "Deposit must match the required limit");

        totalTokens = amount;
        tokensPerInstallment = totalTokens / TOTAL_INSTALLMENTS;

        vestingInitialized = true;
        token.safeTransferFrom(msg.sender, address(this), amount);



        emit TokensDeposited(msg.sender, amount);
        emit VestingInitialized(FIRST_INSTALLMENT_TIMESTAMP, tokensPerInstallment);
    }

    /**
     * @dev Chainlink Automation: Check if tokens can be released.
     */
    function checkUpkeep(bytes calldata /* checkData */) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (!vestingInitialized) return (false, "");

        uint256 currentInstallment = _getCurrentInstallment();
        if (currentInstallment > claimedInstallments) {
            upkeepNeeded = true;
            performData = abi.encode(currentInstallment);
        }
    }

    /**
     * @dev Chainlink Automation: Automatically release tokens.
     */
    function performUpkeep(bytes calldata performData) external override {
        require(vestingInitialized, "Vesting is not initialized");

        uint256 currentInstallment = abi.decode(performData, (uint256));
        require(currentInstallment > claimedInstallments, "No new installments to claim");

        uint256 installmentsToClaim = currentInstallment - claimedInstallments;
        uint256 tokensToClaim = installmentsToClaim * tokensPerInstallment;

        claimedInstallments = currentInstallment;

        token.safeTransfer(owner(), tokensToClaim);

        emit TokensReleased(currentInstallment, tokensToClaim);
    }

    /**
     * @dev Manual claim function for the owner.
     */
    function claimTokensManually() external onlyOwner nonReentrant {
        require(vestingInitialized, "Vesting is not initialized");

        uint256 currentInstallment = _getCurrentInstallment();
        require(currentInstallment > claimedInstallments, "No tokens available to claim");

        uint256 installmentsToClaim = currentInstallment - claimedInstallments;
        uint256 tokensToClaim = installmentsToClaim * tokensPerInstallment;

        require(tokensToClaim > 0, "No tokens to claim");

        claimedInstallments = currentInstallment;

        token.safeTransfer(owner(), tokensToClaim);

        emit TokensClaimedManually(tokensToClaim);
    }

    /**
     * @dev Calculate the current installment based on the FIRST_INSTALLMENT_TIMESTAMP.
     */
    function _getCurrentInstallment() internal view returns (uint256) {
        if (block.timestamp < FIRST_INSTALLMENT_TIMESTAMP) return 0;

        uint256 monthsElapsed = (block.timestamp - FIRST_INSTALLMENT_TIMESTAMP) / 30 days;
        return monthsElapsed + 1 > TOTAL_INSTALLMENTS ? TOTAL_INSTALLMENTS : monthsElapsed + 1;
    }

    /**
     * @dev Get releasable tokens.
     */
    function getReleasableAmount() public view returns (uint256) {
        uint256 currentInstallment = _getCurrentInstallment();
        uint256 installmentsToClaim = currentInstallment - claimedInstallments;
        return installmentsToClaim * tokensPerInstallment;
    }

    /**
     * @dev Ensure no Ether is sent to the contract.
     */
    receive() external payable {
        revert("Contract does not accept Ether");
    }
}
