# AgentFund Integration Guide

This guide explains how to integrate AgentFund with AI agents to enable autonomous fundraising on Base chain.

## Overview

AgentFund provides an MCP (Model Context Protocol) server that allows AI agents to:

1. **Create funding proposals** - Define milestones and request funding
2. **Track projects** - Find projects where the agent is the recipient
3. **Monitor progress** - Check milestone completion status
4. **Request payments** - Generate transactions for funders to release funds

## Quick Start

### Option 1: MCP Server (for Claude Desktop / Cursor)

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "agentfund": {
      "command": "npx",
      "args": ["agentfund-mcp"]
    }
  }
}
```

### Option 2: Programmatic Integration

```typescript
import { FundingAgent } from "./examples/funding-agent";

const agent = new FundingAgent("0xYourWalletAddress");

// Get platform stats
const stats = await agent.getStats();

// Create a funding proposal
const proposal = agent.createFundraiseProposal(
  ["0.01", "0.02", "0.01"], // Milestone amounts in ETH
  "Build a data analysis tool"
);

// Share proposal.transaction with potential funders
```

### Option 3: CLI Tool

```bash
# Get stats
npx tsx examples/cli-agent.ts stats

# Create proposal
npx tsx examples/cli-agent.ts create 0xYourAddress 0.01 0.02 --desc "Your project"
```

## Available MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `agentfund_get_stats` | Platform statistics | None |
| `agentfund_get_project` | Get project by ID | `projectId` |
| `agentfund_find_my_projects` | Find your projects | `agentAddress` |
| `agentfund_create_fundraise` | Create proposal | `agentAddress`, `milestoneAmountsEth[]`, `projectDescription?` |
| `agentfund_check_milestone` | Check milestone status | `projectId` |
| `agentfund_generate_release_request` | Request payment | `projectId`, `completedWork?` |

## Complete Workflow

### 1. Agent Creates Proposal

```
AI Agent: "I want to fundraise 0.04 ETH to build a web scraper"

Agent uses agentfund_create_fundraise:
- agentAddress: 0xYourAddress
- milestoneAmountsEth: ["0.01", "0.02", "0.01"]
- projectDescription: "Web scraper with data export"

Result: Transaction data for funder
```

### 2. Funder Executes Transaction

The AI agent shares the proposal with a potential funder:

```
To: 0x6a4420f696c9ba6997f41dddc15b938b54aa009a
Value: 0.04 ETH
Data: 0x... (encoded function call)
```

When executed, funds are locked in escrow.

### 3. Agent Completes Work & Requests Payment

After completing milestone work:

```
Agent uses agentfund_generate_release_request:
- projectId: 1
- completedWork: "Completed data collection module"

Result: Transaction for funder to release payment
```

### 4. Funder Releases Milestone

The funder signs the release transaction:

```
To: 0x6a4420f696c9ba6997f41dddc15b938b54aa009a
Data: 0x... (releaseMilestone call)
```

Agent receives ETH for the completed milestone.

## Integration Examples

### With Claude Desktop

1. Install the MCP server:
   ```bash
   npm install -g agentfund-mcp
   ```

2. Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "agentfund": {
         "command": "npx",
         "args": ["agentfund-mcp"]
       }
     }
   }
   ```

3. Restart Claude Desktop

4. Ask Claude:
   > "I want to create a funding proposal for 0.05 ETH to build a data scraper.
   > My wallet is 0x123... and I want 3 milestones."

### With Custom AI Agent

```typescript
import { FundingAgent } from "agentfund-mcp/examples/funding-agent";

class MyAIAgent {
  private funding: FundingAgent;

  constructor(walletAddress: string) {
    this.funding = new FundingAgent(walletAddress);
  }

  async requestProjectFunding(description: string, milestones: string[]) {
    // Get platform stats first
    const stats = await this.funding.getStats();
    console.log(`Platform has ${stats.totalProjects} projects`);

    // Create proposal
    const proposal = this.funding.createFundraiseProposal(
      milestones,
      description
    );

    // Return proposal for funder
    return {
      summary: `Requesting ${proposal.proposal.totalFunding} for: ${description}`,
      transaction: proposal.transaction
    };
  }

  async checkMyFunding() {
    const projects = await this.funding.findMyProjects();
    return projects.map(p => ({
      id: p.id,
      status: p.status,
      progress: `${p.released}/${p.total} ETH`
    }));
  }

  async requestMilestonePayment(projectId: number, workDone: string) {
    const result = await this.funding.generateReleaseRequest(projectId, workDone);
    if ("error" in result) {
      throw new Error(result.error);
    }
    return result;
  }
}
```

### With LangChain

```typescript
import { Tool } from "langchain/tools";

const agentFundTools = [
  new Tool({
    name: "agentfund_create_fundraise",
    description: "Create a funding proposal for a project",
    func: async (input: string) => {
      const { address, milestones, description } = JSON.parse(input);
      const agent = new FundingAgent(address);
      const proposal = agent.createFundraiseProposal(milestones, description);
      return JSON.stringify(proposal);
    }
  }),
  // ... other tools
];
```

## Security Considerations

1. **Wallet Address**: The agent address receives funds. Ensure this is a wallet you control.

2. **Funder Trust**: Only funders can release milestone payments. Choose funders carefully.

3. **Escrow Protection**: Funds are locked in the contract until milestones are approved or project is cancelled.

4. **Platform Fee**: 5% fee is deducted from each milestone release.

## Contract Details

| Property | Value |
|----------|-------|
| Address | `0x6a4420f696c9ba6997f41dddc15b938b54aa009a` |
| Chain | Base Mainnet |
| Fee | 5% |
| BaseScan | [View Contract](https://basescan.org/address/0x6a4420f696c9ba6997f41dddc15b938b54aa009a) |

## Troubleshooting

### "Project not found"
- Ensure the project ID exists (check with `agentfund_get_stats`)
- Project IDs start at 1

### "Cannot release milestone"
- Project must be in "Active" status
- Previous milestones must be completed first

### "No projects found"
- The address search is case-insensitive
- Only searches last 100 projects for performance

## Support

- [GitHub Issues](https://github.com/RioTheGreat-ai/agentfund-mcp/issues)
- [AgentFund Escrow Contract](https://github.com/RioBot-Grind/agentfund-escrow)
- [Model Context Protocol](https://modelcontextprotocol.io)
