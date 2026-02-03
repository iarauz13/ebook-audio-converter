import asyncio
import argparse
import os
import sys
import warnings
from bs4 import BeautifulSoup
import ebooklib
from ebooklib import epub
import edge_tts
from xhtml2pdf import pisa

# Suppress annoying ebooklib warnings
warnings.filterwarnings("ignore", category=UserWarning, module='ebooklib')
warnings.filterwarnings("ignore", category=FutureWarning, module='ebooklib')

def sanitize_text(text):
    """Clean up text for better TTS."""
    if not text:
        return ""
    return text.strip()

def extract_text_from_epub(epub_path):
    """Extracts text from an EPUB file, returning a list of strings (chapters)."""
    try:
        book = epub.read_epub(epub_path)
    except Exception as e:
        print(f"Error reading EPUB: {e}")
        sys.exit(1)

    chapters = []
    
    # Iterate through the items in the spine (reading order)
    # Better spine iteration
    for item_id, linear in book.spine: 
        item = book.get_item_with_id(item_id)
        if item:
            soup = BeautifulSoup(item.get_content(), 'html.parser')
            # For PDF, we might want the HTML? But for simplicity keeping text pipeline
            # Wait, xhtml2pdf needs HTML usually.
            # But the current extract function strips tags.
            # Let's just wrap the text in a simple HTML container for PDF consistency.
            text = soup.get_text(separator=' ')
            cleaned = sanitize_text(text)
            if len(cleaned) > 50: # Skip empty/tiny "chapters" (like covers sometimes)
                chapters.append(cleaned)
    
    return chapters

