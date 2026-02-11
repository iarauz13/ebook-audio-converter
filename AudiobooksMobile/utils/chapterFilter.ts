import { Chapter, Book } from './epubParser';

export interface FilteredChapter extends Chapter {
  shouldInclude: boolean;
  excludeReason?: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEMANTIC_EXCLUDE_TYPES = new Set([
  'toc', 'loi', 'lot', 'index', 'glossary', 'bibliography',
  'copyright-page', 'colophon', 'cover', 'titlepage'
]);

const SEMANTIC_BORDERLINE_TYPES = new Set([
  'dedication', 'acknowledgements', 'preface', 'foreword', 'epigraph',
]);

const SEMANTIC_INCLUDE_TYPES = new Set([
  'text', 'bodymatter', 'chapter'
]);

const TITLE_EXCLUDE_PATTERNS = [
  // Legal/Copyright
  /copyright/i, /all rights reserved/i, /published by/i, /isbn/i, /colophon/i, /imprint/i,
  // Navigation
  /table of contents/i, /^contents$/i, /^toc$/i, /list of (illustrations|figures|tables|maps)/i,
  // Front Matter
  /^dedication$/i, /^acknowledgements?$/i, /^preface$/i, /^foreword$/i, /^prologue$/i, /^introduction$/i,
  /about (the author|this book)/i, /author'?s? notes?/i,
  // Back Matter
  /^appendix/i, /^glossary$/i, /^bibliography$/i, /^references$/i, /^works cited$/i, /^endnotes?$/i, /^index$/i,
  /about the publisher/i, /also by/i, /other (books|titles)/i, /coming soon/i, /^preview$/i, /excerpt from/i,
  // Visual Content
  /^maps?$/i, /^illustrations?$/i, /^diagrams?$/i, /^charts?$/i, /family tree/i, /character list/i,
  // Academic
  /^abstract$/i, /^keywords?$/i,
];

const FILENAME_EXCLUDE_PATTERNS = [
  /cover\.(xhtml|html)/i,
  /title(page)?\.(xhtml|html)/i,
  /copyright\.(xhtml|html)/i,
  /toc\.(xhtml|html)/i,
  /frontmatter\.(xhtml|html)/i,
  /backmatter\.(xhtml|html)/i,
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function checkSemanticType(fileName: string, semanticMap?: Map<string, string>): { shouldExclude: boolean; reason?: string; confidence: number } {
  if (!semanticMap) return { shouldExclude: false, confidence: 0 };

  const semanticType = semanticMap.get(fileName);
  // Also check just the basename if full path fails
  const basename = fileName.split('/').pop() || '';
  const semanticTypeBasename = semanticMap.get(basename);

  const type = semanticType || semanticTypeBasename;

  if (!type) return { shouldExclude: false, confidence: 0 };

  if (SEMANTIC_EXCLUDE_TYPES.has(type)) {
    return { shouldExclude: true, reason: `Semantic type: ${type}`, confidence: 1.0 };
  }
  if (SEMANTIC_INCLUDE_TYPES.has(type)) {
    return { shouldExclude: false, reason: `Semantic type: ${type}`, confidence: 1.0 };
  }
  if (SEMANTIC_BORDERLINE_TYPES.has(type)) {
    return { shouldExclude: true, reason: `Borderline: ${type}`, confidence: 0.7 };
  }

  return { shouldExclude: false, confidence: 0 };
}

function checkPatterns(title: string, fileName: string): { shouldExclude: boolean; reason?: string; confidence: number } {
  for (const pattern of TITLE_EXCLUDE_PATTERNS) {
    if (pattern.test(title)) {
      return { shouldExclude: true, reason: `Title matches: ${pattern.source}`, confidence: 0.9 };
    }
  }
  for (const pattern of FILENAME_EXCLUDE_PATTERNS) {
    if (pattern.test(fileName)) {
      return { shouldExclude: true, reason: `Filename matches: ${pattern.source}`, confidence: 0.85 };
    }
  }
  return { shouldExclude: false, confidence: 0 };
}

function analyzeContent(content: string): { shouldExclude: boolean; reason?: string; confidence: number } {
  const plainText = content.replace(/<[^>]*>/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount < 100) {
    return { shouldExclude: true, reason: `Too short: ${wordCount} words`, confidence: 0.8 };
  }

  const linkCount = (content.match(/<a\s+[^>]*href/gi) || []).length;
  // Reduce constraint slightly: > 1 link per 10 words is very dense
  if (wordCount > 0 && (linkCount / wordCount) > 0.1) {
    return { shouldExclude: true, reason: `High link density`, confidence: 0.85 };
  }

  const copyrightIndicators = [/copyright\s*©/i, /all rights reserved/i];
  for (const pattern of copyrightIndicators) {
    if (pattern.test(plainText)) {
      return { shouldExclude: true, reason: 'Copyright notice', confidence: 0.9 };
    }
  }

  return { shouldExclude: false, confidence: 0 };
}

// ---------------------------------------------------------------------------
// Main Logic
// ---------------------------------------------------------------------------

function filterChapters(chapters: Chapter[], semanticMap?: Map<string, string>): FilteredChapter[] {
  return chapters.map((chapter, index) => {
    const signals = [
      checkSemanticType(chapter.fileName, semanticMap),
      checkPatterns(chapter.title, chapter.fileName),
      analyzeContent(chapter.content)
    ];

    const weights = [1.0, 0.7, 0.5];
    let excludeScore = 0;
    let maxConfidence = 0;
    let primaryReason = '';

    signals.forEach((signal, i) => {
      if (signal.shouldExclude) {
        excludeScore += signal.confidence * weights[i];
        if (signal.confidence > maxConfidence) {
          maxConfidence = signal.confidence;
          primaryReason = signal.reason || 'Unknown';
        }
      }
    });

    // Threshold > 0.6 means exclude
    const shouldExclude = excludeScore > 0.6;

    // Safety: First 5 chapters titled "Chapter 1" should almost never be excluded
    const isLikelyFirstChapter = index <= 5 && /chapter\s*1/i.test(chapter.title);
    if (isLikelyFirstChapter && maxConfidence < 0.95) {
      return {
        ...chapter,
        shouldInclude: true,
        confidence: 0,
        excludeReason: undefined
      };
    }

    return {
      ...chapter,
      shouldInclude: !shouldExclude,
      excludeReason: shouldExclude ? primaryReason : undefined,
      confidence: maxConfidence
    };
  });
}

// ---------------------------------------------------------------------------
// Advanced / Special Case Logic
// ---------------------------------------------------------------------------

function isAcademicPaper(chapters: Chapter[]): boolean {
  const matches = chapters.filter(ch =>
    /abstract|introduction|methods|results|discussion|conclusion|references/i.test(ch.title)
  );
  return matches.length >= 4;
}

function filterAcademicPaper(chapters: Chapter[]): FilteredChapter[] {
  return chapters.map(chapter => {
    const title = chapter.title.toLowerCase();
    const include = /abstract|introduction|methods|results|discussion|conclusion/i.test(title);
    const exclude = /references|bibliography|appendix/i.test(title);

    return {
      ...chapter,
      shouldInclude: include || !exclude,
      excludeReason: exclude ? 'Academic back matter' : undefined,
      confidence: 0.9
    };
  });
}

function isFanfiction(chapters: Chapter[]): boolean {
  return chapters.some(ch => /story\s*notes|tags|relationships|fandom/i.test(ch.title));
}

function filterFanfiction(chapters: Chapter[]): FilteredChapter[] {
  return chapters.map(chapter => {
    const title = chapter.title.toLowerCase();
    const exclude = /story notes|summary|tags|relationships/i.test(title);
    const isChapter = /chapter\s+\d+/i.test(title);
    return {
      ...chapter,
      shouldInclude: isChapter || !exclude,
      excludeReason: exclude ? 'Fanfic metadata' : undefined,
      confidence: 0.9
    };
  });
}

export function intelligentChapterFilter(book: Book): FilteredChapter[] {
  if (isAcademicPaper(book.chapters)) {
    console.log('Detected: Academic Paper');
    return filterAcademicPaper(book.chapters);
  }
  if (isFanfiction(book.chapters)) {
    console.log('Detected: Fanfiction');
    return filterFanfiction(book.chapters);
  }

  console.log('Detected: Standard Book');
  return filterChapters(book.chapters, book.semanticMap);
}
