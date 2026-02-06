import asyncio
import argparse
import os
import sys
import time
from tqdm import tqdm
from ebooklib import epub

from src.extractors import extract_chapters_using_toc, extract_text_fallback, extract_text_from_pdf
from src.generators import text_to_speech, text_to_pdf, generate_cover_image, inject_id3_tags
from src.utils import load_progress, save_progress
from src.voices import get_recommended_voices

async def main():
    parser = argparse.ArgumentParser(description="Convert EPUB to Audiobook (MP3) or PDF")
    parser.add_argument("epub_file", help="Path to the .epub file (or use --list-voices)", nargs='?')
    parser.add_argument("--voice", default="en-US-AvaNeural", help="Voice to use (default: en-US-AvaNeural)")
    parser.add_argument("--output", help="Output filename (optional)")
    parser.add_argument("--split", action="store_true", help="Split into separate chapter files")
    parser.add_argument("--list-voices", action="store_true", help="List all available voices (system)")
    parser.add_argument("--list-recommended", action="store_true", help="List curated recommended voices")
    parser.add_argument("--list-chapters", action="store_true", help="List detected chapters in the EPUB")
    parser.add_argument("--no-toc", action="store_true", help="Ignore TOC and use file scan (for testing/fallback)")
    parser.add_argument("--chapter", type=int, help="Convert only this specific chapter number (1-based)")
    parser.add_argument("--range", help="Convert a range of chapters (e.g. '1-10')")
    parser.add_argument("--preview", action="store_true", help="Generate a 10s preview of the book with the selected voice")
    parser.add_argument("--pdf", action="store_true", help="Convert to PDF instead of Audio")
    parser.add_argument("--author", help="Override Author Name (for ID3 tags)", default="Unknown Author")
    parser.add_argument("--title", help="Override Book Title (for ID3 tags)", default=None)
    parser.add_argument("--rate", help="Playback speed (e.g. '+20%%', '-10%%')", default=None)
    parser.add_argument("--cloud", action="store_true", help="Save directly to iCloud Drive (Audiobooks folder)")
    parser.add_argument("--dest", help="Custom destination directory")

    
    args = parser.parse_args()

    if args.list_recommended:
        print("--- Recommended Voices ---")
        voices = get_recommended_voices()
        for name, vid in voices.items():
            print(f"- {name}: {vid}")
        print("\nUse with: --voice <ID>")
        sys.exit(0)

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
    # Try TOC extraction first (unless disabled)
    toc_results = None
    
    # 1. PDF Handling
    if args.epub_file.lower().endswith('.pdf'):
        chapters, metadata = extract_text_from_pdf(args.epub_file)
        book_title = args.title if args.title else os.path.basename(args.epub_file).replace('.pdf', '')
        author = args.author
    
    # 2. EPUB Handling
    else:
        # Load EPUB
        try:
            book = epub.read_epub(args.epub_file)
            book_title = book.get_metadata('DC', 'title')[0][0] if book.get_metadata('DC', 'title') else "Unknown Title"
            author = book.get_metadata('DC', 'creator')[0][0] if book.get_metadata('DC', 'creator') else args.author
            
            # Override if provided
            if args.title: book_title = args.title
            if args.author and args.author != "Unknown Author": author = args.author
            
        except Exception as e:
            print(f"Error reading EPUB: {e}")
            sys.exit(1)

        if not args.no_toc:
            toc_results = extract_chapters_using_toc(book)
        
        if toc_results and toc_results[0]: # Check if chapters were found
            chapters, metadata = toc_results
        else:
            # Fallback
            chapters, metadata = extract_text_fallback(book)

    print(f"\n--- Extraction Info ---")
    print(f"Method:     {metadata['method']}")
    print(f"Confidence: {metadata['confidence']}")
    if metadata['warnings']:
        for w in metadata['warnings']:
            print(f"Warning:    {w}")
    print(f"Found:      {len(chapters)} chapters")
    print(f"-----------------------\n")

    if not chapters:
        print("No text found in EPUB.")
        sys.exit(1)

    if args.list_chapters:
        print(f"--- Chapters in {os.path.basename(args.epub_file)} ---")
        for i, ch in enumerate(chapters):
            title = ch['title']
            length = len(ch['text'])
            
            # Warn if short
            warnings_str = ""
            if length < 500:
                warnings_str += " [SHORT]"
            if ch.get('warnings'):
                warnings_str += f" [{', '.join(ch['warnings'])}]"
                
            print(f"{i+1:3d}. [{length:6d} chars] {title}{warnings_str}")
        sys.exit(0)

    # Determine which chapters to process
    selected_chapters = []
    start_index = 0
    
    # Filter for specific chapter
    if args.chapter:
        if 1 <= args.chapter <= len(chapters):
            print(f"Selecting ONLY Chapter {args.chapter}: {chapters[args.chapter - 1]['title']}")
            selected_chapters = [chapters[args.chapter - 1]]
            start_index = args.chapter # For naming
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
                
            print(f"Selecting range: {start} to {end}...")
            selected_chapters = chapters[start-1:end]
            start_index = start
            
        except ValueError as e:
            print(f"Error: Invalid range format '{args.range}'. Use format 'start-end' (e.g. '1-10').")
            print(f"Details: {e}")
            sys.exit(1)
            
    else:
        selected_chapters = chapters
        start_index = 1

    # Determine Base Output Directory
    if args.cloud:
        output_base = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/Audiobooks")
        print(f"Cloud Mode: Saving to iCloud Drive ({output_base})")
    elif args.dest:
        output_base = args.dest
        print(f"Destination: {output_base}")
    else:
        output_base = "."

    if not os.path.exists(output_base):
        try:
            os.makedirs(output_base)
        except OSError as e:
            print(f"Error creating destination directory {output_base}: {e}")
            sys.exit(1)

    # PREVIEW MODE
    if args.preview:
        print(f"--- Generating Preview (Voice: {args.voice}) ---")
        # Get first chunk of text from first selected chapter
        preview_text = selected_chapters[0]['text'][:500] + "..."
        
        preview_filename = f"preview_{args.voice}.mp3"
        output_path = os.path.join(output_base, preview_filename)
        
        print(f"Text snippet: {preview_text[:100].replace(chr(10), ' ')}...")
        
        try:
             await text_to_speech(preview_text, output_path, args.voice, args.rate)
             msg = f"Preview saved to: {output_path}"
             if args.cloud:
                 msg += " (Check your Files app!)"
             print(msg)
        except Exception as e:
            print(f"Error generating preview: {e}")
        sys.exit(0)

    # Calculate statistics
    total_chars = sum(len(c['text']) for c in selected_chapters)

    if args.pdf:
        # PDF Stats
        print(f"--- Statistics (PDF Mode) ---")
        if args.chapter or args.range:
            print(f"Mode:             Selected Content")
        print(f"Total Text:       {total_chars:,} characters")
        print(f"Est. Wait Time:   Very fast (seconds)")
        print(f"------------------")
    else:
        # Audio Stats
        est_audio_seconds = total_chars / 15
        est_audio_min = est_audio_seconds / 60
        est_audio_hours = est_audio_min / 60
        est_proc_seconds = est_audio_seconds / 20 
        
        est_proc_seconds = est_audio_seconds / 20 
        
        print(f"--- Statistics (Audio Mode) ---")
        if args.chapter or args.range:
             print(f"Mode:             Selected Content")
        print(f"Total Text:       {total_chars:,} characters")
        print(f"Est. Audio Length: {int(est_audio_hours)}h {int(est_audio_min % 60)}m")
        print(f"Est. Wait Time:    ~{int(est_proc_seconds // 60)}m {int(est_proc_seconds % 60)}s")
        if args.rate:
             print(f"Playback Rate:    {args.rate}")
        print(f"------------------")

    if args.split:
        suffix = "_PDFs" if args.pdf else "_Audiobook"
        base_name = os.path.splitext(os.path.basename(args.epub_file))[0]
        output_folder_name = f"{base_name}{suffix}"
        output_dir = os.path.join(output_base, output_folder_name)
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        # Generate Cover Art once
        cover_bytes = generate_cover_image(book_title, author)
        
        print(f"Splitting into separate files in folder: {output_dir}/")
        
        # Load previous progress
        progress_data = load_progress(output_dir)
        
        # Use tqdm for progress bar
        pbar = tqdm(selected_chapters, unit="chap")
        for i, ch in enumerate(pbar):
            pbar.set_description(f"Processing Ch {start_index+i}")
            chapter_num = start_index + i
            
            # CHECK PROGRESS
            if str(chapter_num) in progress_data and os.path.exists(os.path.join(output_dir, f"{chapter_num:02d}_" + "".join(c for c in ch['title'] if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')[:30] + (".pdf" if args.pdf else ".mp3"))):
                 # Weak check: filename logic here is duplicated, but if ID exists and file ostensibly exists (logic below), we skip
                 # Simpler: just check json key
                 # print(f"  Skipping Chapter {chapter_num} (already done).") # Quiet for tqdm
                 continue
            
            # Clean title for filename
            clean_title = "".join(c for c in ch['title'] if c.isalnum() or c in (' ', '_', '-')).strip()
            clean_title = clean_title.replace(' ', '_')[:30] # Truncate long titles
            
            ext = ".pdf" if args.pdf else ".mp3"
            filename = f"{chapter_num:02d}_{clean_title}{ext}"
            filepath = os.path.join(output_dir, filename)
            
            # Double check file existence if JSON missed it
            if os.path.exists(filepath):
                 # print(f"  Skipping {filename} (File exists).")
                 save_progress(output_dir, chapter_num, ch['title'])
                 continue
            
            # print(f"  Converting {chapter_num}. {ch['title']} -> {filename}...")
            
            # RETRY LOGIC
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    if args.pdf:
                        text_to_pdf(ch['text'], ch['title'], filepath)
                    else:
                        await text_to_speech(ch['text'], filepath, args.voice, args.rate)
                        inject_id3_tags(filepath, ch['title'], author, book_title, i+1, len(selected_chapters), cover_bytes)
                    
                    # Success
                    save_progress(output_dir, chapter_num, ch['title'])
                    break # Exit retry loop
                    
                except Exception as e:
                    # print(f"    Error (Attempt {attempt+1}/{max_retries}): {e}")
                    if attempt < max_retries - 1:
                        time.sleep(2) # Wait a bit before retry
                    # else:
                        # print(f"    Failed to convert Chapter {chapter_num}.")
        
        print(f"Done! All saved in {output_dir}/")

    else:
        # Standard Single File Mode
        full_text = "\n\n".join([c['text'] for c in selected_chapters])
        
        base = os.path.splitext(os.path.basename(args.epub_file))[0]
        output_filename = args.output
        if not output_filename:
            if args.chapter:
                suffix = f"_Chapter{args.chapter}"
            elif args.range:
                suffix = f"_Chapters_{args.range}"
            else:
                suffix = ""
            
            ext = ".pdf" if args.pdf else ".mp3"
            output_filename = f"{base}{suffix}{ext}"
        
        output_path = os.path.join(output_base, output_filename)

        msg_mode = "PDF" if args.pdf else f"audio (using {args.voice})"
        print(f"Converting to {msg_mode}...")
        try:
            if args.pdf:
                text_to_pdf(full_text, f"{base} - Selected Chapters", output_path)
            else:
                await text_to_speech(full_text, output_path, args.voice, args.rate)
                # For single file, tracks are 1/1
                cover_bytes = generate_cover_image(book_title, author)
                inject_id3_tags(output_path, book_title, author, book_title, 1, 1, cover_bytes)
                
            print(f"Done! Saved to {output_path}")
        except Exception as e:
            print(f"Error during conversion: {e}")

if __name__ == "__main__":
    asyncio.run(main())
