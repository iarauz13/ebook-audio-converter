/**
 * text-cleaner.ts
 * Implements the 5-Stage Text Preprocessing Pipeline for Natural TTS
 * Based on Core Functionality.md specifications.
 */

/**
 * Stage 1: Strip HTML and decode entities
 * Note: epubParser already does basic stripping, but we might receive raw text
 * or need to handle entities that were missed.
 */
function stripHTML(text: string): string {
  // If we receive actual HTML, this strips it. 
  // If we receive already plain text, this should be safe.

  // Remove script and style tags entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove all HTML tags but preserve their text content
  // We replace with space to avoid words merging
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  const entities: { [key: string]: string } = {
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };

  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), char);
  }

  return text;
}

/**
 * Stage 2: Remove citations and footnotes (CRITICAL)
 */
function removeCitations(text: string): string {
  // Remove inline citations: (Author, Year), (Author et al., Year)
  // Matches (Smith, 2020) or (Smith et al., 2020)
  text = text.replace(/\([A-Z][a-z]+(?:\s+et al\.)?,?\s+\d{4}[a-z]?\)/g, '');

  // Remove footnote markers: [1], [23], [a]
  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/\[[a-z]\]/g, '');

  // Remove superscript numbers (often represented as plain numbers in extracted text if flattened)
  // Dealing with actual unicode superscripts
  text = text.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '');

  // Remove reference to "see also" type citations
  text = text.replace(/\(see [^)]+\)/gi, '');

  return text;
}

/**
 * Stage 3: Normalize punctuation for natural pauses
 */
function normalizePunctuation(text: string): string {
  // Replace em-dashes with natural pause markers
  // "He said—without thinking—yes" → "He said, without thinking, yes"
  text = text.replace(/—/g, ', ');
  text = text.replace(/--/g, ', '); // Common ascii fallback

  // Replace multiple spaces with single space
  text = text.replace(/[ \t]+/g, ' ');

  // Ensure proper spacing after punctuation
  // Fix "Hello.World" -> "Hello. World"
  text = text.replace(/([.!?])([A-Z])/g, '$1 $2');

  // Add space after commas if missing
  text = text.replace(/,([^\s0-9])/g, ', $1');

  // Remove spaces before punctuation
  text = text.replace(/\s+([.,!?;:])/g, '$1');

  return text;
}

/**
 * Stage 4: Handle special content that shouldn't be read literally
 */
function handleSpecialContent(text: string): string {
  // Replace URLs with readable text
  text = text.replace(
    /https?:\/\/[^\s]+/g,
    ' link '
  );

  // Replace email addresses
  text = text.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    ' email address '
  );

  // Handle common abbreviations for better pronunciation
  const abbreviations: { [key: string]: string } = {
    'Dr\\.': 'Doctor',
    'Mr\\.': 'Mister',
    'Mrs\\.': 'Misses',
    'Ms\\.': 'Miss',
    'Prof\\.': 'Professor',
    'etc\\.': 'et cetera',
    'i\\.e\\.': 'that is',
    'e\\.g\\.': 'for example',
    'vs\\.': 'versus',
  };

  for (const [abbr, full] of Object.entries(abbreviations)) {
    // Use word boundary to avoid replacing inside words
    text = text.replace(new RegExp(`\\b${abbr}`, 'gi'), full);
  }

  return text;
}

/**
 * Stage 5: Detect and remove non-narrative sections
 */
function removeNonNarrative(text: string): string {
  // Detect table structures or code blocks (lines with high symbol count)
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    if (line.trim().length === 0) return true;

    // If line has > 50% numbers/symbols (excluding spaces), likely a table row or code
    const content = line.replace(/\s/g, '');
    if (content.length === 0) return true;

    const nonAlpha = content.replace(/[a-zA-Z]/g, '').length;
    const ratio = nonAlpha / content.length;

    // Keep if ratio is low (mostly text)
    // Headers might be short, so we check length too
    return ratio < 0.5;
  });

  return filteredLines.join('\n');
}

/**
 * MASTER FUNCTION: Apply all cleaning stages
 */
export function cleanTextForTTS(rawContent: string): string {
  if (!rawContent) return "";

  let cleaned = rawContent;

  // Stage 1: Strip HTML
  cleaned = stripHTML(cleaned);

  // Stage 2: Remove citations (CRITICAL for your app)
  cleaned = removeCitations(cleaned);

  // Stage 4: Handle special content (Before punct norm to handle abbreviations)
  cleaned = handleSpecialContent(cleaned);

  // Stage 3: Normalize punctuation
  cleaned = normalizePunctuation(cleaned);

  // Stage 5: Remove non-narrative content
  cleaned = removeNonNarrative(cleaned);

  // Final cleanup: trim and collapse whitespace but preserve paragraph structure
  // We want to preserve newlines for TTS pauses
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 line breaks

  return cleaned;
}
