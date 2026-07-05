import { createNewAgent } from '../../../src/lib/apply/apply-helpers';

jest.mock('../../../src/lib/ux/spinner', () => ({
  createSpinner: jest.fn(() => ({
    start: jest.fn(() => ({
      succeed: jest.fn(),
      fail: jest.fn(),
      stop: jest.fn(),
    })),
  })),
}));

describe('apply helpers', () => {
  describe('createNewAgent', () => {
    it('does not create declared conversations before sidecar sync', async () => {
      const client = {
        createAgent: jest.fn().mockResolvedValue({ id: 'agent-123', name: 'test-agent' }),
        updateAgent: jest.fn().mockResolvedValue({}),
        createConversation: jest.fn(),
      };
      const agentManager = {
        updateRegistry: jest.fn(),
      };

      await createNewAgent(
        {
          name: 'test-agent',
          description: 'Test agent',
          system_prompt: { value: 'You are a test agent.' },
          llm_config: { model: 'lc-zai/glm-4.7', context_window: 64000 },
          include_base_tools: false,
          include_base_tool_rules: false,
          memory: { mode: 'memfs' },
          conversations: [
            { summary: 'Main chat' },
          ],
        },
        'test-agent',
        {
          client: client as any,
          blockManager: {} as any,
          archiveManager: {} as any,
          agentManager: agentManager as any,
          toolNameToId: new Map(),
          builtinTools: new Set(),
          createdFolders: new Map(),
          sharedBlockIds: new Map(),
          spinnerEnabled: false,
          verbose: false,
        },
      );

      expect(client.createAgent).toHaveBeenCalledWith(expect.objectContaining({
        name: 'test-agent',
        include_base_tools: false,
        include_base_tool_rules: false,
      }));
      expect(client.createConversation).not.toHaveBeenCalled();
    });
  });
});
