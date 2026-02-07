# Bug: SDK strips `tags` from agent list/retrieve responses

## Description

The `@letta-ai/letta-client` Node.js SDK strips the `tags` field from agent responses. The REST API correctly returns tags on both `GET /v1/agents/` and `GET /v1/agents/{id}/`, but the SDK's deserialized `AgentState` objects always have `tags: []` regardless of actual tag values.

## Steps to Reproduce

1. Create an agent with tags via the SDK (this works correctly):
```typescript
import Letta from '@letta-ai/letta-client';

const client = new Letta({ baseUrl: 'http://localhost:8283' });

await client.agents.create({
  name: 'test-agent',
  tags: ['tenant:acme', 'role:support'],
  llm_config: { model: 'openai/gpt-4o', context_window: 128000 },
});
```

2. List agents with tag filter (filter works, but tags are empty in response):
```typescript
const result = await client.agents.list({ tags: ['tenant:acme'] });
for (const agent of result.items) {
  console.log(agent.name, agent.tags);
  // Output: "test-agent []"    <-- should be ["tenant:acme", "role:support"]
}
```

3. Retrieve a single agent (same issue):
```typescript
const agent = await client.agents.retrieve(agentId);
console.log(agent.tags);
// Output: []    <-- should be ["tenant:acme", "role:support"]
```

## Expected Behavior

`agent.tags` should return `["tenant:acme", "role:support"]` — matching the raw API response.

## Actual Behavior

`agent.tags` always returns `[]` (empty array), despite the REST API returning the correct tags.

## Verification

The REST API returns tags correctly:
```bash
# List endpoint
curl -s http://localhost:8283/v1/agents/ | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    if a['tags']: print(a['name'], a['tags'])
"
# Output: test-agent ['tenant:acme', 'role:support']

# Retrieve endpoint
curl -s http://localhost:8283/v1/agents/{agent_id}/ | python3 -c "
import sys, json; print(json.load(sys.stdin)['tags'])
"
# Output: ['tenant:acme', 'role:support']
```

## Impact

This blocks any SDK consumer from reading agent tags after creation. Tags can be written (create/update) and used for filtering (list with `tags` param works), but they cannot be read back from the response objects.

We're currently working around this by making a parallel raw HTTP fetch and patching tags onto the SDK response objects.

## Environment

- `@letta-ai/letta-client`: ^1.7.1
- Letta server: self-hosted (latest)
- Node.js: v22
- Platform: Linux

## Likely Cause

The SDK's `AgentState` type definition or response deserializer is not mapping the `tags` field from the raw JSON response. The field exists on the type (since `agent.tags` returns `[]` rather than `undefined`), but it defaults to an empty array instead of reading from the response payload.
