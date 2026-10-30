// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AirnodeV2Attestation} from "./AirnodeV2Attestation.sol";
import {ProjectedJson} from "./ProjectedJson.sol";

/// @title Escrow that pays a research agent only when every cited source is proven real and not retracted
/// @notice The hirer locks aUSD for a job. The researcher delivers a report hash and the DOIs it cites. Anyone can 
/// then submit OpenAlex responses signed by the AirnodeHub Airnode, one per DOI. When all DOIs are proven, the 
/// researcher is paid. If the deadline passes first, the hirer is refunded. 

contract CitationEscrow {
  using SafeERC20 for IERC20;

  // ---------------------------constants
  
  /// @notice The only signer whose responses count: the OpenAlex Airnode on AirnodeHub
  address public constant OPENALEX_AIRNODE = 0xc5E9B3263ac154d7694Db5F3894997DaaB4F464c;

  /// @notice Longest time from the Airnode signing a response to the contract accepting it
  uint256 public constant MAX_RESPONSE_AGE = 1 hours;

  /// @notice The token that jobs are paid in (aUSD on Base Sepolia)
  IERC20 public immutable token;


  // ------------------------storage
  struct Job {
      address hirer;
      address researcher;
      uint256 amount; // aUSD locked, 6 decimals
      uint256 minSources; // the least number of DOIs the report must cite
      uint64 deadline; // after this unproven jobs can be refunded
      uint64 deliveredAt; // 0 until delivery
      bytes32 reportHash; // hash of the off chain report
      uint256 provenCount; // how many DOIs have been proven so far
      bool settled; //true once paid out or refunded
  }

  uint256 public jobCount;
  mapping(uint256 jobId => Job) public jobs;
  mapping(uint256 jobId => string[]) internal _dois;
  mapping(uint256 jobId => mapping(uint256 index => bool)) public proven;

  // -------------------- errors
  error NotHirer();
  error NotResearcher();
  error JobNotFound();
  error AlreadyDelivered();
  error NotDelivered();
  error TooFewSources(uint256 given, uint256 required);
  error InvalidDoi(string doi);
  error DuplicateDoi(string doi);
  error IndexOutOfRange(uint256 index);
  error AlreadyProven(uint256 index);
  error ResponseTooOld(uint256 responseTimestamp);
  error ResponseBeforeDelivery(uint256 responseTimestamp);
  error SourceRetracted(string doi);
  error NotAllProven(uint256 proven, uint256 total);
  error DeadlineNotPassed(uint64 deadline);
  error DeadlinePassed(uint64 deadline);
  error AlreadySettled();

  // -------------------------events

  event JobCreated(uint256 indexed jobId, address indexed hirer, 
                   address indexed researcher, uint256 amount,
                   uint256 minSources, uint64 deadline);
  event Delivered(uint256 indexed jobId, bytes32 reportHash, string[] dois);
  event SourceProven(uint256 indexed jobId, uint256 index, string doi, string title);
  event Released(uint256 indexed jobId, address researcher, uint256 amount);
  event Refunded(uint256 indexed jobId, address hirer, uint256 amount);

  constructor(IERC20 token_) {
      token = token_;
  }

  // --------------------------- step 2
  /// @notice The request hash that a signed getWork response for this DOI must carry
  function requestHashFor(string memory doi) public pure returns (bytes32) {
    return keccak256(
      bytes(
        string.concat(
          '["getWork",[["id","doi:',
          doi,
          '"]],[["doi","/doi"],["is_retracted","/is_retracted"],["title","/title"]]]'
        )
      )
    );
  }

  // --------------------------- step 3
  function createJob(address researcher, uint256 minSources, uint64 deadline, uint256 amount) external returns (uint256 jobId) {}

  // step 4
  function deliver(uint256 jobId, bytes32 reportHash, string[] calldata dois) external {}

  // step 5
  function proveSource(uint256 jobId, uint256 index, uint256 timestamp, bytes calldata data, bytes calldata signature) external {}

  // step 6
  function release(uint256 jobId) external {}
  function refund(uint256 jobId) external {}

  // ------------------------------------------------------views
  function doisOf(uint256 jobId) external view returns (string[] memory) {
      return _dois[jobId];
  }
 
  
}
