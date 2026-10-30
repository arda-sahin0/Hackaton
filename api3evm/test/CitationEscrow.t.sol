// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CitationEscrow} from "../contracts/CitationEscrow.sol";
import {AirnodeV2Test} from "./utils/AirnodeV2Test.sol";

contract CitationEscrowTest is AirnodeV2Test {
    CitationEscrow escrow;

    function setUp() public {
        // No token yet: step 3 replaces this with a mock aUSD token
        escrow = new CitationEscrow(IERC20(address(0)));
    }

    // The hash the contract builds must equal the hash the Airnode really signed
    function test_RequestHashMatchesTheSignedFixture() public view {
        assertEq(escrow.requestHashFor("10.1038/nature14539"), fixtureRequestHash("openalex-10-1038-nature14539.json"));
        assertEq(escrow.requestHashFor("10.1038/nature00870"), fixtureRequestHash("openalex-10-1038-nature00870.json"));
    }

    // A different DOI gives a different hash, so one paper's proof can't be used for another
    function test_RequestHashDiffersPerDoi() public view {
        assertNotEq(escrow.requestHashFor("10.1038/nature14539"), escrow.requestHashFor("10.1038/nature00870"));
    }

    function fixtureRequestHash(string memory name) private view returns (bytes32) {
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(string.concat("test/fixtures/", name));
        return vm.parseJsonBytes32(json, ".requestHash");
    }
}
