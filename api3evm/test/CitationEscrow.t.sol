// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CitationEscrow} from "../contracts/CitationEscrow.sol";
import {AirnodeV2Test} from "./utils/AirnodeV2Test.sol";
import {MockAUSD} from "./utils/MockAUSD.sol";

contract CitationEscrowTest is AirnodeV2Test {
    CitationEscrow escrow;
    MockAUSD token;

    address hirer = makeAddr("hirer");
    address researcher = makeAddr("researcher");

    uint256 constant AMOUNT = 1e6; // 1 aUSD
    bytes32 constant MASUMI_REF = keccak256("masumi-job-123");

    function setUp() public {
        // A fixed clock shortly before the fixtures were signed
        vm.warp(1793350000);

        token = new MockAUSD();
        escrow = new CitationEscrow(token);

        token.mint(hirer, 10e6);
        vm.prank(hirer);
        token.approve(address(escrow), type(uint256).max);
    }

    // ------------------------------------------------ step 2: request hash

    // The hash the contract builds must equal the hash the Airnode really signed
    function test_RequestHashMatchesTheSignedFixture() public view {
        assertEq(escrow.requestHashFor("10.1038/nature14539"), fixtureRequestHash("openalex-10-1038-nature14539.json"));
        assertEq(escrow.requestHashFor("10.1038/nature00870"), fixtureRequestHash("openalex-10-1038-nature00870.json"));
    }

    // A different DOI gives a different hash, so one paper's proof can't be used for another
    function test_RequestHashDiffersPerDoi() public view {
        assertNotEq(escrow.requestHashFor("10.1038/nature14539"), escrow.requestHashFor("10.1038/nature00870"));
    }

    // ------------------------------------------------ step 3: createJob

    function test_CreateJobLocksThePayment() public {
        uint256 jobId = createJob(AMOUNT);

        assertEq(jobId, 1);
        assertEq(escrow.jobCount(), 1);
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(token.balanceOf(hirer), 10e6 - AMOUNT);

        (address jobHirer, address jobResearcher, uint256 amount, uint256 minSources, uint64 deadline,,,,, bytes32 ref) =
            escrow.jobs(jobId);
        assertEq(jobHirer, hirer);
        assertEq(jobResearcher, researcher);
        assertEq(amount, AMOUNT);
        assertEq(minSources, 2);
        assertEq(deadline, block.timestamp + 1 days);
        assertEq(ref, MASUMI_REF);
    }

    function test_CreateJobEmitsJobCreated() public {
        vm.expectEmit(address(escrow));
        emit CitationEscrow.JobCreated(1, hirer, researcher, AMOUNT, 2, uint64(block.timestamp + 1 days), MASUMI_REF);
        createJob(AMOUNT);
    }

    // Cardano-paid mode: Masumi holds the ADA, the contract only records proofs
    function test_CreateJobWithZeroAmount() public {
        createJob(0);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(hirer), 10e6);
    }

    function test_JobIdsCountUp() public {
        assertEq(createJob(AMOUNT), 1);
        assertEq(createJob(AMOUNT), 2);
    }

    function test_RevertWhen_ResearcherIsZero() public {
        vm.prank(hirer);
        vm.expectRevert(CitationEscrow.InvalidResearcher.selector);
        escrow.createJob(address(0), 2, uint64(block.timestamp + 1 days), AMOUNT, MASUMI_REF);
    }

    function test_RevertWhen_NoSourcesRequired() public {
        vm.prank(hirer);
        vm.expectRevert(CitationEscrow.NoSourcesRequired.selector);
        escrow.createJob(researcher, 0, uint64(block.timestamp + 1 days), AMOUNT, MASUMI_REF);
    }

    function test_RevertWhen_DeadlineIsNotInTheFuture() public {
        uint64 deadline = uint64(block.timestamp);
        vm.prank(hirer);
        vm.expectRevert(abi.encodeWithSelector(CitationEscrow.DeadlinePassed.selector, deadline));
        escrow.createJob(researcher, 2, deadline, AMOUNT, MASUMI_REF);
    }

    function test_RevertWhen_HirerHasNotApproved() public {
        address stranger = makeAddr("stranger");
        token.mint(stranger, AMOUNT);
        vm.prank(stranger);
        vm.expectRevert();
        escrow.createJob(researcher, 2, uint64(block.timestamp + 1 days), AMOUNT, MASUMI_REF);
    }

    // ------------------------------------------------ helpers

    function createJob(uint256 amount) private returns (uint256) {
        vm.prank(hirer);
        return escrow.createJob(researcher, 2, uint64(block.timestamp + 1 days), amount, MASUMI_REF);
    }

    function fixtureRequestHash(string memory name) private view returns (bytes32) {
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(string.concat("test/fixtures/", name));
        return vm.parseJsonBytes32(json, ".requestHash");
    }
}
