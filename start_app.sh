#!/bin/bash
# Starts the Web Interface
cd "$(dirname "$0")"
source venv/bin/activate
echo "Starting Web Interface..."
echo "Open your browser to: http://127.0.0.1:5000"
python3 app.py
