// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Stand-in for aUSD in tests: same 6 decimals, and anyone can mint
contract MockAUSD is ERC20 {
    constructor() ERC20("Mock AirnodeHub USD", "aUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