async def text_to_speech(text, output_file, voice):
    """Generates audio for the given text."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)

def text_to_pdf(text, output_file):
    """Generates PDF for the given text."""
    # Wrap text in minimal HTML for xhtml2pdf
    html_content = f"""
    <html>
    <body>
    <p style="font-size: 12pt; line-height: 1.5; font-family: Helvetica, sans-serif;">
    {text.replace(chr(10), '<br/>')}
    </p>
    </body>
    </html>
    """
    
    with open(output_file, "wb") as pdf_file:
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_file)
    
    if pisa_status.err:
        print(f"Error generating PDF: {pisa_status.err}")

async def main():
    parser = argparse.ArgumentParser(description="Convert EPUB to Audiobook (MP3) or PDF")
    parser.add_argument("epub_file", help="Path to the .epub file (or use --list-voices)", nargs='?')
    parser.add_argument("--voice", default="en-US-AvaNeural", help="Voice to use (default: en-US-AvaNeural)")
    parser.add_argument("--output", help="Output filename (optional)")
    parser.add_argument("--split", action="store_true", help="Split into separate chapter files")
    parser.add_argument("--list-voices", action="store_true", help="List available voices")
    parser.add_argument("--chapter", type=int, help="Convert only this specific chapter number (1-based)")
    parser.add_argument("--range", help="Convert a range of chapters (e.g. '1-10')")
    parser.add_argument("--pdf", action="store_true", help="Convert to PDF instead of Audio")
    
    args = parser.parse_args()

    if args.list_voices:
        print("Fetching available voices...")
        os.system("edge-tts --list-voices")
        sys.exit(0)
    
    if not args.epub_file:
        parser.print_help()
        sys.exit(1)
    
    if not os.path.exists(args.epub_file):
        print(f"File not found: {args.epub_file}")
        sys.exit(1)

    print(f"Reading {args.epub_file}...")
    chapters = extract_text_from_epub(args.epub_file)
    print(f"Found {len(chapters)} chunks/chapters.")

    if not chapters:
        print("No text found in EPUB.")
        sys.exit(1)

    # Determine which chapters to process
    start_offset = 1
    
    # Filter for specific chapter
    if args.chapter:
        if 1 <= args.chapter <= len(chapters):
            print(f"selecting ONLY Chapter {args.chapter}...")
            target_chapter = chapters[args.chapter - 1]
            chapters = [target_chapter]
            start_offset = args.chapter
        else:
            print(f"Error: Chapter {args.chapter} invalid. This book has {len(chapters)} chapters.")
            sys.exit(1)
            
    # Filter for range
    elif args.range:
        try:
            start_s, end_s = args.range.split('-')
            start = int(start_s)
            end = int(end_s)
            
            if start < 1 or end > len(chapters) or start > end:
                raise ValueError("Invalid range bounds")
                
            print(f"Selecting range: Chapters {start} to {end}...")
            chapters = chapters[start-1:end]
            start_offset = start
            
        except ValueError as e:
            print(f"Error: Invalid range format '{args.range}'. Use format 'start-end' (e.g. '1-10').")
            print(f"Details: {e}")
            sys.exit(1)

    # Calculate statistics
    total_chars = sum(len(c) for c in chapters)
    
    if args.pdf:
        # PDF Stats
        print(f"--- Statistics (PDF Mode) ---")
        if args.chapter:
            print(f"Mode:             Single Chapter ({args.chapter})")
        elif args.range:
            print(f"Mode:             Range ({args.range})")
        print(f"Total Text:       {total_chars:,} characters")
        print(f"Est. Wait Time:   Very fast (seconds)")
        print(f"------------------")
    else:
        # Audio Stats
        est_audio_seconds = total_chars / 15
        est_audio_min = est_audio_seconds / 60
        est_audio_hours = est_audio_min / 60
        est_proc_seconds = est_audio_seconds / 20 
        
        print(f"--- Statistics (Audio Mode) ---")
        if args.chapter:
            print(f"Mode:             Single Chapter ({args.chapter})")
        elif args.range:
            print(f"Mode:             Range ({args.range})")
        print(f"Total Text:       {total_chars:,} characters")
        print(f"Est. Audio Length: {int(est_audio_hours)}h {int(est_audio_min % 60)}m")
        print(f"Est. Wait Time:    ~{int(est_proc_seconds // 60)}m {int(est_proc_seconds % 60)}s")
        print(f"------------------")

    if args.split:
        suffix = "_PDFs" if args.pdf else "_Audiobook"
        base_name = os.path.splitext(os.path.basename(args.epub_file))[0]
        output_dir = f"{base_name}{suffix}"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        print(f"Splitting into separate files in folder: {output_dir}/")
        
        for i, text in enumerate(chapters):
            chapter_num = start_offset + i
            
            ext = ".pdf" if args.pdf else ".mp3"
            filename = f"{chapter_num:02d}_Chapter{ext}"
            filepath = os.path.join(output_dir, filename)
            
            print(f"  Converting Chapter {chapter_num} -> {filename}...")
            try:
                if args.pdf:
                    text_to_pdf(text, filepath)
                else:
                    await text_to_speech(text, filepath, args.voice)
            except Exception as e:
                print(f"  Error converting chapter {chapter_num}: {e}")
        
        print(f"Done! All saved in {output_dir}/")

    else:
        # Standard Single File Mode
        full_text = "\n\n".join(chapters)
        
        output_filename = args.output
        if not output_filename:
            base = os.path.splitext(os.path.basename(args.epub_file))[0]
            if args.chapter:
                suffix = f"_Chapter{args.chapter}"
            elif args.range:
                suffix = f"_Chapters_{start}-{end}"
            else:
                suffix = ""
            
            ext = ".pdf" if args.pdf else ".mp3"
            output_filename = f"{base}{suffix}{ext}"
        
        msg_mode = "PDF" if args.pdf else f"audio (using {args.voice})"
        print(f"Converting to {msg_mode}...")
        try:
            if args.pdf:
                text_to_pdf(full_text, output_filename)
            else:
                await text_to_speech(full_text, output_filename, args.voice)
            print(f"Done! Saved to {output_filename}")
        except Exception as e:
            print(f"Error during conversion: {e}")

if __name__ == "__main__":
    asyncio.run(main())
