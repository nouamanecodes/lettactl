import { shouldPrintNotAvailableForAgent } from '../../../src/commands/get/availability';

describe('get resource availability', () => {
  const client = (agent: any) => ({
    getAgent: jest.fn().mockResolvedValue(agent),
  }) as any;

  it('does not hide non-empty resource lists', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ agent_type: 'letta_v1_agent', blocks: [] }),
      'agent-1',
      [{ id: 'block-1' }],
      'table'
    );

    expect(result).toBe(false);
  });

  it('keeps json output compatible', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ metadata: { 'lettactl.memfs.enabled': true } }),
      'agent-1',
      [],
      'json'
    );

    expect(result).toBe(false);
  });

  it('prints not available for memfs-backed agents', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ agent_type: 'letta_v1_agent', metadata: { 'lettactl.memfs.enabled': true } }),
      'agent-1',
      [],
      'table'
    );

    expect(result).toBe(true);
  });

  it('prints not available for non-v1 agents', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ agent_type: 'letta_code_agent', blocks: [{ id: 'block-1' }] }),
      'agent-1',
      [],
      'table'
    );

    expect(result).toBe(true);
  });

  it('prints not available when no primitive bindings exist', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ agent_type: 'letta_v1_agent', blocks: [], tools: [] }),
      'agent-1',
      [],
      'table'
    );

    expect(result).toBe(true);
  });

  it('keeps old-shape v1 agents with blocks available', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ agent_type: 'letta_v1_agent', blocks: [{ id: 'block-1' }], tools: [] }),
      'agent-1',
      [],
      'table'
    );

    expect(result).toBe(false);
  });

  it('keeps old-shape v1 agents with tools available', async () => {
    const result = await shouldPrintNotAvailableForAgent(
      client({ agent_type: 'letta_v1_agent', blocks: [], tools: [{ id: 'tool-1' }] }),
      'agent-1',
      [],
      'table'
    );

    expect(result).toBe(false);
  });
});
