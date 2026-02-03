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

import re
import unicodedata

def clean_html_content(soup):
    """
    Clean up HTML content for better TTS.
    Removes technical tags, page numbers, and excessive whitespace.
    """
    if not soup:
        return ""

    # 1. Remove invisible/technical tags
    for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'meta', 'link']):
        tag.decompose()
        
    # 2. Remove page numbers (by class/role)
    for tag in soup.find_all(attrs={"role": "doc-pagebreak"}):
        tag.decompose()
    for tag in soup.find_all(class_="page-number"):
        tag.decompose()
        
    # 3. Get text
    text = soup.get_text(separator='\n')
    
    # 3.5 Normalize Unicode and Spaces
    # Replace non-breaking spaces with normal spaces
    text = text.replace('\xa0', ' ')
    # Normalize unicode characters (e.g. composed accents)
    text = unicodedata.normalize('NFKC', text)
    
    # 4. Remove standalone page numbers via Regex
    # Matches lines that are just numbers, potentially surrounded by whitespace
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    
    # 5. Remove "Page X" patterns if standalone
    text = re.sub(r'^\s*Page\s*\d+\s*$', '', text, flags=re.MULTILINE | re.IGNORECASE)

    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()

def get_html_slice(soup, start_id=None, end_id=None):
    """
    Extracts a subset of the soup based on start_id (inclusive) and end_id (exclusive).
    Returns a new BeautifulSoup object or Tag containing the sliced content.
    """
    if not start_id and not end_id:
        return soup
    
    content_tags = []
    
    root = soup.body if soup.body else soup
    
    start_el = root.find(id=start_id) if start_id else None
    
    # If start_id is specified but not found, warn and fallback
    if start_id and not start_el:
        print(f"  Warning: Start anchor #{start_id} not found in this file.")
        return soup 

    if start_id:
        # Start collection from start_el
        current = start_el
        while current:
            # Check for end boundary (exclusive)
            if end_id and (current.get('id') == end_id):
                break
                
            content_tags.append(current)
            current = current.find_next_sibling()
            
    else:
        # Start from beginning of body siblings
        # Using find_all(recursive=False) to get direct children seems safer than next_sibling loop from None
        for child in root.find_all(recursive=False):
             if end_id and child.get('id') == end_id:
                 break
             content_tags.append(child)

    # Reconstruct soup
    new_soup = BeautifulSoup("<div></div>", 'html.parser')
    for tag in content_tags:
        new_soup.div.append(tag)
        
    return new_soup

def get_spine_index(book, item):
    """Find the index of an item in the spine."""
    if not item:
        return -1
    for i, (spine_id, _) in enumerate(book.spine):
        if spine_id == item.get_id():
            return i
    return -1

def flatten_toc(toc):
    """Flattens the table of contents into a simple list of Links."""
    flat_toc = []
    for item in toc:
        if isinstance(item, epub.Link):
            flat_toc.append(item)
        elif isinstance(item, tuple) or isinstance(item, list):
            # Section tuple (Title, [Children])
            if isinstance(item[0], epub.Link):
                 flat_toc.append(item[0]) # Add the section title itself
            for child in item[1]:
                if isinstance(child, epub.Link):
                    flat_toc.append(child)
                # Note: This simple recursion handles 1 level of nesting as per common EPUBs.
                # A full recursion might be needed for very deep trees, but ebooklib
                # usually gives tuples for sections.
    return flat_toc

