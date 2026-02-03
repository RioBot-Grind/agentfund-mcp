#!/usr/bin/env npx tsx
/**
 * AgentFund CLI Agent
 *
 * Command-line interface for interacting with AgentFund.
 * Provides programmatic access to all AgentFund MCP operations.
 *
 * Usage:
 *   npx tsx examples/cli-agent.ts <command> [options]
 *
 * Commands:
 *   stats                     Get platform statistics
 *   project <id>              Get project details
 *   my-projects <address>     Find projects for an address
 *   create <address> <amounts...> [--desc <description>]
 *   milestone <id>            Check milestone status
 *   release <id> [--work <description>]
 *
 * Examples:
 *   npx tsx examples/cli-agent.ts stats
 *   npx tsx examples/cli-agent.ts project 1
 *   npx tsx examples/cli-agent.ts my-projects 0x123...
 *   npx tsx examples/cli-agent.ts create 0x123... 0.01 0.02 0.01 --desc "Build a scraper"
 *   npx tsx examples/cli-agent.ts milestone 1
 *   npx tsx examples/cli-agent.ts release 1 --work "Completed module"
 *
 * @module cli-agent
 */

import { ethers } from "ethers";

// AgentFund Contract Configuration
const CONTRACT_ADDRESS = "0x6a4420f696c9ba6997f41dddc15b938b54aa009a";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Contract ABI
const ABI = [
  "function createProject(address agent, uint256[] milestoneAmounts) external payable returns (uint256)",
  "function releaseMilestone(uint256 projectId) external",
  "function cancelProject(uint256 projectId) external",
  "function getProject(uint256 projectId) external view returns (tuple(address funder, address agent, uint256 totalAmount, uint256 releasedAmount, uint256 currentMilestone, uint256 totalMilestones, uint8 status))",
  "function projectCount() external view returns (uint256)"
];

const ProjectStatus = ["Active", "Completed", "Cancelled"];

// Initialize provider and contract
const provider = new ethers.JsonRpcProvider(BASE_RPC);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
AgentFund CLI Agent

Usage:
  npx tsx examples/cli-agent.ts <command> [options]

Commands:
  stats                          Get platform statistics
  project <id>                   Get project details by ID
  my-projects <address>          Find all projects for an address
  create <address> <amounts...>  Create funding proposal
    --desc <description>         Optional project description
  milestone <id>                 Check milestone status
  release <id>                   Generate release request
    --work <description>         Optional work description

Examples:
  npx tsx examples/cli-agent.ts stats
  npx tsx examples/cli-agent.ts project 1
  npx tsx examples/cli-agent.ts my-projects 0xc2212629Ef3b17C755682b9490711a39468dA6bB
  npx tsx examples/cli-agent.ts create 0xc2212629Ef3b17C755682b9490711a39468dA6bB 0.01 0.02 --desc "Build a web scraper"
  npx tsx examples/cli-agent.ts milestone 1
  npx tsx examples/cli-agent.ts release 1 --work "Completed data collection"

Environment:
  BASE_RPC_URL    Custom RPC endpoint (default: https://mainnet.base.org)
`);
}

/**
 * Get platform statistics
 */
async function getStats(): Promise<void> {
  console.log("\n=== AgentFund Statistics ===\n");

  const count = await contract.projectCount();

  console.log(`Total Projects: ${count.toString()}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);
  console.log(`Chain: Base Mainnet`);
  console.log(`Platform Fee: 5%`);
  console.log(`\nBaseScan: https://basescan.org/address/${CONTRACT_ADDRESS}`);
}

/**
 * Get project details
 */
async function getProject(projectId: string): Promise<void> {
  console.log(`\n=== Project #${projectId} ===\n`);

  try {
    const project = await contract.getProject(projectId);

    const totalAmount = ethers.formatEther(project[2]);
    const releasedAmount = ethers.formatEther(project[3]);
    const remaining = ethers.formatEther(project[2] - project[3]);

    console.log(`Status: ${ProjectStatus[Number(project[6])] || "Unknown"}`);
    console.log(`Agent (recipient): ${project[1]}`);
    console.log(`Funder: ${project[0]}`);
    console.log(`Total: ${totalAmount} ETH`);
    console.log(`Released: ${releasedAmount} ETH`);
    console.log(`Remaining: ${remaining} ETH`);
    console.log(`Milestone: ${project[4].toString()} of ${project[5].toString()}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: Could not fetch project #${projectId}. ${message}`);
    process.exit(1);
  }
}

