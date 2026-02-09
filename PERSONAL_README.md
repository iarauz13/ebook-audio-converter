# Audiobooks Converter

Convert your EPUB ebooks into high-quality Audiobooks (MP3) using AI voices (Microsoft Edge TTS).

## Setup

1.  Open your Terminal.
2.  Navigate to this directory:
    ```bash
    cd /Users/iarauz/.gemini/antigravity/scratch/Audiobooks
    ```
    *(Note: You can move this entire folder to Documents if you wish, just update the path)*
3.  Run the setup script (only needed once):
    ```bash
    bash setup.sh
    ```

## Usage

To convert a book, simply use the `run.sh` script:
```bash
./run.sh "My Book.epub"
```
*(Tip: Use quotes if the filename has spaces!)*

This will create `My Book.mp3` in the same directory.

### Options

**1. Split into Chapters (Album Mode)**  
Use the `--split` flag to create a folder with separate MP3 files for each chapter (great for skipping!).

```bash
./run.sh "My Book.epub" --split
```
*Result: A folder named `My Book_Audiobook` text containing `01_Chapter.mp3`, `02_Chapter.mp3`, etc.*

**2. Change Voice**  
You can specify a different voice using `--voice`.

```bash
./run.sh "My Book.epub" --voice en-US-AndrewNeural
```

**Common Voices**:
- `en-US-AvaNeural`: **Ava** (US Female) — *Soft, Professional*
- `en-US-AndrewNeural`: **Andrew** (US Male) — *Warm, Trustworthy*
- `en-US-EmmaNeural`: **Emma** (US Female) — *Cheerful, Clear*
- `en-US-BrianNeural`: **Brian** (US Male) — *Deep, Narrator-like*
- `en-US-JennyNeural`: **Jenny** (US Female) — *Natural, Conversational*
- `en-US-GuyNeural`: **Guy** (US Male) — *Casual, Radio-style*
- `en-US-AriaNeural`: **Aria** (US Female) — *Expressive, Bright*
- `en-GB-SoniaNeural`: **Sonia** (UK Female) — *Sophisticated, News-style (Best for Grandma)*
- `en-GB-RyanNeural`: **Ryan** (UK Male) — *Crisp, Authoritative*
- `en-US-RogerNeural`: **Roger** (US Male) — *Mature, Storyteller (Best for Grandpa)*
- `en-GB-ThomasNeural`: **Thomas** (UK Male) — *Classic, Formal (Old-school British)*

**Want to see all voices?**
Run this command to see every voice available (hundreds!):
```bash
./run.sh --list-voices
```

**3. List Chapters**  
EPUBs often have hidden introductions or appendices. Use this to see the correct chapter numbers (indices) before converting specific ones.  
```bash
./run.sh "My Book.epub" --list-chapters
```
*Result: A list of chapters with their Index, Length, and Title.*

## Real World Examples

**Example 1: British Voice**
```bash
./run.sh "Find Your Why.epub" --voice en-GB-SoniaNeural
```

**Example 2: British Voice + Split Chapters**
```bash
./run.sh "Find Your Why.epub" --voice en-GB-SoniaNeural --split
```

**Example 3: Convert Only One Chapter**
To convert only Chapter 5 (for example):
```bash
./run.sh "Find Your Why.epub" --chapter 5
```
*(Combined with other flags - separate ranges and voice)*:
```bash
./run.sh "Find Your Why.epub" --range 4-10 --voice en-US-BrianNeural --split
```

**Example 4: Convert to PDF**
Create a readable PDF version of the book (or just one chapter).
```bash
./run.sh "Find Your Why.epub" --pdf
```
*(Combined with other flags)*:
```bash
./run.sh "Find Your Why.epub" --chapter 5 --pdf
```

**Example 5: Convert a Range of Chapters (Single File)**
Convert Chapters 1 through 10 into one audio file.
```bash
./run.sh "Find Your Why.epub" --range 1-10
```

**Example 6: Convert a Range to Separate Files**
Convert Chapters 1 through 5, but save them as separate MP3 files (useful for testing just the start of a book).
```bash
./run.sh "Find Your Why.epub" --range 1-5 --split
```

**Example 7: Convert a Range to PDF**
Create a PDF containing only Chapters 3 through 7.
```bash
./run.sh "Find Your Why.epub" --range 3-7 --pdf
```

**Example 8: Mix & Match (Chapter + Voice)**
Convert only Chapter 1 using a British voice.
```bash
./run.sh "Find Your Why.epub" --chapter 1 --voice en-GB-SoniaNeural
```

**Example 9: Mix & Match (Manual Mode / No TOC)**
If your book doesn't have a TOC or you suspect it's wrong, force the scanner to guess hints from the text headers:
```bash
./run.sh "Find Your Why.epub" --no-toc --split
```

## Troubleshooting

- **"Command not found"**: Ensure you are using `./run.sh` with the `./` prefix.
- **Python errors**: Try running `bash setup.sh` again to fix dependencies.

## FAQ & Common Scenarios

**Q: Why does it ask "Is this correct?" before starting?**
A: This is a safety check. Ebooks often have hidden "chapters" like the Introduction, Copyright, or Foreword. This means "Chapter 1" might actually be Index #5. The app lists them for you so you can confirm you are converting the right content. If it's wrong, you can just type the new range (e.g. `5-10`) right there!

**Q: It stuck at 29% for a long time. What do I do?**
A: **Don't panic.** It's likely a network hiccup.
1.  Press `Ctrl + C` to stop it.
2.  Press `Up Arrow` and `Enter` to run the command again.
3.  **It will auto-resume.** It remembers what chapters it finished and will skip them, picking up exactly where it left off.

**Q: What does "Confidence: Low" mean?**
A: It means the converter couldn't find a proper Table of Contents. It fell back to reading the file list directly (Spine). This works for simple books but might include weird fragments. Use header detection (`--no-toc`) if the result is bad.

**Q: Why does it say [SHORT] next to a chapter?**
A: That chapter has less than 500 characters. It's usually a dedicate page, a quote, or a blank page. You probably want to skip it when converting specific ranges.

**Q: It's taking too long! Can I stop it?**
A: **Yes.** Press `Ctrl + C` in your Terminal to stop the process immediately.

**Q: What happens if I stop it halfway?**
- **Single File Mode:** You will likely end up with a corrupt or 0-byte file. You should delete it and try again.
- **Split/Album Mode:** Any chapters that fully finished (e.g., Chapter 1, 2, 3) will be safe in the folder. The chapter that was currently being converted when you stopped it will be incomplete.

**Q: Can I close the Terminal while it runs?**
A: **No.** If you close the window, the conversion stops. You must leave the window open (but you can minimize it).

**Q: Does it use my internet?**
A: **Yes.** The "Neural" voices are generated in the cloud. It uses a small amount of data (like streaming a song), so you need an active internet connection.

**Q: Where is my audiobook?**
A: It is saved **in the same folder** as the book you converted.
- **Single File:** Look for `BookName.mp3` right next to `BookName.epub`.
- **Split Mode:** Look for a new folder named `BookName_Audiobook`.
- **Easy way to find it:** Type `open .` in your Terminal to open the current folder in Finder.

**Q: How do I get this on my iPhone immediately?**
A: Use the **`--cloud`** flag!
1.  Run the command with `--cloud` at the end:
    ```bash
    ./run.sh "My Book.epub" --cloud
    ```
2.  Open the **Files App** on your iPhone.
3.  Go to `iCloud Drive` -> `Audiobooks`.
4.  Your file will be there, ready to play!
