import { DiffApplier } from '../../../src/lib/apply/diff-applier';

describe('DiffApplier', () => {
  it('does not update lettactl model metadata when the live model update does not take effect', async () => {
    const client = {
      updateAgent: jest.fn().mockResolvedValue({
        id: 'agent-1',
        llm_config: { handle: 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0' },
        metadata: { 'lettactl.model': 'lc-zai/glm-4.7' },
      }),
      getAgent: jest.fn().mockResolvedValue({
        id: 'agent-1',
        llm_config: { handle: 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0' },
        metadata: { 'lettactl.model': 'lc-zai/glm-4.7' },
      }),
    } as any;

    const applier = new DiffApplier(client);

    await expect(applier.applyUpdateOperations('agent-1', {
      operationCount: 1,
      preservesConversation: true,
      updateFields: {
        model: {
          from: 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
          to: 'lc-zai/glm-4.7',
        },
      },
    })).rejects.toThrow('Agent model update did not take effect');

    expect(client.updateAgent).toHaveBeenCalledTimes(1);
    expect(client.updateAgent).toHaveBeenCalledWith('agent-1', { model: 'lc-zai/glm-4.7' });
  });

  it('updates lettactl model metadata after the live model update is verified', async () => {
    const client = {
      updateAgent: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'agent-1',
          llm_config: { handle: 'lc-zai/glm-4.7' },
          metadata: { 'lettactl.model': 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0' },
        })
        .mockResolvedValueOnce({ id: 'agent-1' }),
      getAgent: jest.fn().mockResolvedValue({
        id: 'agent-1',
        llm_config: { handle: 'lc-zai/glm-4.7' },
        metadata: { 'lettactl.model': 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0' },
      }),
    } as any;

    const applier = new DiffApplier(client);

    await applier.applyUpdateOperations('agent-1', {
      operationCount: 1,
      preservesConversation: true,
      updateFields: {
        model: {
          from: 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
          to: 'lc-zai/glm-4.7',
        },
      },
    });

    expect(client.updateAgent).toHaveBeenCalledTimes(2);
    expect(client.updateAgent).toHaveBeenNthCalledWith(1, 'agent-1', { model: 'lc-zai/glm-4.7' });
    expect(client.updateAgent).toHaveBeenNthCalledWith(2, 'agent-1', {
      metadata: { 'lettactl.model': 'lc-zai/glm-4.7' },
    });
  });

});
