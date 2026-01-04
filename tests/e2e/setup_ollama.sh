#!/bin/bash
# Setup Ollama provider in Letta for e2e testing

set -e

LETTA_URL="${LETTA_BASE_URL:-http://localhost:8283}"
OLLAMA_URL="${OLLAMA_BASE_URL:-http://ollama:11434}"

echo "Setting up Ollama provider in Letta..."

# Check if ollama provider already exists
EXISTING=$(curl -s "$LETTA_URL/v1/providers/" | grep -o '"name":"ollama"' || true)

if [ -n "$EXISTING" ]; then
    echo "Ollama provider already configured"
    exit 0
fi

# Create ollama provider
RESPONSE=$(curl -s -X POST "$LETTA_URL/v1/providers/" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"ollama-local\",
        \"provider_type\": \"ollama\",
        \"api_key\": \"ollama\",
        \"base_url\": \"$OLLAMA_URL\"
    }")

if echo "$RESPONSE" | grep -q '"id"'; then
    echo "Ollama provider configured successfully"
    echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Provider ID: {d.get(\"id\")}')" 2>/dev/null || true
else
    echo "Failed to configure Ollama provider:"
    echo "$RESPONSE"
    exit 1
fi

# Verify the model is available
echo "Checking available models..."
curl -s "$LETTA_URL/v1/models/" | python3 -c "
import sys, json
models = json.load(sys.stdin)
ollama_models = [m for m in models if 'ollama' in m.get('name', '').lower() or 'smollm' in m.get('name', '').lower()]
if ollama_models:
    print(f'Found {len(ollama_models)} Ollama model(s):')
    for m in ollama_models[:5]:
        print(f'  - {m.get(\"name\")}')
else:
    print('No Ollama models found yet (model may need to be pulled)')
" 2>/dev/null || echo "Could not list models"

echo "Ollama setup complete!"
