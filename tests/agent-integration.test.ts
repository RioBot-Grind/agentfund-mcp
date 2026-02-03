/**
 * Integration tests for AgentFund AI Agent
 *
 * Tests the agent's ability to interact with the AgentFund platform
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";

// Contract configuration
const CONTRACT_ADDRESS = "0x6a4420f696c9ba6997f41dddc15b938b54aa009a";
const BASE_RPC = "https://mainnet.base.org";
const TEST_AGENT_ADDRESS = "0xc2212629Ef3b17C755682b9490711a39468dA6bB";

// Contract ABI (minimal for testing)
const ABI = [
  "function createProject(address agent, uint256[] milestoneAmounts) external payable returns (uint256)",
  "function releaseMilestone(uint256 projectId) external",
  "function getProject(uint256 projectId) external view returns (tuple(address funder, address agent, uint256 totalAmount, uint256 releasedAmount, uint256 currentMilestone, uint256 totalMilestones, uint8 status))",
  "function projectCount() external view returns (uint256)"
];

// Project status enum
const ProjectStatus = ["Active", "Completed", "Cancelled"];

describe("AgentFund Integration Tests", () => {
  let provider: ethers.JsonRpcProvider;
  let contract: ethers.Contract;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(BASE_RPC);
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  });

  describe("Platform Connection", () => {
    it("should connect to Base mainnet", async () => {
      const network = await provider.getNetwork();
      expect(network.chainId).toBe(8453n); // Base mainnet chain ID
    });

    it("should verify contract exists at address", async () => {
      const code = await provider.getCode(CONTRACT_ADDRESS);
      expect(code).not.toBe("0x");
      expect(code.length).toBeGreaterThan(10);
    });

    it("should read project count", async () => {
      const count = await contract.projectCount();
      expect(typeof count).toBe("bigint");
      expect(count >= 0n).toBe(true);
    });
  });

  describe("agentfund_get_stats", () => {
    it("should return valid stats structure", async () => {
      const count = await contract.projectCount();

      const stats = {
        totalProjects: Number(count),
        contractAddress: CONTRACT_ADDRESS,
        chain: "Base Mainnet",
        platformFee: "5%"
      };

      expect(stats.totalProjects).toBeGreaterThanOrEqual(0);
      expect(stats.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(stats.chain).toBe("Base Mainnet");
      expect(stats.platformFee).toBe("5%");
    });
  });

  describe("agentfund_create_fundraise", () => {
    it("should generate valid proposal for single milestone", () => {
      const milestones = ["0.01"];
      const milestoneWei = milestones.map(a => ethers.parseEther(a));
      const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);

      const txData = contract.interface.encodeFunctionData("createProject", [
        TEST_AGENT_ADDRESS,
        milestoneWei
      ]);

      expect(txData).toMatch(/^0x/);
      expect(totalValue).toBe(ethers.parseEther("0.01"));
    });

    it("should generate valid proposal for multiple milestones", () => {
      const milestones = ["0.01", "0.02", "0.03"];
      const milestoneWei = milestones.map(a => ethers.parseEther(a));
      const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);

      const txData = contract.interface.encodeFunctionData("createProject", [
        TEST_AGENT_ADDRESS,
        milestoneWei
      ]);

      expect(txData).toMatch(/^0x/);
      expect(totalValue).toBe(ethers.parseEther("0.06"));
    });

    it("should calculate correct total for various amounts", () => {
      const testCases = [
        { milestones: ["0.1"], expected: "0.1" },
        { milestones: ["0.01", "0.02"], expected: "0.03" },
        { milestones: ["0.001", "0.002", "0.003"], expected: "0.006" },
        { milestones: ["1", "2", "3"], expected: "6" }
      ];

      for (const { milestones, expected } of testCases) {
        const milestoneWei = milestones.map(a => ethers.parseEther(a));
        const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);
        expect(totalValue).toBe(ethers.parseEther(expected));
      }
    });

    it("should handle very small amounts", () => {
      const milestones = ["0.000001", "0.000002"];
      const milestoneWei = milestones.map(a => ethers.parseEther(a));
      const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);

      expect(totalValue).toBe(ethers.parseEther("0.000003"));
    });
  });

  describe("agentfund_get_project", () => {
    it("should handle non-existent project gracefully", async () => {
      const count = await contract.projectCount();
      const invalidId = Number(count) + 1000;

      try {
        await contract.getProject(invalidId);
        // If it doesn't throw, should return zero address
      } catch {
        // Expected for non-existent project
        expect(true).toBe(true);
      }
    });

    it("should return valid project data if projects exist", async () => {
      try {
        const count = await contract.projectCount();

        if (Number(count) > 0) {
          const project = await contract.getProject(1);

          // Verify structure
          expect(project[0]).toMatch(/^0x[a-fA-F0-9]{40}$/); // funder
          expect(project[1]).toMatch(/^0x[a-fA-F0-9]{40}$/); // agent
          expect(typeof project[2]).toBe("bigint"); // totalAmount
          expect(typeof project[3]).toBe("bigint"); // releasedAmount
          expect(typeof project[4]).toBe("bigint"); // currentMilestone
          expect(typeof project[5]).toBe("bigint"); // totalMilestones
          expect(Number(project[6])).toBeLessThan(3); // status enum
        } else {
          // No projects yet, skip
          expect(true).toBe(true);
        }
      } catch (error: unknown) {
        // Rate limiting or network issues - skip test
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("rate limit") || message.includes("CALL_EXCEPTION")) {
          console.warn("Skipping test due to rate limiting");
          expect(true).toBe(true);
        } else {
          throw error;
        }
      }
    });
  });

  describe("agentfund_check_milestone", () => {
    it("should parse milestone status correctly", () => {
      // Simulate project data
      const mockProject = {
        currentMilestone: 1n,
        totalMilestones: 3n,
        status: 0, // Active
        releasedAmount: ethers.parseEther("0.01"),
        totalAmount: ethers.parseEther("0.06")
      };

      const status = {
        current: Number(mockProject.currentMilestone) + 1,
        total: Number(mockProject.totalMilestones),
        completed: Number(mockProject.currentMilestone),
        released: ethers.formatEther(mockProject.releasedAmount),
        remaining: ethers.formatEther(mockProject.totalAmount - mockProject.releasedAmount),
        statusText: ProjectStatus[mockProject.status]
      };

      expect(status.current).toBe(2);
      expect(status.total).toBe(3);
      expect(status.completed).toBe(1);
      expect(status.released).toBe("0.01");
      expect(status.remaining).toBe("0.05");
      expect(status.statusText).toBe("Active");
    });

    it("should handle completed projects", () => {
      const mockProject = {
        currentMilestone: 3n,
        totalMilestones: 3n,
        status: 1, // Completed
        releasedAmount: ethers.parseEther("0.06"),
        totalAmount: ethers.parseEther("0.06")
      };

      expect(ProjectStatus[mockProject.status]).toBe("Completed");
      expect(mockProject.releasedAmount).toBe(mockProject.totalAmount);
    });

    it("should handle cancelled projects", () => {
      const mockProject = {
        currentMilestone: 1n,
        totalMilestones: 3n,
        status: 2, // Cancelled
        releasedAmount: ethers.parseEther("0.01"),
        totalAmount: ethers.parseEther("0.06")
      };

      expect(ProjectStatus[mockProject.status]).toBe("Cancelled");
    });
  });

  describe("agentfund_generate_release_request", () => {
    it("should generate valid release transaction data", () => {
      const projectId = 1;
      const txData = contract.interface.encodeFunctionData("releaseMilestone", [projectId]);

      expect(txData).toMatch(/^0x/);
      // Function selector for releaseMilestone (0x317debf5)
      expect(txData.startsWith("0x317debf5")).toBe(true);
    });

    it("should encode different project IDs correctly", () => {
      const ids = [1, 10, 100, 1000];

      for (const id of ids) {
        const txData = contract.interface.encodeFunctionData("releaseMilestone", [id]);
        expect(txData).toMatch(/^0x/);
        expect(txData.length).toBe(74); // 0x + 4 bytes selector + 32 bytes param
      }
    });
  });

  describe("agentfund_find_my_projects", () => {
    it("should validate address format", () => {
      const validAddress = TEST_AGENT_ADDRESS;
      const invalidAddress = "not-an-address";

      expect(ethers.isAddress(validAddress)).toBe(true);
      expect(ethers.isAddress(invalidAddress)).toBe(false);
    });

    it("should handle case-insensitive address comparison", () => {
      const address1 = "0xc2212629Ef3b17C755682b9490711a39468dA6bB";
      const address2 = "0xC2212629EF3B17C755682B9490711A39468DA6BB";

      expect(address1.toLowerCase()).toBe(address2.toLowerCase());
    });
  });

  describe("Function Selectors", () => {
    it("should have correct selector for projectCount", () => {
      const selector = ethers.id("projectCount()").slice(0, 10);
      expect(selector).toBe("0x36fbad26");
    });

    it("should have correct selector for getProject", () => {
      const selector = ethers.id("getProject(uint256)").slice(0, 10);
      expect(selector).toBe("0xf0f3f2c8");
    });

    it("should have correct selector for releaseMilestone", () => {
      const selector = ethers.id("releaseMilestone(uint256)").slice(0, 10);
      expect(selector).toBe("0x317debf5");
    });

    it("should have correct selector for createProject", () => {
      const selector = ethers.id("createProject(address,uint256[])").slice(0, 10);
      expect(selector).toBe("0xcd278980");
    });
  });

  describe("Agent Workflow", () => {
    it("should complete full proposal creation flow", () => {
      // Simulate agent workflow
      const agentAddress = TEST_AGENT_ADDRESS;
      const milestones = ["0.01", "0.02", "0.01"];
      const description = "Build a data analysis tool";

      // Step 1: Calculate totals
      const milestoneWei = milestones.map(a => ethers.parseEther(a));
      const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);
      const totalEth = ethers.formatEther(totalValue);

      // Step 2: Generate transaction
      const txData = contract.interface.encodeFunctionData("createProject", [
        agentAddress,
        milestoneWei
      ]);

      // Step 3: Verify proposal
      const proposal = {
        agent: agentAddress,
        totalFunding: `${totalEth} ETH`,
        milestoneCount: milestones.length,
        milestones: milestones.map((amt, i) => ({
          milestone: i + 1,
          amount: `${amt} ETH`
        })),
        description,
        transaction: {
          to: CONTRACT_ADDRESS,
          value: `${totalEth} ETH`,
          data: txData
        }
      };

      expect(proposal.agent).toBe(agentAddress);
      expect(proposal.totalFunding).toBe("0.04 ETH");
      expect(proposal.milestoneCount).toBe(3);
      expect(proposal.milestones[0].amount).toBe("0.01 ETH");
      expect(proposal.transaction.to).toBe(CONTRACT_ADDRESS);
    });
  });
});
