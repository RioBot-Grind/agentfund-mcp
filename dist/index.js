#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import { z } from "zod";
// AgentFund Escrow Contract on Base Mainnet
const CONTRACT_ADDRESS = "0x6a4420f696c9ba6997f41dddc15b938b54aa009a";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
// Contract ABI (simplified for key functions)
const ABI = [
    "function createProject(address agent, uint256[] milestoneAmounts) external payable returns (uint256)",
    "function releaseMilestone(uint256 projectId) external",
    "function cancelProject(uint256 projectId) external",
    "function getProject(uint256 projectId) external view returns (tuple(address funder, address agent, uint256 totalAmount, uint256 releasedAmount, uint256 currentMilestone, uint256 totalMilestones, uint8 status))",
    "function projectCount() external view returns (uint256)",
    "event ProjectCreated(uint256 indexed projectId, address indexed funder, address indexed agent, uint256 totalAmount)",
    "event MilestoneReleased(uint256 indexed projectId, uint256 milestoneIndex, uint256 amount)",
    "event ProjectCancelled(uint256 indexed projectId)"
];
const ProjectStatus = ["Active", "Completed", "Cancelled"];
// Tool schemas
const CreateProjectSchema = z.object({
    agentAddress: z.string().describe("Ethereum address of the agent to receive funds"),
    milestoneAmounts: z.array(z.string()).describe("Array of milestone amounts in ETH (e.g., ['0.01', '0.02'])"),
});
const ProjectIdSchema = z.object({
    projectId: z.string().describe("The project ID to interact with"),
});
class AgentFundMCPServer {
    server;
    provider;
    contract;
    constructor() {
        this.server = new Server({ name: "agentfund-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
        this.provider = new ethers.JsonRpcProvider(BASE_RPC);
        this.contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, this.provider);
        this.setupHandlers();
    }
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "get_project",
                    description: "Get details of an AgentFund project including funder, agent, amounts, and status",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectId: { type: "string", description: "The project ID" }
                        },
                        required: ["projectId"]
                    }
                },
                {
                    name: "get_project_count",
                    description: "Get the total number of projects created on AgentFund",
                    inputSchema: { type: "object", properties: {} }
                },
                {
                    name: "estimate_create_project",
                    description: "Estimate gas and generate transaction data for creating a new AgentFund project",
                    inputSchema: {
                        type: "object",
                        properties: {
                            agentAddress: { type: "string", description: "Agent's Ethereum address" },
                            milestoneAmounts: {
                                type: "array",
                                items: { type: "string" },
                                description: "Milestone amounts in ETH"
                            }
                        },
                        required: ["agentAddress", "milestoneAmounts"]
                    }
                },
                {
                    name: "generate_release_tx",
                    description: "Generate transaction data for releasing a milestone",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectId: { type: "string", description: "The project ID" }
                        },
                        required: ["projectId"]
                    }
                },
                {
                    name: "generate_cancel_tx",
                    description: "Generate transaction data for cancelling a project",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectId: { type: "string", description: "The project ID" }
                        },
                        required: ["projectId"]
                    }
                }
            ]
        }));
        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case "get_project":
                        return await this.getProject(args);
                    case "get_project_count":
                        return await this.getProjectCount();
                    case "estimate_create_project":
                        return await this.estimateCreateProject(args);
                    case "generate_release_tx":
                        return await this.generateReleaseTx(args);
                    case "generate_cancel_tx":
                        return await this.generateCancelTx(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        });
    }
    async getProject(args) {
        const project = await this.contract.getProject(args.projectId);
        const result = {
            projectId: args.projectId,
            funder: project[0],
            agent: project[1],
            totalAmount: ethers.formatEther(project[2]),
            releasedAmount: ethers.formatEther(project[3]),
            currentMilestone: project[4].toString(),
            totalMilestones: project[5].toString(),
            status: ProjectStatus[Number(project[6])] || "Unknown"
        };
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
        };
    }
    async getProjectCount() {
        const count = await this.contract.projectCount();
        return {
            content: [{
                    type: "text",
                    text: `Total projects on AgentFund: ${count.toString()}`
                }]
        };
    }
    async estimateCreateProject(args) {
        const milestoneWei = args.milestoneAmounts.map(a => ethers.parseEther(a));
        const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);
        const txData = this.contract.interface.encodeFunctionData("createProject", [
            args.agentAddress,
            milestoneWei
        ]);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        to: CONTRACT_ADDRESS,
                        data: txData,
                        value: totalValue.toString(),
                        valueEth: ethers.formatEther(totalValue),
                        description: `Create project with ${args.milestoneAmounts.length} milestones, total ${ethers.formatEther(totalValue)} ETH`
                    }, null, 2)
                }]
        };
    }
    async generateReleaseTx(args) {
        const txData = this.contract.interface.encodeFunctionData("releaseMilestone", [args.projectId]);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        to: CONTRACT_ADDRESS,
                        data: txData,
                        value: "0",
                        description: `Release next milestone for project ${args.projectId}`
                    }, null, 2)
                }]
        };
    }
    async generateCancelTx(args) {
        const txData = this.contract.interface.encodeFunctionData("cancelProject", [args.projectId]);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        to: CONTRACT_ADDRESS,
                        data: txData,
                        value: "0",
                        description: `Cancel project ${args.projectId} and refund remaining funds`
                    }, null, 2)
                }]
        };
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("AgentFund MCP Server running on stdio");
    }
}
const server = new AgentFundMCPServer();
server.run().catch(console.error);
