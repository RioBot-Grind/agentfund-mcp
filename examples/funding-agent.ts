#!/usr/bin/env npx tsx
/**
 * AgentFund Demo Agent
 *
 * This agent demonstrates how an AI can use the AgentFund MCP server
 * to request funding for a project with milestone-based escrow.
 *
 * Workflow:
 * 1. Agent gets platform stats to verify connection
 * 2. Agent creates a funding proposal with milestones
 * 3. Agent checks for existing projects
 * 4. Agent monitors milestone progress
 * 5. Agent generates release requests after completing work
 *
 * Usage:
 *   npx tsx examples/funding-agent.ts
 *
 * @module funding-agent
 */

import { ethers } from "ethers";

// AgentFund Contract Configuration
const CONTRACT_ADDRESS = "0x6a4420f696c9ba6997f41dddc15b938b54aa009a";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// Contract ABI (same as MCP server)
const ABI = [
  "function createProject(address agent, uint256[] milestoneAmounts) external payable returns (uint256)",
  "function releaseMilestone(uint256 projectId) external",
  "function cancelProject(uint256 projectId) external",
  "function getProject(uint256 projectId) external view returns (tuple(address funder, address agent, uint256 totalAmount, uint256 releasedAmount, uint256 currentMilestone, uint256 totalMilestones, uint8 status))",
  "function projectCount() external view returns (uint256)"
];

const ProjectStatus = ["Active", "Completed", "Cancelled"];

/**
 * AgentFund Demo Agent
 * Demonstrates full workflow of an AI agent using AgentFund for funding
 */
class FundingAgent {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private agentAddress: string;

