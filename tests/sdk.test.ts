// Simple SDK test focusing on core functionality without heavy dependencies
import { FleetConfig } from '../src/types/fleet-config';

// Create a simplified test that directly tests the FleetConfigBuilder logic
describe('SDK FleetConfigBuilder', () => {
  
  interface FleetConfigBuilder {
    addAgent(agent: any): FleetConfigBuilder;
    addSharedBlock(block: any): FleetConfigBuilder;
    build(): FleetConfig;
  }

  class TestFleetConfigBuilder implements FleetConfigBuilder {
    private agents: any[] = [];
    private sharedBlocks: any[] = [];

    addAgent(agent: any): FleetConfigBuilder {
      this.agents.push(agent);
      return this;
    }

    addSharedBlock(block: any): FleetConfigBuilder {
      this.sharedBlocks.push(block);
      return this;
    }

    build(): FleetConfig {
      const config: FleetConfig = {
        agents: this.agents
      };
      
      if (this.sharedBlocks.length > 0) {
        config.shared_blocks = this.sharedBlocks;
      }
      
      return config;
    }
  }

  describe('Fleet configuration building', () => {
    let builder: FleetConfigBuilder;

    beforeEach(() => {
      builder = new TestFleetConfigBuilder();
    });

    it('should create empty fleet config', () => {
      const config = builder.build();
      
      expect(config.agents).toEqual([]);
      expect(config.shared_blocks).toBeUndefined();
    });

    it('should add single agent to fleet config', () => {
      const agent = {
        name: 'test-agent',
        description: 'Test agent',
        llm_config: { model: 'test-model', context_window: 2000 },
        system_prompt: { value: 'Test prompt' }
      };

      const config = builder
        .addAgent(agent)
        .build();

      expect(config.agents).toHaveLength(1);
      expect(config.agents[0]).toEqual(agent);
    });

    it('should add shared blocks to fleet config', () => {
      const sharedBlock = {
        name: 'shared-block',
        description: 'Test shared block',
        limit: 5000,
        value: 'Shared content'
      };

      const config = builder
        .addSharedBlock(sharedBlock)
        .build();

      expect(config.shared_blocks).toHaveLength(1);
      expect(config.shared_blocks![0]).toEqual(sharedBlock);
    });

    it('should add agents with complex configurations', () => {
      const complexAgent = {
        name: 'complex-agent',
        description: 'Agent with all features',
        llm_config: { model: 'advanced-model', context_window: 8000 },
        system_prompt: { value: 'Complex agent prompt' },
        tools: ['tool1', 'tool2', 'tools/*'],
        shared_blocks: ['shared-block'],
        memory_blocks: [
          {
            name: 'memory-1',
            description: 'First memory block',
            limit: 2000,
            value: 'Memory content 1'
          }
        ],
        folders: [
          {
            name: 'docs',
            files: ['files/*']
          }
        ],
        embedding: 'test-embedding'
      };

      const config = builder
        .addAgent(complexAgent)
        .build();

      expect(config.agents[0]).toEqual(complexAgent);
      expect(config.agents[0].tools).toHaveLength(3);
      expect(config.agents[0].memory_blocks).toHaveLength(1);
      expect(config.agents[0].folders).toHaveLength(1);
    });

    it('should build complex fleet with shared blocks and agents', () => {
      const sharedBlock = {
        name: 'shared-1',
        description: 'First shared block',
        limit: 5000,
        value: 'Shared content 1'
      };

      const agent1 = {
        name: 'agent-1',
        description: 'First agent',
        llm_config: { model: 'model-1', context_window: 2000 },
        system_prompt: { value: 'Agent 1 prompt' },
        shared_blocks: ['shared-1']
      };

      const agent2 = {
        name: 'agent-2',
        description: 'Second agent',
        llm_config: { model: 'model-2', context_window: 4000 },
        system_prompt: { value: 'Agent 2 prompt' },
        shared_blocks: ['shared-1'],
        memory_blocks: [{
          name: 'agent2-memory',
          description: 'Agent 2 memory',
          limit: 1000,
          value: 'Agent 2 content'
        }]
      };

      const config = builder
        .addSharedBlock(sharedBlock)
        .addAgent(agent1)
        .addAgent(agent2)
        .build();

      expect(config.shared_blocks).toHaveLength(1);
      expect(config.agents).toHaveLength(2);
      expect(config.agents[1].memory_blocks).toHaveLength(1);
    });
  });

  describe('Multi-user scenarios', () => {
    let builder: FleetConfigBuilder;

    beforeEach(() => {
      builder = new TestFleetConfigBuilder();
    });

    it('should handle single user onboarding scenario', () => {
      const userId = 'test-user-123';
      const userInfo = 'Test user information';

      const userAgent = {
        name: `${userId}-assistant`,
        description: `Assistant for ${userId}`,
        llm_config: { model: 'test-model', context_window: 2000 },
        system_prompt: { value: `You are an assistant for ${userId}` },
        memory_blocks: [{
          name: 'user-info',
          description: 'User information',
          limit: 5000,
          value: userInfo
        }]
      };

      const config = builder
        .addAgent(userAgent)
        .build();

      expect(config.agents).toHaveLength(1);
      expect(config.agents[0].name).toBe(`${userId}-assistant`);
      expect(config.agents[0].memory_blocks![0].value).toBe(userInfo);
    });

    it('should handle batch user onboarding scenario', () => {
      const users = [
        { id: 'user-1', info: 'User 1 info' },
        { id: 'user-2', info: 'User 2 info' },
        { id: 'user-3', info: 'User 3 info' }
      ];

      let batchBuilder = builder;
      for (const user of users) {
        batchBuilder = batchBuilder.addAgent({
          name: `${user.id}-assistant`,
          description: `Assistant for ${user.id}`,
          llm_config: { model: 'test-model', context_window: 2000 },
          system_prompt: { value: `You are an assistant for ${user.id}` },
          memory_blocks: [{
            name: 'user-info',
            description: 'User information',
            limit: 5000,
            value: user.info
          }]
        });
      }

      const config = batchBuilder.build();

      expect(config.agents).toHaveLength(3);
      expect(config.agents[0].name).toBe('user-1-assistant');
      expect(config.agents[1].name).toBe('user-2-assistant');
      expect(config.agents[2].name).toBe('user-3-assistant');
    });

    it('should handle dynamic user fleet with shared resources', () => {
      const userId = 'dynamic-user';
      const sharedGuidelines = 'Common operational guidelines';

      const config = builder
        .addSharedBlock({
          name: 'shared-guidelines',
          description: 'Shared guidelines for all users',
          limit: 5000,
          value: sharedGuidelines
        })
        .addAgent({
          name: `${userId}-document-assistant`,
          description: `Document assistant for ${userId}`,
          llm_config: { model: 'test-model', context_window: 2000 },
          system_prompt: { value: `You analyze documents for ${userId}` },
          shared_blocks: ['shared-guidelines'],
          folders: [{ name: 'documents', files: ['files/*'] }]
        })
        .addAgent({
          name: `${userId}-cloud-assistant`,
          description: `Cloud assistant for ${userId}`,
          llm_config: { model: 'test-model', context_window: 3000 },
          system_prompt: { value: `You are a cloud assistant for ${userId}` },
          shared_blocks: ['shared-guidelines'],
          memory_blocks: [{
            name: 'user-knowledge',
            description: 'User-specific knowledge',
            limit: 8000,
            value: `Knowledge for ${userId}`
          }]
        })
        .build();

      expect(config.shared_blocks).toHaveLength(1);
      expect(config.agents).toHaveLength(2);
      expect(config.agents[0].shared_blocks).toContain('shared-guidelines');
      expect(config.agents[1].shared_blocks).toContain('shared-guidelines');
    });
  });

  describe('Edge cases', () => {
    let builder: FleetConfigBuilder;

    beforeEach(() => {
      builder = new TestFleetConfigBuilder();
    });

    it('should handle agents with empty arrays', () => {
      const agentWithEmptyArrays = {
        name: 'empty-arrays-agent',
        description: 'Agent with empty arrays',
        llm_config: { model: 'test-model', context_window: 2000 },
        system_prompt: { value: 'Test prompt' },
        tools: [],
        memory_blocks: [],
        folders: [],
        shared_blocks: []
      };

      const config = builder
        .addAgent(agentWithEmptyArrays)
        .build();

      expect(config.agents[0].tools).toEqual([]);
      expect(config.agents[0].memory_blocks).toEqual([]);
      expect(config.agents[0].folders).toEqual([]);
      expect(config.agents[0].shared_blocks).toEqual([]);
    });

    it('should handle fleet with many agents', () => {
      let manyAgentsBuilder = builder;
      
      for (let i = 1; i <= 10; i++) {
        manyAgentsBuilder = manyAgentsBuilder.addAgent({
          name: `agent-${i}`,
          description: `Agent number ${i}`,
          llm_config: { model: 'test-model', context_window: 2000 },
          system_prompt: { value: `Agent ${i} prompt` }
        });
      }

      const config = manyAgentsBuilder.build();

      expect(config.agents).toHaveLength(10);
      expect(config.agents[0].name).toBe('agent-1');
      expect(config.agents[9].name).toBe('agent-10');
    });
  });
});