#!/bin/bash
# Start script for the backend server
# Ensures we run from the correct directory

cd "$(dirname "$0")"
echo "Starting server from: $(pwd)"
source .venv/bin/activate 2>/dev/null || echo "Virtual environment not found, using system Python"
python agents/agent.py


