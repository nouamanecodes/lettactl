import {
  canaryName,
  productionName,
  isCanaryName,
  buildCanaryMetadata,
  rewriteAgentNamesForCanary,
  DEFAULT_CANARY_PREFIX,
} from '../../../src/lib/apply/canary';

describe('canary utilities', () => {
  const prefix = DEFAULT_CANARY_PREFIX;

  describe('canaryName', () => {
    it('prefixes agent name with default prefix', () => {
      expect(canaryName('my-agent', prefix)).toBe('CANARY-my-agent');
    });

    it('uses custom prefix', () => {
      expect(canaryName('my-agent', 'STAGING-')).toBe('STAGING-my-agent');
    });
  });

  describe('productionName', () => {
    it('strips canary prefix', () => {
      expect(productionName('CANARY-my-agent', prefix)).toBe('my-agent');
    });

    it('returns name unchanged if no prefix', () => {
      expect(productionName('my-agent', prefix)).toBe('my-agent');
    });
  });

  describe('isCanaryName', () => {
    it('detects canary names', () => {
      expect(isCanaryName('CANARY-agent', prefix)).toBe(true);
    });

    it('rejects non-canary names', () => {
      expect(isCanaryName('production-agent', prefix)).toBe(false);
    });

    it('works with custom prefix', () => {
      expect(isCanaryName('STAGING-agent', 'STAGING-')).toBe(true);
    });
  });

  describe('buildCanaryMetadata', () => {
    it('contains required keys', () => {
      const meta = buildCanaryMetadata('my-agent', prefix);
      expect(meta['lettactl.canary']).toBe(true);
      expect(meta['lettactl.canary.productionName']).toBe('my-agent');
      expect(meta['lettactl.canary.prefix']).toBe(prefix);
      expect(meta['lettactl.canary.createdAt']).toBeDefined();
    });
  });

  describe('rewriteAgentNamesForCanary', () => {
    it('rewrites all agent names with prefix', () => {
      const agents = [
        { name: 'agent-a', tools: ['tool1'], shared_blocks: ['shared-block-1'] },
        { name: 'agent-b', tools: ['tool2'] },
      ];
      const { rewrittenAgents, nameMap } = rewriteAgentNamesForCanary(agents, prefix);

      expect(rewrittenAgents[0].name).toBe('CANARY-agent-a');
      expect(rewrittenAgents[1].name).toBe('CANARY-agent-b');
      expect(nameMap.get('agent-a')).toBe('CANARY-agent-a');
      expect(nameMap.get('agent-b')).toBe('CANARY-agent-b');
    });

    it('preserves original name in _originalName', () => {
      const agents = [{ name: 'agent-x' }];
      const { rewrittenAgents } = rewriteAgentNamesForCanary(agents, prefix);
      expect(rewrittenAgents[0]._originalName).toBe('agent-x');
    });

    it('does not modify shared_blocks or tools', () => {
      const agents = [
        { name: 'agent-a', tools: ['web_search'], shared_blocks: ['guidelines'] },
      ];
      const { rewrittenAgents } = rewriteAgentNamesForCanary(agents, prefix);
      expect(rewrittenAgents[0].shared_blocks).toEqual(['guidelines']);
      expect(rewrittenAgents[0].tools).toEqual(['web_search']);
    });

    it('does not mutate original array', () => {
      const agents = [{ name: 'agent-a' }];
      rewriteAgentNamesForCanary(agents, prefix);
      expect(agents[0].name).toBe('agent-a');
    });
  });
});
