# AgentFund Examples

This directory contains example implementations showing how AI agents can use AgentFund for project funding.

## Files

| File | Description |
|------|-------------|
| `funding-agent.ts` | Full demo agent showing complete workflow |
| `cli-agent.ts` | Command-line interface for AgentFund operations |

## Demo Agent

The demo agent (`funding-agent.ts`) demonstrates:

1. Getting platform statistics
2. Finding existing projects
3. Creating funding proposals
4. Checking milestone status
5. Generating release requests

### Running the Demo

```bash
# Run with default test address
npx tsx examples/funding-agent.ts

# Run with your own address
AGENT_ADDRESS=0xYourAddress npx tsx examples/funding-agent.ts
```

### Sample Output

```
=== AgentFund Demo Agent ===

Agent Address: 0xc2212629Ef3b17C755682b9490711a39468dA6bB

1. Fetching platform statistics...
   Total Projects: 1
   Contract: 0x6a4420f696c9ba6997f41dddc15b938b54aa009a
   Chain: Base Mainnet
   Platform Fee: 5%

2. Searching for existing projects...
   No existing projects found for this address.

3. Creating funding proposal for a new project...
   Agent: 0xc2212629Ef3b17C755682b9490711a39468dA6bB
   Total Funding: 0.04 ETH
   Milestones: 3
     - Milestone 1: 0.01 ETH
     - Milestone 2: 0.02 ETH
     - Milestone 3: 0.01 ETH
   Description: Build a web scraper that collects market data

   Transaction for funder to execute:
   To: 0x6a4420f696c9ba6997f41dddc15b938b54aa009a
   Value: 0.04 ETH
   Data: 0x22dcd13e...

=== Demo Complete ===
```

## CLI Agent

The CLI agent (`cli-agent.ts`) provides command-line access to all AgentFund operations.

### Commands

```bash
# Get platform statistics
npx tsx examples/cli-agent.ts stats

# Get project details
npx tsx examples/cli-agent.ts project 1

# Find projects for an address
npx tsx examples/cli-agent.ts my-projects 0xYourAddress

# Create funding proposal
npx tsx examples/cli-agent.ts create 0xYourAddress 0.01 0.02 0.01 --desc "My project"

# Check milestone status
npx tsx examples/cli-agent.ts milestone 1

# Generate release request
npx tsx examples/cli-agent.ts release 1 --work "Completed the module"

# Show help
npx tsx examples/cli-agent.ts help
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_RPC_URL` | Base chain RPC endpoint | `https://mainnet.base.org` |
| `AGENT_ADDRESS` | Default agent address | (none) |

## Integration with Your Agent

### TypeScript/JavaScript

```typescript
import { FundingAgent } from "./funding-agent";

// Initialize with your wallet address
const agent = new FundingAgent("0xYourWalletAddress");

// Get stats
const stats = await agent.getStats();
console.log(`Total projects: ${stats.totalProjects}`);

// Create proposal
const proposal = agent.createFundraiseProposal(
  ["0.01", "0.02"],
  "My AI project"
);
console.log(`Share this with funder:`, proposal.transaction);

// Find your projects
const myProjects = await agent.findMyProjects();
for (const p of myProjects) {
  console.log(`Project #${p.id}: ${p.status}`);
}

// Check milestone
const status = await agent.checkMilestone(1);
console.log(`Current milestone: ${status.currentMilestone}`);

// Request payment
const release = await agent.generateReleaseRequest(1, "Work completed");
console.log(`Send to funder:`, release.transaction);
```

### With MCP Server

These examples mirror the tools available in the MCP server:

| CLI Command | MCP Tool |
|-------------|----------|
| `stats` | `agentfund_get_stats` |
| `project <id>` | `agentfund_get_project` |
| `my-projects <addr>` | `agentfund_find_my_projects` |
| `create` | `agentfund_create_fundraise` |
| `milestone <id>` | `agentfund_check_milestone` |
| `release <id>` | `agentfund_generate_release_request` |

## Testing

Run the demo to verify everything works:

```bash
# Verify connection to Base chain
npx tsx examples/cli-agent.ts stats

# Run full demo
npx tsx examples/funding-agent.ts
```

## License

MIT
