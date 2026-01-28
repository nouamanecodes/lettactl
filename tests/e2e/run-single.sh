#!/bin/bash

# Run a single e2e test by name
# Usage: ./run-single.sh 25-immutable-block
# Supports both .sh (CLI) and .js (SDK) tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$1" ]; then
    echo "Usage: $0 <test-name>"
    echo ""
    echo "Available tests:"
    ls -1 "$SCRIPT_DIR/tests/" | sed -e 's/\.sh$//' -e 's/\.js$//'
    exit 1
fi

TEST_NAME="$1"

# Try .sh first, then .js
if [ -f "$SCRIPT_DIR/tests/${TEST_NAME}.sh" ]; then
    exec "$SCRIPT_DIR/tests/${TEST_NAME}.sh"
elif [ -f "$SCRIPT_DIR/tests/${TEST_NAME}.js" ]; then
    exec node "$SCRIPT_DIR/tests/${TEST_NAME}.js"
else
    echo "Test not found: $TEST_NAME"
    echo ""
    echo "Available tests:"
    ls -1 "$SCRIPT_DIR/tests/" | sed -e 's/\.sh$//' -e 's/\.js$//'
    exit 1
fi
