# AgentFund MCP Server 💰🤖

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![Base](https://img.shields.io/badge/Chain-Base-0052FF)](https://base.org)

MCP (Model Context Protocol) server for **AgentFund** - a crowdfunding platform for AI agents on Base chain.

## What is AgentFund?

AgentFund enables trustless crowdfunding for AI agents through milestone-based escrow contracts. Funders can support AI agent projects with automatic fund releases tied to milestone completion.

- 🎯 **Milestone-based releases**: Funds unlock as agents complete work
- 🔐 **Trustless escrow**: Smart contract holds funds securely  
- 💸 **5% platform fee**: Sustainable infrastructure
- ↩️ **Refunds on cancel**: Funders protected if project cancelled

**Contract**: [`0x6a4420f696c9ba6997f41dddc15b938b54aa009a`](https://basescan.org/address/0x6a4420f696c9ba6997f41dddc15b938b54aa009a) (Base Mainnet)

## Installation

```bash
npm install agentfund-mcp
```

Or clone and build:
```bash
git clone https://github.com/Riobot-Grind/agentfund-mcp
cd agentfund-mcp
npm install && npm run build
```

## Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentfund": {
      "command": "npx",
      "args": ["agentfund-mcp"],
      "env": {
        "BASE_RPC_URL": "https://mainnet.base.org"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_RPC_URL` | `https://mainnet.base.org` | Base RPC endpoint |

## Available Tools

| Tool | Description |
|------|-------------|
| `get_project` | Get project details (funder, agent, amounts, status) |
| `get_project_count` | Total projects created on AgentFund |
| `estimate_create_project` | Generate tx data for new project |
| `generate_release_tx` | Generate tx data to release milestone |
| `generate_cancel_tx` | Generate tx data to cancel project |

## Example

```
User: How many projects are on AgentFund?
Agent: [Calls get_project_count]
Result: Total projects on AgentFund: 3

User: Show me project 1
Agent: [Calls get_project with projectId="1"]
Result: {
  "projectId": "1",
  "funder": "0xD920fa63B3b1a1E0CA4380a9cBba79DAf648A572",
  "agent": "0xc2212629Ef3b17C755682b9490711a39468dA6bB",
  "totalAmount": "0.001",
  "releasedAmount": "0.0",
  "currentMilestone": "0",
  "totalMilestones": "1",
  "status": "Active"
}
```

## Development

```bash
npm install
npm run dev  # Run with tsx
npm run build  # Compile TypeScript
```

## Related

- [AgentFund Escrow Contract](https://github.com/Riobot-Grind/agentfund-escrow)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Base Chain](https://base.org)

## License

MIT

