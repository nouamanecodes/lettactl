import {
  waitForAgentIdle,
  RequiresApprovalError,
  WaitForIdleTimeoutError,
} from '../../../src/lib/messaging/wait-for-idle';

function mockClient(sequence: any[][]) {
  const calls: any[] = [];
  const queue = [...sequence];
  return {
    calls,
    listRuns: jest.fn(async (opts: any) => {
      calls.push(opts);
      const next = queue.shift();
      return next ?? [];
    }),
  } as any;
}

describe('waitForAgentIdle', () => {
  it('returns immediately when agent has no active runs', async () => {
    const client = mockClient([[]]);
    const result = await waitForAgentIdle(client, 'agent-1', { pollMs: 1 });
    expect(result).toEqual({ waited: false, runsObserved: { 'agent-1': [] } });
    expect(client.listRuns).toHaveBeenCalledTimes(1);
    expect(client.listRuns).toHaveBeenCalledWith({ agentId: 'agent-1', active: true });
  });

  it('polls until runs terminate', async () => {
    const client = mockClient([
      [{ id: 'run-1', status: 'running' }],
      [{ id: 'run-1', status: 'running' }],
      [{ id: 'run-1', status: 'completed' }],
    ]);
    const result = await waitForAgentIdle(client, 'agent-1', { pollMs: 1 });
    expect(result.waited).toBe(true);
    expect(result.runsObserved['agent-1']).toContain('run-1');
    expect(client.listRuns).toHaveBeenCalledTimes(3);
  });

  it('treats run as idle when stop_reason is end_turn (status stale)', async () => {
    const client = mockClient([
      [{ id: 'run-1', status: 'running', stop_reason: 'end_turn' }],
    ]);
    const result = await waitForAgentIdle(client, 'agent-1', { pollMs: 1 });
    expect(result.waited).toBe(false);
  });

  it('throws RequiresApprovalError immediately on requires_approval', async () => {
    const client = mockClient([
      [{ id: 'run-pending', status: 'running', stop_reason: 'requires_approval' }],
    ]);
    await expect(waitForAgentIdle(client, 'agent-1', { pollMs: 1 }))
      .rejects.toBeInstanceOf(RequiresApprovalError);
  });

  it('times out per agent', async () => {
    const queue = [
      [{ id: 'r', status: 'running' }],
      [{ id: 'r', status: 'running' }],
      [{ id: 'r', status: 'running' }],
      [{ id: 'r', status: 'running' }],
    ];
    const client = {
      listRuns: jest.fn(async () => queue.shift() ?? [{ id: 'r', status: 'running' }]),
    } as any;
    await expect(waitForAgentIdle(client, 'agent-1', { pollMs: 5, timeoutMs: 20 }))
      .rejects.toBeInstanceOf(WaitForIdleTimeoutError);
  });

  it('handles multiple agents in parallel', async () => {
    const responses: Record<string, any[][]> = {
      'agent-1': [[{ id: 'r1', status: 'running' }], [{ id: 'r1', status: 'completed' }]],
      'agent-2': [[]],
    };
    const client = {
      listRuns: jest.fn(async (opts: any) => {
        const seq = responses[opts.agentId];
        return seq.shift() ?? [];
      }),
    } as any;
    const result = await waitForAgentIdle(client, ['agent-1', 'agent-2'], { pollMs: 1 });
    expect(result.waited).toBe(true);
    expect(result.runsObserved['agent-1']).toContain('r1');
    expect(result.runsObserved['agent-2']).toEqual([]);
  });

  it('invokes onWaitStart exactly once per agent when gate engages', async () => {
    const client = mockClient([
      [{ id: 'r1', status: 'running' }],
      [{ id: 'r1', status: 'running' }],
      [{ id: 'r1', status: 'completed' }],
    ]);
    const onWaitStart = jest.fn();
    await waitForAgentIdle(client, 'agent-1', { pollMs: 1, onWaitStart });
    expect(onWaitStart).toHaveBeenCalledTimes(1);
    expect(onWaitStart).toHaveBeenCalledWith('agent-1', ['r1']);
  });

  it('does not invoke onWaitStart when agent is already idle', async () => {
    const client = mockClient([[]]);
    const onWaitStart = jest.fn();
    await waitForAgentIdle(client, 'agent-1', { pollMs: 1, onWaitStart });
    expect(onWaitStart).not.toHaveBeenCalled();
  });

  it('returns empty result when given empty agent list', async () => {
    const client = mockClient([]);
    const result = await waitForAgentIdle(client, [], { pollMs: 1 });
    expect(result).toEqual({ waited: false, runsObserved: {} });
    expect(client.listRuns).not.toHaveBeenCalled();
  });

  it('handles items-shaped response from listRuns', async () => {
    const client = {
      listRuns: jest.fn(async () => ({ items: [] })),
    } as any;
    const result = await waitForAgentIdle(client, 'agent-1', { pollMs: 1 });
    expect(result.waited).toBe(false);
  });
});