/**
 * Find projects for an address
 */
async function findMyProjects(address: string): Promise<void> {
  console.log(`\n=== Projects for ${address} ===\n`);

  if (!ethers.isAddress(address)) {
    console.error("Error: Invalid Ethereum address");
    process.exit(1);
  }

  const count = await contract.projectCount();
  const myProjects: Array<{
    id: number;
    status: string;
    total: string;
    released: string;
    milestone: string;
  }> = [];

  const searchLimit = Math.min(Number(count), 100);

  for (let i = 1; i <= searchLimit; i++) {
    try {
      const project = await contract.getProject(i);
      if (project[1].toLowerCase() === address.toLowerCase()) {
        myProjects.push({
          id: i,
          status: ProjectStatus[Number(project[6])],
          total: ethers.formatEther(project[2]),
          released: ethers.formatEther(project[3]),
          milestone: `${project[4]}/${project[5]}`
        });
      }
    } catch {
      // Skip invalid projects
    }
  }

  if (myProjects.length === 0) {
    console.log("No projects found for this address.");
    console.log("\nTo start fundraising, use the 'create' command:");
    console.log(`  npx tsx examples/cli-agent.ts create ${address} 0.01 0.02 --desc "Your project"`);
  } else {
    console.log(`Found ${myProjects.length} project(s):\n`);
    for (const p of myProjects) {
      console.log(`Project #${p.id}`);
      console.log(`  Status: ${p.status}`);
      console.log(`  Funding: ${p.released}/${p.total} ETH released`);
      console.log(`  Milestone: ${p.milestone}`);
      console.log();
    }
  }
}

/**
 * Create funding proposal
 */
function createFundraise(address: string, amounts: string[], description?: string): void {
  console.log("\n=== Funding Proposal ===\n");

  if (!ethers.isAddress(address)) {
    console.error("Error: Invalid Ethereum address");
    process.exit(1);
  }

  if (amounts.length === 0) {
    console.error("Error: At least one milestone amount required");
    process.exit(1);
  }

  // Validate amounts
  for (const amt of amounts) {
    try {
      ethers.parseEther(amt);
    } catch {
      console.error(`Error: Invalid amount "${amt}". Must be a valid ETH value.`);
      process.exit(1);
    }
  }

  const milestoneWei = amounts.map(a => ethers.parseEther(a));
  const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);
  const totalEth = ethers.formatEther(totalValue);

  const txData = contract.interface.encodeFunctionData("createProject", [
    address,
    milestoneWei
  ]);

  console.log(`Agent (you): ${address}`);
  console.log(`Total Funding: ${totalEth} ETH`);
  console.log(`Milestones: ${amounts.length}`);
  console.log();

  console.log("Milestone Breakdown:");
  amounts.forEach((amt, i) => {
    console.log(`  ${i + 1}. ${amt} ETH`);
  });
  console.log();

  if (description) {
    console.log(`Project: ${description}`);
    console.log();
  }

  console.log("=== For Funder to Execute ===\n");
  console.log(`To: ${CONTRACT_ADDRESS}`);
  console.log(`Value: ${totalEth} ETH`);
  console.log(`Data: ${txData}`);
  console.log();
  console.log("Share this with potential funders. When they execute this transaction,");
  console.log("your project will be created and you'll receive funds as you complete milestones.");
}

/**
 * Check milestone status
 */
