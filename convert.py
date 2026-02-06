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
import pypdf
import mutagen
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TRCK, APIC
from PIL import Image, ImageDraw, ImageFont
import io
import json
import time
from tqdm import tqdm

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

def extract_text_from_pdf(pdf_path):
    """
    Extracts text from a PDF file.
    Attempts to look for Outline (bookmarks) to identify chapters.
    """
    print(f"Extracting text from PDF: {pdf_path}")
    try:
        reader = pypdf.PdfReader(pdf_path)
    except Exception as e:
        print(f"Error reading PDF: {e}")
        sys.exit(1)
    
    chapters = []
    metadata = {
        'method': 'PDF (Whole)',
        'confidence': 'Medium',
        'warnings': []
    }
    
    # helper to extract text from a page range
    def get_text_range(start_page, end_page):
        text_parts = []
        # end_page is exclusive in logic, but inclusive in pypdf loop if we do range
        # reader.pages is 0-indexed
        for p_i in range(start_page, end_page):
            try:
                page_text = reader.pages[p_i].extract_text()
                if page_text:
                    text_parts.append(page_text)
            except Exception:
                pass
        return "\n".join(text_parts)

    def search_outline(outline_items, reader):
        """Recursively search outline for destinations."""
        results = []
        for item in outline_items:
            if isinstance(item, list):
                results.extend(search_outline(item, reader))
            elif isinstance(item, pypdf.generic.Destination):
                # get page number
                try:
                    page_num = reader.get_destination_page_number(item)
                    if page_num is not None:
                         results.append({'title': item.title, 'page': page_num})
                except:
                    pass
        return results

    outline = reader.outline
    if outline:
        toc_entries = search_outline(outline, reader)
        if toc_entries:
             # Sort by page number just in case
             toc_entries.sort(key=lambda x: x['page'])
             
             metadata['method'] = 'PDF Outline'
             metadata['confidence'] = 'High'
             
             for i, entry in enumerate(toc_entries):
                 start_page = entry['page']
                 
                 # Determine end page
                 if i + 1 < len(toc_entries):
                     end_page = toc_entries[i+1]['page']
                 else:
                     end_page = len(reader.pages)
                 
                 # Sanity check
                 if end_page <= start_page:
                     end_page = start_page + 1 # At least one page
                     
                 text = get_text_range(start_page, end_page)
                 
                 # Clean up text slightly (remove excessive whitespace)
                 text = text.replace('\xa0', ' ').strip()
                 
                 if len(text) > 50:
                     chapters.append({
                         'title': entry['title'],
                         'text': text,
                         'warnings': []
                     })
    
    # Fallback to single chunk if no outline or no chapters found
    if not chapters:
        full_text = get_text_range(0, len(reader.pages))
        full_text = full_text.replace('\xa0', ' ').strip()
        if len(full_text) > 50:
            chapters.append({
                'title': 'Full Document',
                'text': full_text,
                'warnings': ['No Outline found, treating as single chapter']
            })
            metadata['warnings'].append("No PDF Outline found.")
    
    # If still nothing
    if not chapters:
        metadata['confidence'] = 'Low'
        metadata['warnings'].append("No text extracted from PDF.")
        
    return chapters, metadata


async def text_to_speech(text, output_file, voice, rate=None):
    """Generates audio for the given text."""
    if rate:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
    else:
        communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)

def generate_cover_image(title, author):
    """Generates a simple cover image."""
    width, height = 600, 600
    color = (44, 62, 80) # Dark Blue Grey
    text_color = (255, 255, 255)
    
    img = Image.new('RGB', (width, height), color)
    d = ImageDraw.Draw(img)
    
    # Try to use a default font, otherwise use default
    try:
        # MacOS default font path
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    except:
        font = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Draw Text (Centered roughly)
    d.text((width/2, height/3), title[:30], fill=text_color, anchor="mm", font=font)
    if len(title) > 30:
         d.text((width/2, height/3 + 50), title[30:], fill=text_color, anchor="mm", font=font)
         
    d.text((width/2, 2*height/3), author, fill=text_color, anchor="mm", font=font_small)
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    return img_byte_arr.getvalue()

def inject_id3_tags(filepath, title, author, album, track_num, total_tracks, cover_bytes=None):
    """Injects ID3 tags into the MP3 file."""
    try:
        audio = ID3(filepath)
    except mutagen.id3.ID3NoHeaderError:
        audio = ID3()
    
    # Title
    audio.add(TIT2(encoding=3, text=title))
    # Author
    audio.add(TPE1(encoding=3, text=author))
    # Album
    audio.add(TALB(encoding=3, text=album))
    # Track Number
    audio.add(TRCK(encoding=3, text=f"{track_num}/{total_tracks}"))
    
    # Cover Art
    if cover_bytes:
        audio.add(APIC(
            encoding=3,
            mime='image/jpeg',
            type=3, # 3 is for the cover(front) image
            desc='Cover',
            data=cover_bytes
        ))
        
    audio.save(filepath)

def load_progress(output_dir):
    """Loads the progress JSON file."""
    progress_file = os.path.join(output_dir, "progress.json")
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_progress(output_dir, chapter_index, chapter_title):
    """Marks a chapter as complete in the progress file."""
    progress = load_progress(output_dir)
    progress[str(chapter_index)] = {"title": chapter_title, "status": "done", "timestamp": time.time()}
    
    progress_file = os.path.join(output_dir, "progress.json")
    with open(progress_file, 'w') as f:
        json.dump(progress, f, indent=2)

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
    parser.add_argument("--author", help="Override Author Name (for ID3 tags)", default="Unknown Author")
    parser.add_argument("--title", help="Override Book Title (for ID3 tags)", default=None)
    parser.add_argument("--rate", help="Playback speed (e.g. '+20%%', '-10%%')", default=None)


    
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
            chapters, metadata = extract_text_from_pdf_fallback(book) if False else extract_text_fallback(book)

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
        output_dir = f"{base_name}{suffix}"
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
        
        msg_mode = "PDF" if args.pdf else f"audio (using {args.voice})"
        print(f"Converting to {msg_mode}...")
        try:
            if args.pdf:
                text_to_pdf(full_text, f"{base} - Selected Chapters", output_filename)
            else:
                await text_to_speech(full_text, output_filename, args.voice, args.rate)
                # For single file, tracks are 1/1
                cover_bytes = generate_cover_image(book_title, author)
                inject_id3_tags(output_filename, book_title, author, book_title, 1, 1, cover_bytes)
                
            print(f"Done! Saved to {output_filename}")
        except Exception as e:
            print(f"Error during conversion: {e}")

if __name__ == "__main__":
    asyncio.run(main())
