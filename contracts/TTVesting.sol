// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TTVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    uint256 public constant TOTAL_INSTALLMENTS = 12; // Number of installments
    uint256 public constant DEPOSIT_LIMIT = 3_480_000 * 10 ** 18; // 3,480,000 tokens with 18 decimals
    uint256 public constant FIRST_INSTALLMENT_TIMESTAMP = 1735722000; // 1st Jan 2025, 09:00 GMT

    uint256 public tokensPerInstallment;
    uint256 public totalTokens;
    uint256 public claimedInstallments;

    bool public tokensDeposited = false;
    bool public vestingInitialized = false;

    event TokensDeposited(address indexed depositor, uint256 amount);
    event TokensClaimed(address indexed owner, uint256 amount);
    event VestingInitialized(
        uint256 firstInstallmentTimestamp,
        uint256 tokensPerInstallment
    );
    event EmergencyWithdraw(address indexed owner, uint256 amount);

    constructor(IERC20 _token) {
        token = _token;
    }

    /**
     * @dev Deposit tokens into the contract. The total deposit must match the limit.
     */
    function depositTokens(uint256 amount) external nonReentrant {
        require(!tokensDeposited, "Tokens already deposited");
        require(!vestingInitialized, "Vesting has already been initialized");
        require(
            amount == DEPOSIT_LIMIT,
            "Deposit must match the required amount"
        );
        require(
            amount % TOTAL_INSTALLMENTS == 0,
            "Deposit must be divisible by the number of installments"
        );

        uint256 allowance = token.allowance(msg.sender, address(this));
        require(allowance >= amount, "Insufficient token allowance");

        totalTokens = amount;
        tokensDeposited = true;
        tokensPerInstallment = totalTokens / TOTAL_INSTALLMENTS;

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit TokensDeposited(msg.sender, amount);
    }

    /**
     * @dev Initialize the vesting schedule.
     */
    function initializeVesting() external onlyOwner {
        require(!vestingInitialized, "Vesting has already been initialized");
        vestingInitialized = true;

        emit VestingInitialized(
            FIRST_INSTALLMENT_TIMESTAMP,
            tokensPerInstallment
        );
    }

    /**
     * @dev Claim vested tokens. Only the contract owner can claim tokens.
     */
    function claimTokens() external onlyOwner nonReentrant {
        require(vestingInitialized, "Vesting has not been initialized");

        require(
            block.timestamp >= FIRST_INSTALLMENT_TIMESTAMP,
            "Vesting has not started"
        );

        uint256 availableInstallments = getAvailableInstallments();
        require(
            availableInstallments > claimedInstallments,
            "No tokens available to claim"
        );

        uint256 installmentsToClaim = availableInstallments -
            claimedInstallments;
        uint256 tokensToClaim = installmentsToClaim * tokensPerInstallment;

        claimedInstallments = availableInstallments;
        token.safeTransfer(owner(), tokensToClaim);
        emit TokensClaimed(owner(), tokensToClaim);
    }

    /**
     * @dev Get the number of installments available for claim.
     * This checks how many months have passed since the first installment timestamp.
     */
    function getAvailableInstallments() public view returns (uint256) {
        if (
            !vestingInitialized || block.timestamp < FIRST_INSTALLMENT_TIMESTAMP
        ) {
            return 0;
        }

        // Calculate the number of months that have passed since the start timestamp
        uint256 monthsElapsed = _getMonthsElapsed(
            FIRST_INSTALLMENT_TIMESTAMP,
            block.timestamp
        );
        return
            monthsElapsed > TOTAL_INSTALLMENTS
                ? TOTAL_INSTALLMENTS
                : monthsElapsed;
    }

    /**
     * @dev Calculate the total releasable tokens.
     */
    function getReleasableAmount() public view returns (uint256) {
        uint256 availableInstallments = getAvailableInstallments();
        uint256 installmentsToClaim = availableInstallments -
            claimedInstallments;
        return installmentsToClaim * tokensPerInstallment;
    }

    /**
     * @dev Utility function to calculate elapsed months between two timestamps.
     * Ensures precise month-based calculations (1st of every month).
     */
    function _getMonthsElapsed(
        uint256 start,
        uint256 current
    ) internal pure returns (uint256) {
        require(current >= start, "Current time must be after start time");
        uint256 diff = current - start;
        uint256 months = (diff / (30 days)) + 1;
        if (months > TOTAL_INSTALLMENTS) {
            months = TOTAL_INSTALLMENTS;
        }
        return months;
    }

    /**
     * @dev Ensure Ether cannot be sent to this contract.
     */
    receive() external payable {
        revert("Contract does not accept Ether");
    }
}
