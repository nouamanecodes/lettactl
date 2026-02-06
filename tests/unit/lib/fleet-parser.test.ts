import { FleetParser } from '../../../src/lib/apply/fleet-parser';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('FleetParser', () => {
  let parser: FleetParser;
  const testBasePath = '/test/path';

  beforeEach(() => {
    parser = new FleetParser(testBasePath);
    jest.clearAllMocks();
  });

  describe('parseFleetConfig', () => {
    it('should parse a basic YAML configuration', async () => {
      const yamlContent = `
agents:
  - name: test-agent
    description: "Test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a test agent"
    tools:
      - archival_memory_insert
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(yamlContent);

      const config = await parser.parseFleetConfig(configPath);

      expect(config.agents).toHaveLength(1);
      expect(config.agents[0].name).toBe('test-agent');
      expect(config.agents[0].description).toBe('Test agent');
      expect(config.agents[0].llm_config?.model).toBe('google_ai/gemini-2.5-pro');
      expect(config.agents[0].system_prompt.value).toContain('You are a test agent');
    });

    it('should handle shared blocks', async () => {
      const yamlContent = `
shared_blocks:
  - name: shared-block
    description: "Shared memory"
    limit: 5000
    value: "Shared content"
    agent_owned: true

agents:
  - name: test-agent
    description: "Test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    shared_blocks:
      - shared-block
    system_prompt:
      value: "Test prompt"
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(yamlContent);

      const config = await parser.parseFleetConfig(configPath);

      expect(config.shared_blocks).toHaveLength(1);
      expect(config.shared_blocks![0].name).toBe('shared-block');
      expect(config.agents[0].shared_blocks).toContain('shared-block');
    });

    it('should resolve file-based prompts', async () => {
      const yamlContent = `
agents:
  - name: test-agent
    description: "Test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      from_file: "test-prompt.md"
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockImplementation((filePath: any) => {
        return filePath === configPath ||
               filePath.toString().includes('base-letta-system.md') || 
               filePath.toString().includes('test-prompt.md');
      });
      
      mockedFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === configPath) {
          return yamlContent;
        }
        if (filePath.toString().includes('base-letta-system.md')) {
          return 'Base system instructions';
        }
        if (filePath.toString().includes('test-prompt.md')) {
          return 'Custom prompt content';
        }
        return '';
      });

      const config = await parser.parseFleetConfig(configPath);

      expect(config.agents[0].system_prompt.value).toBe('Base system instructions\n\nCustom prompt content');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('base-letta-system.md'),
        'utf8'
      );
    });

    it('should expand shared folder references into agent folders', async () => {
      const yamlContent = `
shared_folders:
  - name: company-docs
    files:
      - docs/handbook.pdf
      - docs/policies.pdf

agents:
  - name: test-agent
    description: "Test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "Test prompt"
    shared_folders:
      - company-docs
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(yamlContent);

      const config = await parser.parseFleetConfig(configPath);

      expect(config.shared_folders).toHaveLength(1);
      expect(config.agents[0].folders).toHaveLength(1);
      expect(config.agents[0].folders![0].name).toBe('company-docs');
      expect(config.agents[0].folders![0].files).toEqual(['docs/handbook.pdf', 'docs/policies.pdf']);
    });

    it('should throw on unknown shared folder reference', async () => {
      const yamlContent = `
agents:
  - name: test-agent
    description: "Test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "Test prompt"
    shared_folders:
      - nonexistent-folder
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(yamlContent);

      await expect(parser.parseFleetConfig(configPath)).rejects.toThrow('unknown shared_folder');
    });

    it('should handle tool auto-discovery', async () => {
      mockedFs.readdirSync.mockReturnValue(['tool1.py', 'tool2.py', 'readme.txt'] as any);

      const yamlContent = `
agents:
  - name: test-agent
    description: "Test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "Test"
    tools:
      - tools/*
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(yamlContent);

      const config = await parser.parseFleetConfig(configPath);

      expect(config.agents[0].tools).toEqual(['tool1', 'tool2']);
    });

    it('should throw error for invalid YAML', async () => {
      const invalidYaml = `
agents:
  - name: test-agent
    description: "Test agent"
    system_prompt
      value: "Missing colon"
`;
      const configPath = '/test/path/fleet.yaml';

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(invalidYaml);

      await expect(parser.parseFleetConfig(configPath)).rejects.toThrow();
    });
  });
});