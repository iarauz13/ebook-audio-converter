import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export interface Chapter {
  title: string;
  fileName: string;
  content: string;
}

export interface Book {
  title: string;
  author: string;
  chapters: Chapter[];
}

export const parseEpub = async (uri: string): Promise<Book> => {
  console.log('Reading file:', uri);

  // 1. Read file as Base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  // 2. Load into JSZip
  const zip = new JSZip();
  await zip.loadAsync(base64, { base64: true });

  // 3. Find OPF file via META-INF/container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: No container.xml');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });

  const containerObj = parser.parse(containerXml);
  const opfPath = containerObj.container.rootfiles.rootfile['@_full-path'];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));

  // 4. Parse OPF
  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) throw new Error('Invalid EPUB: No OPF file');

  const opfObj = parser.parse(opfXml);
  const metadata = opfObj.package.metadata;
  const manifest = opfObj.package.manifest.item;
  const spine = opfObj.package.spine.itemref;

  // Helper to extract text from array or object
  const getText = (obj: any) => {
    if (Array.isArray(obj)) return obj[0]['#text'] || obj[0] || 'Unknown';
    return obj['#text'] || obj || 'Unknown';
  };

  const title = getText(metadata['dc:title']);
  const author = getText(metadata['dc:creator']);

  console.log(`Parsed Book: ${title} by ${author}`);

  // 5. Build Chapters
  const chapters: Chapter[] = [];

  // Try to find and parse TOC (NCX) for better titles
  let titleMap: Record<string, string> = {};
  try {
    // Find NCX item
    let ncxHref: string | null = null;
    if (Array.isArray(manifest)) {
      const ncxItem = manifest.find((item: any) => item['@_media-type'] === 'application/x-dtbncx+xml');
      if (ncxItem) ncxHref = ncxItem['@_href'];
    } else if (manifest['@_media-type'] === 'application/x-dtbncx+xml') {
      ncxHref = manifest['@_href'];
    }

    // If we found an NCX, parse it
    if (ncxHref) {
      const fullNcxPath = opfDir ? `${opfDir}/${ncxHref}` : ncxHref;
      const ncxContent = await zip.file(fullNcxPath)?.async('string');
      if (ncxContent) {
        const ncxObj = parser.parse(ncxContent);
        const navPoints = ncxObj.ncx.navMap.navPoint;

        const processNavPoints = (points: any) => {
          const list = Array.isArray(points) ? points : [points];
          list.forEach((kp: any) => {
            if (kp.navLabel && kp.content) {
              const label = getText(kp.navLabel.text);
              // Content src might have an anchor like 'chapter1.html#section', strip it
              const src = kp.content['@_src'].split('#')[0];
              titleMap[src] = label;
            }
            // Handle nested navPoints
            if (kp.navPoint) {
              processNavPoints(kp.navPoint);
            }
          });
        };

        if (navPoints) processNavPoints(navPoints);
      }
    }
  } catch (e) {
    console.log("Failed to parse NCX, falling back to basic titles", e);
  }

  // Iterate spine to get reading order
  const spineItems = Array.isArray(spine) ? spine : [spine];

  for (const item of spineItems) {
    const idref = item['@_idref'];
    if (!idref) continue;

    // Fix: Handle idref lookup in standard object or array
    // (Previous code assumed idToHref was already built, let's keep that)
    // Re-build idToHref locally if helpful or assume it's there?
    // The previous block *was* building idToHref. Oops, I replaced the block starting at line 62.
    // I need to ensure idToHref is built BEFORE this block or inside it.
    // Wait, the Replacement content REPLACEs the loop. I need to make sure I don't lose the idToHref map logic.
    // I will re-include the idToHref logic in this replacement to be safe.
  }

  // Re-implementing idToHref map logic that was at the top of the replaced block
  const idToHref: Record<string, string> = {};
  if (Array.isArray(manifest)) {
    manifest.forEach((item: any) => {
      idToHref[item['@_id']] = item['@_href'];
    });
  } else {
    idToHref[manifest['@_id']] = manifest['@_href'];
  }

  for (const item of spineItems) {
    const idref = item['@_idref'];
    const href = idToHref[idref];
    if (!href) continue;

    const fullPath = opfDir ? `${opfDir}/${href}` : href;

    let content = await zip.file(fullPath)?.async('string');
    // Fix: Handle URL encoded paths
    if (!content) content = await zip.file(decodeURIComponent(fullPath))?.async('string');

    if (content) {
      // STRATEGY: Use Title Map (NCX) -> Fallback to H1 tag -> Fallback to "Chapter N"
      let chapterTitle = titleMap[href] || titleMap[decodeURIComponent(href)];

      if (!chapterTitle) {
        const titleMatch = content.match(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/i);
        chapterTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Chapter ${chapters.length + 1}`;
      }

      // Clean extracted text (simple version)
      // Remove scripts, styles, and tags
      const cleanText = content
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
        .replace(/<[^>]+>/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();

      chapters.push({
        title: chapterTitle,
        fileName: href,
        content: cleanText
      });
    }
  }

  return { title, author, chapters };
};
