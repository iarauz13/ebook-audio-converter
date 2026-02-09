# Audiobooks Converter

Convert your EPUB ebooks into high-quality Audiobooks (MP3) using AI voices (Microsoft Edge TTS).

## Features
- **High Quality Voices**: Uses Microsoft Edge's Neural TTS voices.
- **Chapter Splitting**: Option to split the audiobook into separate MP3 files per chapter.
- **Smart Parsing**: Automatically detects Table of Contents (TOC) for accurate chapter breaks.
- **PDF Support**: Convert EPUBs or specific chapters to PDF.
- **Metadata Injection**: Adds correct Author, Title, and Cover Art to the MP3 files.
- **Safety Check**: Interactively confirms chapter selection.
- **Auto-Resume**: Saves progress; simply restart to continue if interrupted.
- **Cloud Sync**: Can save directly to iCloud Drive for instant access on your iPhone.

## Requirements

- Python 3
- `pip`
- Internet connection (for TTS generation)

## Installation

1.  Clone this repository or download the files.
2.  Run the setup script to install dependencies:
    ```bash
    bash setup.sh
    ```
    *This creates a virtual environment and installs necessary packages.*

## Usage

1.  Activate the virtual environment:
    ```bash
    source venv/bin/activate
    ```

2.  Run the converter:
    ```bash
    ./run.sh "My Book.epub"
    ```
    *or*
    ```bash
    ./run.sh "My Book.pdf"
    ```

### Common Options

- **Split into chapters**:
  ```bash
  ./run.sh "My Book.epub" --split
  ```

- **Change Voice**:
  ```bash
  ./run.sh "My Book.epub" --voice en-GB-SoniaNeural
  ```

- **List Available Voices**:
  ```bash
  ./run.sh --list-voices
  ```

- **List Chapters**:
  ```bash
  ./run.sh "My Book.epub" --list-chapters
  ```

- **Convert specific Range**:
  ```bash
  ./run.sh "My Book.epub" --range 1-5
  ```

- **Convert to PDF**:
  ```bash
  ./run.sh "My Book.epub" --pdf
  ```
