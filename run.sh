#!/bin/bash
# Wrapper to run the converter using the venv
source "$(dirname "$0")/venv/bin/activate"
python3 -m src.main "$@"
