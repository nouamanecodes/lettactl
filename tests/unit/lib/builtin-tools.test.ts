import {
  resolveAgentToolNames,
  missingWebTools,
  isSelfHostedLetta,
  DEFAULT_WEB_TOOLS,
} from '../../../src/lib/tools/builtin-tools';

// memfs agents get no base tools, so the only additions are the web-research defaults.
const memfs = { memory: { mode: 'memfs' }, include_base_tools: false };

describe('resolveAgentToolNames web-research defaults', () => {
  it('injects web_search + fetch_webpage when tools is unspecified', () => {
    expect(resolveAgentToolNames({ ...memfs }).sort()).toEqual([...DEFAULT_WEB_TOOLS].sort());
  });

  it('honors an explicit tools list (opts out of the un-listed default)', () => {
    expect(resolveAgentToolNames({ ...memfs, tools: ['web_search'] })).toEqual(['web_search']);
  });

  it('honors an explicit empty list as a full opt-out', () => {
    expect(resolveAgentToolNames({ ...memfs, tools: [] })).toEqual([]);
  });
});

describe('missingWebTools', () => {
  it('reports the absent web-research tools', () => {
    expect(missingWebTools(['web_search'])).toEqual(['fetch_webpage']);
    expect(missingWebTools(['web_search', 'fetch_webpage'])).toEqual([]);
    expect(missingWebTools([]).sort()).toEqual([...DEFAULT_WEB_TOOLS].sort());
  });
});

describe('isSelfHostedLetta', () => {
  it('treats letta.com and subdomains as cloud, everything else as self-hosted', () => {
    expect(isSelfHostedLetta('https://api.letta.com')).toBe(false);
    expect(isSelfHostedLetta('https://letta.com')).toBe(false);
    expect(isSelfHostedLetta('http://localhost:8283')).toBe(true);
    expect(isSelfHostedLetta('https://letta.example.com')).toBe(true);
    expect(isSelfHostedLetta(undefined)).toBe(true);
  });
});