  constructor(agentAddress: string) {
    this.provider = new ethers.JsonRpcProvider(BASE_RPC);
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, this.provider);
    this.agentAddress = agentAddress;
  }

  /**
   * Get platform statistics - equivalent to agentfund_get_stats
   */
  async getStats(): Promise<{
    totalProjects: number;
    contractAddress: string;
    chain: string;
    platformFee: string;
  }> {
    const count = await this.contract.projectCount();
    return {
      totalProjects: Number(count),
      contractAddress: CONTRACT_ADDRESS,
      chain: "Base Mainnet",
      platformFee: "5%"
    };
  }

  /**
   * Get project details - equivalent to agentfund_get_project
   */
  async getProject(projectId: number): Promise<{
    projectId: number;
    funder: string;
    agent: string;
    totalAmount: string;
    releasedAmount: string;
    remainingAmount: string;
    currentMilestone: string;
    status: string;
  } | null> {
    try {
      const project = await this.contract.getProject(projectId);
      const totalAmount = ethers.formatEther(project[2]);
      const releasedAmount = ethers.formatEther(project[3]);
      const remaining = ethers.formatEther(project[2] - project[3]);

      return {
        projectId,
        funder: project[0],
        agent: project[1],
        totalAmount: `${totalAmount} ETH`,
        releasedAmount: `${releasedAmount} ETH`,
        remainingAmount: `${remaining} ETH`,
        currentMilestone: `${project[4].toString()} of ${project[5].toString()}`,
        status: ProjectStatus[Number(project[6])] || "Unknown"
      };
    } catch {
      return null;
    }
  }

  /**
   * Find all projects where this agent is the recipient
   * Equivalent to agentfund_find_my_projects
   */
  async findMyProjects(): Promise<Array<{
    id: number;
    status: string;
    total: string;
    released: string;
    milestone: string;
  }>> {
    const count = await this.contract.projectCount();
    const myProjects: Array<{
      id: number;
      status: string;
      total: string;
      released: string;
      milestone: string;
    }> = [];

    // Search through projects (limited to last 100 for performance)
    const searchLimit = Math.min(Number(count), 100);

    for (let i = 1; i <= searchLimit; i++) {
      try {
        const project = await this.contract.getProject(i);
        if (project[1].toLowerCase() === this.agentAddress.toLowerCase()) {
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

    return myProjects;
  }

  /**
   * Create a funding proposal - equivalent to agentfund_create_fundraise
   * Returns transaction data for a funder to execute
   */
  createFundraiseProposal(milestoneAmountsEth: string[], projectDescription?: string): {
    proposal: {
      agent: string;
      totalFunding: string;
      milestoneCount: number;
      milestones: Array<{ milestone: number; amount: string }>;
      description?: string;
    };
    transaction: {
      to: string;
      value: string;
      data: string;
    };
  } {
    const milestoneWei = milestoneAmountsEth.map(a => ethers.parseEther(a));
    const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);
    const totalEth = ethers.formatEther(totalValue);

    const txData = this.contract.interface.encodeFunctionData("createProject", [
      this.agentAddress,
      milestoneWei
    ]);

    const milestones = milestoneAmountsEth.map((amt, i) => ({
      milestone: i + 1,
      amount: `${amt} ETH`
    }));

    return {
      proposal: {
        agent: this.agentAddress,
        totalFunding: `${totalEth} ETH`,
        milestoneCount: milestoneAmountsEth.length,
        milestones,
        description: projectDescription
      },
      transaction: {
        to: CONTRACT_ADDRESS,
        value: `${totalEth} ETH`,
        data: txData
      }
    };
  }

  /**
   * Check milestone status - equivalent to agentfund_check_milestone
   */
  async checkMilestone(projectId: number): Promise<{
    projectId: number;
    status: string;
    currentMilestone: number;
    totalMilestones: number;
    completed: number;
    released: string;
    remaining: string;
    nextAction: string;
  } | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const [current, total] = project.currentMilestone.split(" of ").map(Number);

    let nextAction: string;
    if (project.status === "Completed") {
      nextAction = "All milestones completed! No further action needed.";
    } else if (project.status === "Cancelled") {
      nextAction = "Project was cancelled. Remaining funds refunded to funder.";
    } else {
      nextAction = `Complete milestone ${current + 1} work, then use generateReleaseRequest() to request payment.`;
    }

    return {
      projectId,
      status: project.status,
      currentMilestone: current + 1,
      totalMilestones: total,
      completed: current,
      released: project.releasedAmount,
      remaining: project.remainingAmount,
      nextAction
    };
  }

  /**
   * Generate a release request - equivalent to agentfund_generate_release_request
   * Returns transaction data for the funder to release funds
   */
  async generateReleaseRequest(projectId: number, completedWork?: string): Promise<{
    projectId: number;
    milestone: number;
    funder: string;
    workCompleted?: string;
    transaction: {
      to: string;
      data: string;
    };
    instructions: string;
  } | { error: string }> {
    const project = await this.getProject(projectId);
    if (!project) {
      return { error: "Project not found" };
    }

    if (project.status !== "Active") {
      return { error: `Cannot release milestone - project is ${project.status}` };
    }

    const txData = this.contract.interface.encodeFunctionData("releaseMilestone", [projectId]);
    const currentMilestone = Number(project.currentMilestone.split(" of ")[0]);

    return {
      projectId,
      milestone: currentMilestone + 1,
      funder: project.funder,
      workCompleted: completedWork,
      transaction: {
        to: CONTRACT_ADDRESS,
        data: txData
      },
      instructions: `Send this transaction data to your funder (${project.funder}) to release payment for milestone ${currentMilestone + 1}.`
    };
  }

  /**
   * Run full demonstration workflow
   */
  async runDemo(): Promise<void> {
    console.log("\n=== AgentFund Demo Agent ===\n");
    console.log(`Agent Address: ${this.agentAddress}\n`);

    // Step 1: Get platform stats
    console.log("1. Fetching platform statistics...");
    const stats = await this.getStats();
    console.log(`   Total Projects: ${stats.totalProjects}`);
    console.log(`   Contract: ${stats.contractAddress}`);
    console.log(`   Chain: ${stats.chain}`);
    console.log(`   Platform Fee: ${stats.platformFee}\n`);

    // Step 2: Find existing projects
    console.log("2. Searching for existing projects...");
    const myProjects = await this.findMyProjects();
    if (myProjects.length > 0) {
      console.log(`   Found ${myProjects.length} project(s):`);
      for (const p of myProjects) {
        console.log(`   - Project #${p.id}: ${p.status}, ${p.released}/${p.total} ETH (Milestone ${p.milestone})`);
      }
    } else {
      console.log("   No existing projects found for this address.");
    }
    console.log();

    // Step 3: Create a funding proposal
    console.log("3. Creating funding proposal for a new project...");
    const proposal = this.createFundraiseProposal(
      ["0.01", "0.02", "0.01"], // 3 milestones totaling 0.04 ETH
      "Build a web scraper that collects market data"
    );
    console.log(`   Agent: ${proposal.proposal.agent}`);
    console.log(`   Total Funding: ${proposal.proposal.totalFunding}`);
    console.log(`   Milestones: ${proposal.proposal.milestoneCount}`);
    for (const m of proposal.proposal.milestones) {
      console.log(`     - Milestone ${m.milestone}: ${m.amount}`);
    }
    console.log(`   Description: ${proposal.proposal.description}`);
    console.log("\n   Transaction for funder to execute:");
    console.log(`   To: ${proposal.transaction.to}`);
    console.log(`   Value: ${proposal.transaction.value}`);
    console.log(`   Data: ${proposal.transaction.data.slice(0, 66)}...`);
    console.log();

    // Step 4: If we have a project, check milestone status
    if (myProjects.length > 0) {
      const projectId = myProjects[0].id;
      console.log(`4. Checking milestone status for Project #${projectId}...`);
      const milestoneStatus = await this.checkMilestone(projectId);
      if (milestoneStatus) {
        console.log(`   Status: ${milestoneStatus.status}`);
        console.log(`   Current: Milestone ${milestoneStatus.currentMilestone} of ${milestoneStatus.totalMilestones}`);
        console.log(`   Completed: ${milestoneStatus.completed}`);
        console.log(`   Released: ${milestoneStatus.released}`);
        console.log(`   Remaining: ${milestoneStatus.remaining}`);
        console.log(`   Next Action: ${milestoneStatus.nextAction}`);
      }
      console.log();

      // Step 5: Generate release request (if project is active)
      if (milestoneStatus && milestoneStatus.status === "Active") {
        console.log("5. Generating release request for completed work...");
        const releaseRequest = await this.generateReleaseRequest(
          projectId,
          "Completed data collection module with 95% accuracy"
        );
        if ("error" in releaseRequest) {
          console.log(`   Error: ${releaseRequest.error}`);
        } else {
          console.log(`   Project: #${releaseRequest.projectId}`);
          console.log(`   Milestone: ${releaseRequest.milestone}`);
          console.log(`   Work: ${releaseRequest.workCompleted}`);
          console.log(`   Instructions: ${releaseRequest.instructions}`);
          console.log(`   TX Data: ${releaseRequest.transaction.data.slice(0, 66)}...`);
        }
      }
    } else {
      console.log("4. No existing projects to check milestone status.");
      console.log("5. Skipping release request (no active project).");
    }

    console.log("\n=== Demo Complete ===\n");
    console.log("This demonstrates how an AI agent can:");
    console.log("- Query the AgentFund platform for statistics");
    console.log("- Find projects where it's the recipient");
    console.log("- Create funding proposals with milestones");
    console.log("- Track milestone progress");
    console.log("- Generate payment release requests");
    console.log("\nTo integrate with Claude or other AI, use the MCP server with:");
    console.log('  npx agentfund-mcp\n');
  }
}

// Main execution
async function main(): Promise<void> {
  // Example agent address (replace with your own)
  const agentAddress = process.env.AGENT_ADDRESS || "0xc2212629Ef3b17C755682b9490711a39468dA6bB";

  const agent = new FundingAgent(agentAddress);
  await agent.runDemo();
}

main().catch(console.error);

export { FundingAgent };
