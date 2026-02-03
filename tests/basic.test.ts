/**
 * Basic tests for AgentFund MCP Server
 */
import { describe, it, expect } from 'vitest';

describe('AgentFund MCP', () => {
  const CONTRACT = '0x6a4420f696c9ba6997f41dddc15b938b54aa009a';
  const RPC = 'https://mainnet.base.org';

  it('should have correct contract address', () => {
    expect(CONTRACT).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should connect to Base RPC', async () => {
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1
      })
    });
    const data = await response.json();
    expect(data.result).toBe('0x2105'); // Base mainnet chain ID
  });

  it('should read project count from contract', async () => {
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: CONTRACT,
          data: '0x36fbad26' // projectCount()
        }, 'latest'],
        id: 1
      })
    });
    const data = await response.json();
    // Handle rate limiting gracefully
    if (data.error && data.error.message && data.error.message.includes('rate limit')) {
      console.warn('Test skipped due to RPC rate limiting');
      expect(true).toBe(true);
    } else {
      expect(data.result).toBeDefined();
    }
  });
});