async function checkMilestone(projectId: string): Promise<void> {
  console.log(`\n=== Milestone Status - Project #${projectId} ===\n`);

  try {
    const project = await contract.getProject(projectId);

    const currentMilestone = Number(project[4]);
    const totalMilestones = Number(project[5]);
    const status = ProjectStatus[Number(project[6])];
    const released = ethers.formatEther(project[3]);
    const total = ethers.formatEther(project[2]);
    const remaining = ethers.formatEther(project[2] - project[3]);

    if (status === "Completed") {
      console.log("COMPLETED");
      console.log(`All ${totalMilestones} milestones completed!`);
      console.log(`Total received: ${total} ETH`);
    } else if (status === "Cancelled") {
      console.log("CANCELLED");
      console.log(`Released before cancel: ${released} ETH`);
      console.log(`Refunded to funder: ${remaining} ETH`);
    } else {
      console.log(`Status: ${status}`);
      console.log(`Current: Milestone ${currentMilestone + 1} of ${totalMilestones}`);
      console.log(`Completed: ${currentMilestone}`);
      console.log(`Released so far: ${released} ETH`);
      console.log(`Remaining: ${remaining} ETH`);
      console.log();
      console.log("Next step:");
      console.log("Complete your milestone work, then run:");
      console.log(`  npx tsx examples/cli-agent.ts release ${projectId} --work "Description of completed work"`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: Could not fetch project #${projectId}. ${message}`);
    process.exit(1);
  }
}

/**
 * Generate release request
 */
async function generateReleaseRequest(projectId: string, completedWork?: string): Promise<void> {
  console.log(`\n=== Release Request - Project #${projectId} ===\n`);

  try {
    const project = await contract.getProject(projectId);
    const status = ProjectStatus[Number(project[6])];

    if (status !== "Active") {
      console.error(`Error: Cannot release milestone - project is ${status}`);
      process.exit(1);
    }

    const txData = contract.interface.encodeFunctionData("releaseMilestone", [projectId]);
    const currentMilestone = Number(project[4]);
    const funder = project[0];

    console.log(`Project: #${projectId}`);
    console.log(`Milestone: ${currentMilestone + 1}`);
    console.log(`Funder: ${funder}`);
    console.log();

    if (completedWork) {
      console.log(`Work Completed: ${completedWork}`);
      console.log();
    }

    console.log("=== For Funder to Sign ===\n");
    console.log(`To: ${CONTRACT_ADDRESS}`);
    console.log(`Data: ${txData}`);
    console.log();
    console.log(`Send this to your funder (${funder}) to release payment.`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: Could not fetch project #${projectId}. ${message}`);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): { command: string; args: string[]; options: Record<string, string> } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const positionalArgs: string[] = [];
  const options: Record<string, string> = {};

  let i = 1;
  while (i < args.length) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] || "";
      options[key] = value;
      i += 2;
    } else {
      positionalArgs.push(args[i]);
      i++;
    }
  }

  return { command, args: positionalArgs, options };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { command, args, options } = parseArgs();

  try {
    switch (command) {
      case "stats":
        await getStats();
        break;

      case "project":
        if (!args[0]) {
          console.error("Error: Project ID required");
          console.error("Usage: npx tsx examples/cli-agent.ts project <id>");
          process.exit(1);
        }
        await getProject(args[0]);
        break;

      case "my-projects":
        if (!args[0]) {
          console.error("Error: Address required");
          console.error("Usage: npx tsx examples/cli-agent.ts my-projects <address>");
          process.exit(1);
        }
        await findMyProjects(args[0]);
        break;

      case "create":
        if (args.length < 2) {
          console.error("Error: Address and at least one milestone amount required");
          console.error("Usage: npx tsx examples/cli-agent.ts create <address> <amount1> [amount2...] [--desc <description>]");
          process.exit(1);
        }
        createFundraise(args[0], args.slice(1), options.desc);
        break;

      case "milestone":
        if (!args[0]) {
          console.error("Error: Project ID required");
          console.error("Usage: npx tsx examples/cli-agent.ts milestone <id>");
          process.exit(1);
        }
        await checkMilestone(args[0]);
        break;

      case "release":
        if (!args[0]) {
          console.error("Error: Project ID required");
          console.error("Usage: npx tsx examples/cli-agent.ts release <id> [--work <description>]");
          process.exit(1);
        }
        await generateReleaseRequest(args[0], options.work);
        break;

      case "help":
      case "--help":
      case "-h":
        printUsage();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
