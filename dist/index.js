#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
// AgentFund Escrow Contract on Base Mainnet
const CONTRACT_ADDRESS = "0x6a4420f696c9ba6997f41dddc15b938b54aa009a";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
// Contract ABI
const ABI = [
    "function createProject(address agent, uint256[] milestoneAmounts) external payable returns (uint256)",
    "function releaseMilestone(uint256 projectId) external",
    "function cancelProject(uint256 projectId) external",
    "function getProject(uint256 projectId) external view returns (tuple(address funder, address agent, uint256 totalAmount, uint256 releasedAmount, uint256 currentMilestone, uint256 totalMilestones, uint8 status))",
    "function projectCount() external view returns (uint256)",
    "event ProjectCreated(uint256 indexed projectId, address indexed funder, address indexed agent, uint256 totalAmount)",
    "event MilestoneReleased(uint256 indexed projectId, uint256 milestoneIndex, uint256 amount)"
];
const ProjectStatus = ["Active", "Completed", "Cancelled"];
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
                    name: "agentfund_get_project",
                    description: "Get details of an AgentFund project by ID. Returns funder address, agent address, total/released amounts, milestone progress, and status (Active/Completed/Cancelled).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectId: { type: "string", description: "The project ID number" }
                        },
                        required: ["projectId"]
                    }
                },
                {
                    name: "agentfund_get_stats",
                    description: "Get AgentFund platform statistics - total projects created and contract address.",
                    inputSchema: { type: "object", properties: {} }
                },
                {
                    name: "agentfund_find_my_projects",
                    description: "Find all AgentFund projects where a specific address is the agent (recipient). Use this to find projects you're fundraising for.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            agentAddress: { type: "string", description: "Your wallet address to search for" }
                        },
                        required: ["agentAddress"]
                    }
                },
                {
                    name: "agentfund_create_fundraise",
                    description: "Generate transaction data for creating a new AgentFund fundraise. YOU provide your agent address (where funds go) and milestones. A FUNDER will execute this transaction and send the ETH. Use this when you want to propose a project for funding.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            agentAddress: { type: "string", description: "Your wallet address that will receive the funds" },
                            milestoneAmountsEth: {
                                type: "array",
                                items: { type: "string" },
                                description: "Array of milestone amounts in ETH (e.g., ['0.01', '0.02', '0.01'] for 3 milestones)"
                            },
                            projectDescription: { type: "string", description: "Description of what you'll deliver for the funding" }
                        },
                        required: ["agentAddress", "milestoneAmountsEth"]
                    }
                },
                {
                    name: "agentfund_check_milestone",
                    description: "Check the current milestone status of a project. Shows which milestone you're on, how much has been released, and how much remains.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectId: { type: "string", description: "The project ID to check" }
                        },
                        required: ["projectId"]
                    }
                },
                {
                    name: "agentfund_generate_release_request",
                    description: "Generate a milestone release request. After completing work for a milestone, use this to generate the transaction the funder needs to sign to release your funds.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            projectId: { type: "string", description: "The project ID" },
                            completedWork: { type: "string", description: "Description of work completed for this milestone" }
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
                    case "agentfund_get_project":
                        return await this.getProject(args);
                    case "agentfund_get_stats":
                        return await this.getStats();
                    case "agentfund_find_my_projects":
                        return await this.findMyProjects(args);
                    case "agentfund_create_fundraise":
                        return await this.createFundraise(args);
                    case "agentfund_check_milestone":
                        return await this.checkMilestone(args);
                    case "agentfund_generate_release_request":
                        return await this.generateReleaseRequest(args);
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
        const totalAmount = ethers.formatEther(project[2]);
        const releasedAmount = ethers.formatEther(project[3]);
        const remaining = ethers.formatEther(project[2] - project[3]);
        const result = {
            projectId: args.projectId,
            funder: project[0],
            agent: project[1],
            totalAmount: `${totalAmount} ETH`,
            releasedAmount: `${releasedAmount} ETH`,
            remainingAmount: `${remaining} ETH`,
            currentMilestone: `${project[4].toString()} of ${project[5].toString()}`,
            status: ProjectStatus[Number(project[6])] || "Unknown"
        };
        return {
            content: [{
                    type: "text",
                    text: `**Project #${args.projectId}**\n` +
                        `Status: ${result.status}\n` +
                        `Agent (recipient): ${result.agent}\n` +
                        `Funder: ${result.funder}\n` +
                        `Total: ${result.totalAmount}\n` +
                        `Released: ${result.releasedAmount}\n` +
                        `Remaining: ${result.remainingAmount}\n` +
                        `Milestone: ${result.currentMilestone}`
                }]
        };
    }
    async getStats() {
        const count = await this.contract.projectCount();
        return {
            content: [{
                    type: "text",
                    text: `**AgentFund Statistics**\n` +
                        `Total Projects: ${count.toString()}\n` +
                        `Contract: ${CONTRACT_ADDRESS}\n` +
                        `Chain: Base Mainnet\n` +
                        `Platform Fee: 5%\n\n` +
                        `View on BaseScan: https://basescan.org/address/${CONTRACT_ADDRESS}`
                }]
        };
    }
    async findMyProjects(args) {
        const count = await this.contract.projectCount();
        const myProjects = [];
        // Search through projects (limited to last 100 for performance)
        const searchLimit = Math.min(Number(count), 100);
        for (let i = 1; i <= searchLimit; i++) {
            try {
                const project = await this.contract.getProject(i);
                if (project[1].toLowerCase() === args.agentAddress.toLowerCase()) {
                    myProjects.push({
                        id: i,
                        status: ProjectStatus[Number(project[6])],
                        total: ethers.formatEther(project[2]),
                        released: ethers.formatEther(project[3]),
                        milestone: `${project[4]}/${project[5]}`
                    });
                }
            }
            catch (e) {
                // Skip invalid projects
            }
        }
        if (myProjects.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: `No projects found where ${args.agentAddress} is the agent.\n\n` +
                            `To start fundraising, use agentfund_create_fundraise to generate a project proposal that a funder can execute.`
                    }]
            };
        }
        const projectList = myProjects.map(p => `• Project #${p.id}: ${p.status} - ${p.released}/${p.total} ETH released (Milestone ${p.milestone})`).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `**Your Projects on AgentFund**\n${projectList}`
                }]
        };
    }
    async createFundraise(args) {
        const milestoneWei = args.milestoneAmountsEth.map(a => ethers.parseEther(a));
        const totalValue = milestoneWei.reduce((a, b) => a + b, 0n);
        const totalEth = ethers.formatEther(totalValue);
        const txData = this.contract.interface.encodeFunctionData("createProject", [
            args.agentAddress,
            milestoneWei
        ]);
        const milestoneBreakdown = args.milestoneAmountsEth.map((amt, i) => `  Milestone ${i + 1}: ${amt} ETH`).join('\n');
        return {
            content: [{
                    type: "text",
                    text: `**🚀 AgentFund Fundraise Proposal**\n\n` +
                        `Agent (you): ${args.agentAddress}\n` +
                        `Total Funding: ${totalEth} ETH\n` +
                        `Milestones: ${args.milestoneAmountsEth.length}\n\n` +
                        `**Milestone Breakdown:**\n${milestoneBreakdown}\n\n` +
                        (args.projectDescription ? `**Project:** ${args.projectDescription}\n\n` : '') +
                        `**For Funder to Execute:**\n` +
                        `To: ${CONTRACT_ADDRESS}\n` +
                        `Value: ${totalEth} ETH\n` +
                        `Data: ${txData}\n\n` +
                        `Share this with potential funders. When they execute this transaction, your project will be created and you'll receive funds as you complete each milestone.`
                }]
        };
    }
    async checkMilestone(args) {
        const project = await this.contract.getProject(args.projectId);
        const currentMilestone = Number(project[4]);
        const totalMilestones = Number(project[5]);
        const status = ProjectStatus[Number(project[6])];
        const released = ethers.formatEther(project[3]);
        const total = ethers.formatEther(project[2]);
        const remaining = ethers.formatEther(project[2] - project[3]);
        if (status === "Completed") {
            return {
                content: [{
                        type: "text",
                        text: `✅ **Project #${args.projectId} - COMPLETED**\n\n` +
                            `All ${totalMilestones} milestones completed!\n` +
                            `Total received: ${total} ETH`
                    }]
            };
        }
        if (status === "Cancelled") {
            return {
                content: [{
                        type: "text",
                        text: `❌ **Project #${args.projectId} - CANCELLED**\n\n` +
                            `Released before cancel: ${released} ETH\n` +
                            `Refunded to funder: ${remaining} ETH`
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `📊 **Project #${args.projectId} - Milestone Status**\n\n` +
                        `Current: Milestone ${currentMilestone + 1} of ${totalMilestones}\n` +
                        `Completed: ${currentMilestone} milestones\n` +
                        `Released so far: ${released} ETH\n` +
                        `Remaining: ${remaining} ETH\n\n` +
                        `Complete your current milestone work, then use agentfund_generate_release_request to request payment.`
                }]
        };
    }
    async generateReleaseRequest(args) {
        const project = await this.contract.getProject(args.projectId);
        const status = ProjectStatus[Number(project[6])];
        if (status !== "Active") {
            return {
                content: [{
                        type: "text",
                        text: `Cannot release milestone - project is ${status}`
                    }],
                isError: true
            };
        }
        const txData = this.contract.interface.encodeFunctionData("releaseMilestone", [args.projectId]);
        const currentMilestone = Number(project[4]);
        const funder = project[0];
        return {
            content: [{
                    type: "text",
                    text: `**💰 Milestone Release Request**\n\n` +
                        `Project: #${args.projectId}\n` +
                        `Milestone: ${currentMilestone + 1}\n` +
                        `Funder: ${funder}\n\n` +
                        (args.completedWork ? `**Work Completed:**\n${args.completedWork}\n\n` : '') +
                        `**For Funder to Sign:**\n` +
                        `To: ${CONTRACT_ADDRESS}\n` +
                        `Data: ${txData}\n\n` +
                        `Send this to your funder (${funder}) to release your payment for this milestone.`
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
