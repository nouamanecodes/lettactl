#!/bin/bash

# Run a single e2e test by name
# Usage: ./run-single.sh 25-immutable-block

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <test-name>"
    echo ""
    echo "Available tests:"
    ls -1 "$(dirname "$0")/tests/" | sed 's/\.sh$//'
    exit 1
fi

TEST_NAME="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_FILE="$SCRIPT_DIR/tests/${TEST_NAME}.sh"

if [ ! -f "$TEST_FILE" ]; then
    echo "Test not found: $TEST_NAME"
    echo ""
    echo "Available tests:"
    ls -1 "$SCRIPT_DIR/tests/" | sed 's/\.sh$//'
    exit 1
fi

exec "$TEST_FILE"
