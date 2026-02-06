import re
import sys
import unicodedata
from bs4 import BeautifulSoup
from ebooklib import epub
import pypdf
import warnings

# Suppress annoying ebooklib warnings
warnings.filterwarnings("ignore", category=UserWarning, module='ebooklib')
warnings.filterwarnings("ignore", category=FutureWarning, module='ebooklib')

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
                     if next_in_spine == start_idx:
                         end_anchor = next_anchor

        # Collect text
        full_text = []
        
        loop_end = end_idx
        if end_idx == start_idx:
            loop_end = start_idx + 1
            
        for curr_idx in range(start_idx, loop_end):
            item_id = book.spine[curr_idx][0]
            item = book.get_item_with_id(item_id)
            if item:
                soup = BeautifulSoup(item.get_content(), 'html.parser')
                
                # Apply Slicing Logic
                current_start = start_anchor if curr_idx == start_idx else None
                current_end = None
                if curr_idx == start_idx and end_anchor:
                    current_end = end_anchor
                
                sliced_soup = get_html_slice(soup, current_start, current_end)
                text = clean_html_content(sliced_soup)
                full_text.append(text)
        
        combined_text = "\n\n".join(full_text)
        
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
             
    return None, False

def extract_text_fallback(book):
    """Legacy extraction: simply iterates spine but with heuristics."""
    chapters = []
    heuristic_hits = 0
    
    for i, (item_id, linear) in enumerate(book.spine):
        item = book.get_item_with_id(item_id)
        if item:
            soup = BeautifulSoup(item.get_content(), 'html.parser')
            
            # Heuristic Title Search
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
                     end_page = start_page + 1 
                     
                 text = get_text_range(start_page, end_page)
                 
                 # Clean up text slightly
                 text = text.replace('\xa0', ' ').strip()
                 
                 if len(text) > 50:
                     chapters.append({
                         'title': entry['title'],
                         'text': text,
                         'warnings': []
                     })
    
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
