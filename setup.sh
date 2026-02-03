#!/bin/bash
# Setup script for Audiobooks project

echo "Setting up environment..."
python3 -m venv venv
source venv/bin/activate

echo "Installing dependencies..."
# pip install epub2tts # Original plan, but requires python 3.11
pip install edge-tts EbookLib beautifulsoup4 xhtml2pdf

echo "Setup complete! Run 'source venv/bin/activate' to use."
