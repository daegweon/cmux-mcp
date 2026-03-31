#!/bin/bash
# cmux-mcp plugin setup

echo "Checking cmux-mcp prerequisites..."

# Check macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: cmux-mcp requires macOS. Current OS: $(uname)"
  exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is required. Install from https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
  echo "ERROR: Node.js 18+ required. Current: $(node -v)"
  exit 1
fi

# Check cmux
if ! command -v cmux &> /dev/null; then
  echo "WARNING: cmux not found. Install from https://github.com/manaflow-ai/cmux"
  echo "The MCP server will be installed but won't work until cmux is available."
fi

echo "cmux-mcp plugin ready!"
