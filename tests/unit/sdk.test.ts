jest.mock('ora', () => () => ({ start: jest.fn().mockReturnThis(), stop: jest.fn(), succeed: jest.fn(), fail: jest.fn() }));

import { LettaCtl, FleetConfigBuilder } from '../../src/sdk';
import { FleetConfig } from '../../src/types/fleet-config';

describe('FleetConfigBuilder', () => {
  it('builds config with agents and shared blocks', () => {
    const config = new FleetConfigBuilder()
      .addSharedBlock({ name: 'shared', description: 'd', limit: 1000, value: 'v' })
      .addAgent({ name: 'agent', description: 'd', llm_config: { model: 'm', context_window: 1000 }, system_prompt: { value: 'p' }, shared_blocks: ['shared'] })
      .build();

    expect(config.agents).toHaveLength(1);
    expect(config.shared_blocks).toHaveLength(1);
    expect(config.agents[0].shared_blocks).toContain('shared');
  });

  it('builds config with shared folders', () => {
    const config = new FleetConfigBuilder()
      .addSharedFolder({ name: 'docs', files: ['files/doc1.txt', 'files/doc2.txt'] })
      .addAgent({ name: 'agent', description: 'd', llm_config: { model: 'm', context_window: 1000 }, system_prompt: { value: 'p' }, shared_folders: ['docs'] })
      .build();

    expect(config.shared_folders).toHaveLength(1);
    expect(config.shared_folders![0].name).toBe('docs');
    expect(config.agents[0].shared_folders).toContain('docs');
  });

  it('starts with empty config', () => {
    const config = new FleetConfigBuilder().build();
    expect(config.agents).toEqual([]);
  });
});

describe('LettaCtl', () => {
  const ctl = new LettaCtl();

  it('validates fleet configs', () => {
    const valid: FleetConfig = {
      agents: [{ name: 'a', description: 'd', llm_config: { model: 'm', context_window: 1000 }, system_prompt: { value: 'p' } }]
    };
    expect(ctl.validateFleet(valid)).toBe(true);
    expect(ctl.validateFleet({} as FleetConfig)).toBe(false);
  });

  it('creates FleetConfigBuilder', () => {
    expect(ctl.createFleetConfig()).toBeInstanceOf(FleetConfigBuilder);
  });
});