def extract_chapters_using_toc(book):
    """
    Extracts chapters based on the Table of Contents.
    Returns a list of dicts: {'title': str, 'text': str, 'spine_indices': list}
    """
    flat_toc = flatten_toc(book.toc)
    if not flat_toc:
        return None

    extracted_chapters = []
    
    for i, link in enumerate(flat_toc):
        chapter_title = link.title
        
        # Parse Href for Anchor
        if '#' in link.href:
            href_base, start_anchor = link.href.split('#', 1)
        else:
            href_base, start_anchor = link.href, None
            
        start_item = book.get_item_with_href(href_base)
        if not start_item:
            continue
            
        start_idx = get_spine_index(book, start_item)
        if start_idx == -1:
            continue
            
        # Determine end index and end anchor
        end_idx = len(book.spine)
        end_anchor = None
        
        if i + 1 < len(flat_toc):
            next_link = flat_toc[i+1]
            if '#' in next_link.href:
                next_href_base, next_anchor = next_link.href.split('#', 1)
            else:
                next_href_base, next_anchor = next_link.href, None
                
            next_item = book.get_item_with_href(next_href_base)
            if next_item:
                next_in_spine = get_spine_index(book, next_item)
                if next_in_spine != -1 and next_in_spine >= start_idx:
                     end_idx = next_in_spine
                     # If the next chapter starts in the SAME file, we have an end anchor for the current chapter
                     if next_in_spine == start_idx:
                         end_anchor = next_anchor
                     # If next chapter is in the next file (or later), end_idx is exclusive, so we stop before it.
                     # But wait, if next_in_spine > start_idx, we take everything up to next_in_spine.
                     # The last file in the range (next_in_spine - 1) should be read fully unless...
                     # Actually, standard behavior: read [start_idx, end_idx).
                     # The only special case is if end_idx == start_idx (same file split).

        # Collect text
        full_text = []
        
        # Case 1: Single file slice (Start and End in same file)
        if start_idx == end_idx: # This implies logic above set end_idx = start_idx
             # Actually, range(start, end) is empty if equal. We need to handle this.
             pass 
        
        # Correct Loop Logic:
        # We iterate from start_idx to end_idx (exclusive)
        # BUT if start_idx == end_idx (same file), we must process it once.
        # So commonly we use range(start_idx, max(end_idx, start_idx + 1))?
        # If next chapter is same file, end_idx was set to start_idx.
        # So we want to process [start_idx] only.
        
        loop_end = end_idx
        if end_idx == start_idx:
            loop_end = start_idx + 1
            
        for curr_idx in range(start_idx, loop_end):
            item_id = book.spine[curr_idx][0]
            item = book.get_item_with_id(item_id)
            if item:
                soup = BeautifulSoup(item.get_content(), 'html.parser')
                
                # Apply Slicing Logic
                # 1. First File in range
                current_start = start_anchor if curr_idx == start_idx else None
                
                # 2. Last File in range (only if next chapter starts in this same file)
                # If we are processing `start_idx` and `end_anchor` is set, use it.
                # If we are processing a middle file, no anchors.
                current_end = None
                if curr_idx == start_idx and end_anchor:
                    current_end = end_anchor
                
                sliced_soup = get_html_slice(soup, current_start, current_end)
                text = clean_html_content(sliced_soup)
                full_text.append(text)
        
        combined_text = "\n\n".join(full_text)
        
        # Only add if it has meaningful content
        # Note: We even add short chapters now, but flag them? 
        # Actually, let's keep the filter but maybe logging invalid ones in metadata could be useful later.
        if len(combined_text) > 50:
            extracted_chapters.append({
                'title': chapter_title,
                'text': combined_text,
                'spine_start': start_idx,
                'spine_end': loop_end,
                'warnings': []
            })
            
    # Metadata Logic
    metadata = {
        'method': 'TOC',
        'confidence': 'High',
        'warnings': []
    }
    
    if not extracted_chapters:
         metadata['confidence'] = 'Low'
         metadata['warnings'].append("TOC found but produced no content.")
    
    return extracted_chapters, metadata

