// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IOpenTender {
    function commitBid(uint256 tenderId, bytes32 commitHash) external payable;
    function revealBid(uint256 tenderId, uint256 amount, bytes32 salt) external;
    function claimBondRefund(uint256 tenderId) external;
    function withdrawPullBalance() external;
    function submitMilestone(uint256 tenderId, uint256 milestoneIndex, bytes32 evidenceHash) external;
}

contract MaliciousBidder {
    IOpenTender public immutable target;
    uint256 public tenderId;
    bool public attackMode;
    bool public rejectETH;
    uint256 public attackCount;

    constructor(address _target) {
        target = IOpenTender(_target);
    }

    function setTenderId(uint256 _tenderId) external {
        tenderId = _tenderId;
    }

    function setAttackMode(bool _attack) external {
        attackMode = _attack;
    }

    function setRejectETH(bool _reject) external {
        rejectETH = _reject;
    }

    function commitBid(uint256 _tenderId, bytes32 commitHash) external payable {
        tenderId = _tenderId;
        target.commitBid{value: msg.value}(_tenderId, commitHash);
    }

    function revealBid(uint256 _tenderId, uint256 amount, bytes32 salt) external {
        target.revealBid(_tenderId, amount, salt);
    }

    function claimBondRefund(uint256 _tenderId) external {
        target.claimBondRefund(_tenderId);
    }

    function withdrawPullBalance() external {
        target.withdrawPullBalance();
    }

    function submitMilestone(uint256 _tenderId, uint256 index, bytes32 evidenceHash) external {
        target.submitMilestone(_tenderId, index, evidenceHash);
    }

    receive() external payable {
        if (rejectETH) {
            revert("Rejecting ETH transfer");
        }
        if (attackMode && attackCount < 1) {
            attackCount++;
            target.claimBondRefund(tenderId);
        }
    }
}
