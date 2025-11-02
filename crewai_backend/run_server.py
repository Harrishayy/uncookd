#!/usr/bin/env python3
"""
Server startup script that ensures correct directory context
Run this from anywhere - it will change to the correct directory first
"""
import os
import sys

# Get the directory where this script is located
script_dir = os.path.dirname(os.path.abspath(__file__))

# Change to backend directory
os.chdir(script_dir)
print(f"Starting server from: {os.getcwd()}")

# Add current directory to path
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

# Now import and run
from agents.agent import app
import uvicorn

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