def find_heuristic_title(soup):
    """
    Attempts to guess the chapter title from HTML headers.
    Returns (title, found_keyword_match)
    """
    # 1. Look for explicit H1, H2, H3
    for tag in soup.find_all(['h1', 'h2', 'h3']):
        text = tag.get_text(" ", strip=True)
        if not text:
            continue
            
        text_lower = text.lower()
        
        # High confidence keywords
        if any(x in text_lower for x in ['chapter', 'part', 'prologue', 'epilogue', 'introduction', 'appendix']):
            return text, True
            
        # If it's a short-ish header at the start, it's likely the title
        if len(text) < 100:
             return text, False # Found a header, but no keyword match
             
    # 2. Look for class="chapter" or similar
    # (Checking parent divs might be too aggressive, sticking to headers for now)
    
    return None, False

def extract_text_fallback(book):
    """Legacy extraction: simply iterates spine but with heuristics."""
    chapters = []
    heuristic_hits = 0
    
    for i, (item_id, linear) in enumerate(book.spine):
        item = book.get_item_with_id(item_id)
        if item:
            soup = BeautifulSoup(item.get_content(), 'html.parser')
            
            # Heuristic Title Search (Before cleaning, as structure matters)
            h_title, strong_match = find_heuristic_title(soup)
            
            cleaned = clean_html_content(soup)
            if len(cleaned) > 50:
                final_title = h_title if h_title else f"Segment {i+1}"
                
                warnings = []
                if not h_title:
                    warnings.append('Generated Title')
                elif not strong_match:
                    warnings.append('Heuristic Title (Weak)')
                else:
                    heuristic_hits += 1
                    
                chapters.append({
                    'title': final_title,
                    'text': cleaned,
                    'warnings': warnings
                })
    
    confidence = 'Low'
    msg = 'No TOC found; chapters are files.'
    
    if heuristic_hits > 0:
        confidence = 'Medium'
        msg = f'No TOC found. Guessed {heuristic_hits} chapter titles from content.'
        
    metadata = {
        'method': 'Spine Fallback + Heuristics',
        'confidence': confidence,
        'warnings': [msg]
    }
    return chapters, metadata

async def text_to_speech(text, output_file, voice):
    """Generates audio for the given text."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)

def text_to_pdf(text, title, output_file):
    """Generates PDF for the given text."""
    html_content = f"""
    <html>
    <body>
    <h1>{title}</h1>
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
    parser.add_argument("--list-chapters", action="store_true", help="List detected chapters in the EPUB")
    parser.add_argument("--no-toc", action="store_true", help="Ignore TOC and use file scan (for testing/fallback)")
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
    try:
        book = epub.read_epub(args.epub_file)
    except Exception as e:
        print(f"Error reading EPUB: {e}")
        sys.exit(1)

    # Try TOC extraction first (unless disabled)
    toc_results = None
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
        
        print(f"--- Statistics (Audio Mode) ---")
        if args.chapter or args.range:
             print(f"Mode:             Selected Content")
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
        
        for i, ch in enumerate(selected_chapters):
            chapter_num = start_index + i
            # Clean title for filename
            clean_title = "".join(c for c in ch['title'] if c.isalnum() or c in (' ', '_', '-')).strip()
            clean_title = clean_title.replace(' ', '_')[:30] # Truncate long titles
            
            ext = ".pdf" if args.pdf else ".mp3"
            filename = f"{chapter_num:02d}_{clean_title}{ext}"
            filepath = os.path.join(output_dir, filename)
            
            print(f"  Converting {chapter_num}. {ch['title']} -> {filename}...")
            try:
                if args.pdf:
                    text_to_pdf(ch['text'], ch['title'], filepath)
                else:
                    await text_to_speech(ch['text'], filepath, args.voice)
            except Exception as e:
                print(f"  Error converting chapter {chapter_num}: {e}")
        
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
        
        msg_mode = "PDF" if args.pdf else f"audio (using {args.voice})"
        print(f"Converting to {msg_mode}...")
        try:
            if args.pdf:
                text_to_pdf(full_text, f"{base} - Selected Chapters", output_filename)
            else:
                await text_to_speech(full_text, output_filename, args.voice)
            print(f"Done! Saved to {output_filename}")
        except Exception as e:
            print(f"Error during conversion: {e}")

if __name__ == "__main__":
    asyncio.run(main())
