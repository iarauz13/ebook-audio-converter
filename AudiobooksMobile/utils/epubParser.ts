import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export interface Chapter {
  title: string;
  fileName: string;
  content: string;
  // We'll add these for the filter to use if they persist
  shouldInclude?: boolean;
  excludeReason?: string;
}

export interface Book {
  title: string;
  author: string;
  chapters: Chapter[];
  semanticMap?: Map<string, string>;
}

interface SemanticReference {
  type: string;
  title?: string;
  href: string;
}

export const parseEpub = async (uri: string): Promise<Book> => {
  console.log('Reading file:', uri);

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const zip = new JSZip();
  await zip.loadAsync(base64, { base64: true });

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: No container.xml');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });

  const containerObj = parser.parse(containerXml);
  const opfPath = containerObj.container.rootfiles.rootfile['@_full-path'];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));

  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) throw new Error('Invalid EPUB: No OPF file');

  const opfObj = parser.parse(opfXml);
  const metadata = opfObj.package.metadata;
  const manifest = opfObj.package.manifest.item;
  const spine = opfObj.package.spine.itemref;

  // Helper to extract text
  const getText = (obj: any) => {
    if (Array.isArray(obj)) return obj[0]['#text'] || obj[0] || 'Unknown';
    return obj['#text'] || obj || 'Unknown';
  };

  const title = getText(metadata['dc:title']);
  const author = getText(metadata['dc:creator']);

  console.log(`Parsed Book: ${title} by ${author}`);

  // --- SEMANTIC PARSING START ---

  const parseGuideReferences = (opf: any): SemanticReference[] => {
    const references: SemanticReference[] = [];
    const guide = opf?.package?.guide?.reference;
    if (!guide) return references;

    const refArray = Array.isArray(guide) ? guide : [guide];
    refArray.forEach((ref: any) => {
      const type = ref['@_type'];
      const title = ref['@_title'];
      const href = ref['@_href'];
      if (type && href) {
        references.push({ type, title, href: href.split('#')[0] });
      }
    });
    return references;
  };

  const parseLandmarks = (navXmlObj: any): SemanticReference[] => {
    const references: SemanticReference[] = [];
    const navElements = navXmlObj?.html?.body?.nav;
    if (!navElements) return references;

    const navArray = Array.isArray(navElements) ? navElements : [navElements];
    const landmarksNav = navArray.find((nav: any) => nav['@_epub:type'] === 'landmarks');

    if (!landmarksNav?.ol?.li) return references;

    const items = Array.isArray(landmarksNav.ol.li) ? landmarksNav.ol.li : [landmarksNav.ol.li];
    items.forEach((item: any) => {
      const link = item.a;
      if (link) {
        const type = link['@_epub:type'];
        const href = link['@_href'];
        const title = link['#text'] || link;
        if (type && href) {
          references.push({ type, title, href: href.split('#')[0] });
        }
      }
    });
    return references;
  };

  // 1. Guide (OPF)
  const guideReferences = parseGuideReferences(opfObj);

  // 2. Landmarks (NAV - EPUB 3)
  let landmarkReferences: SemanticReference[] = [];
  try {
    const manifestItems = Array.isArray(manifest) ? manifest : [manifest];
    const navItem = manifestItems.find((item: any) =>
      item['@_properties']?.includes('nav') || item['@_id'] === 'nav' || item['@_id'] === 'toc'
    );

    if (navItem && navItem['@_href']) {
      const navHref = navItem['@_href'];
      const fullNavPath = opfDir ? `${opfDir}/${navHref}` : navHref;
      const navContent = await zip.file(fullNavPath)?.async('string');
      if (navContent) {
        const navObj = parser.parse(navContent);
        landmarkReferences = parseLandmarks(navObj);
      }
    }
  } catch (e) {
    console.warn("Failed to parse landmarks", e);
  }

  const allReferences = [...guideReferences, ...landmarkReferences];
  const semanticMap = new Map<string, string>();
  allReferences.forEach(ref => {
    semanticMap.set(ref.href, ref.type);
    const filename = ref.href.split('/').pop();
    if (filename) semanticMap.set(filename, ref.type);
  });
  console.log(`Semantic Map extracted: ${semanticMap.size} entries`);

  // --- SEMANTIC PARSING END ---

  // Build ID to Href Map
  const idToHref: Record<string, string> = {};
  if (Array.isArray(manifest)) {
    manifest.forEach((item: any) => idToHref[item['@_id']] = item['@_href']);
  } else {
    idToHref[manifest['@_id']] = manifest['@_href'];
  }

  // Parse NCX for titles
  let titleMap: Record<string, string> = {};
  try {
    let ncxHref: string | null = null;
    const manifestItems = Array.isArray(manifest) ? manifest : [manifest];
    const ncxItem = manifestItems.find((item: any) => item['@_media-type'] === 'application/x-dtbncx+xml');
    if (ncxItem) ncxHref = ncxItem['@_href'];

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
              const src = kp.content['@_src'].split('#')[0];
              titleMap[src] = label;
            }
            if (kp.navPoint) processNavPoints(kp.navPoint);
          });
        };
        if (navPoints) processNavPoints(navPoints);
      }
    }
  } catch (e) {
    console.log("Failed to parse NCX", e);
  }

  const chapters: Chapter[] = [];
  const spineItems = Array.isArray(spine) ? spine : [spine];

  for (const item of spineItems) {
    const idref = item['@_idref'];
    if (!idref) continue;
    const href = idToHref[idref];
    if (!href) continue;

    const fullPath = opfDir ? `${opfDir}/${href}` : href;

    let content = await zip.file(fullPath)?.async('string');
    if (!content) content = await zip.file(decodeURIComponent(fullPath))?.async('string');

    if (content) {
      let chapterTitle = titleMap[href] || titleMap[decodeURIComponent(href)];

      if (!chapterTitle) {
        // 1. Try H1/H2
        const headerMatch = content.match(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/i);
        if (headerMatch) {
          chapterTitle = headerMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        // 2. Try HTML Title tag <title>...</title>
        if (!chapterTitle) {
          const htmlTitleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
          if (htmlTitleMatch) {
            chapterTitle = htmlTitleMatch[1].trim();
          }
        }

        // 3. Fallback to generic name
        if (!chapterTitle) {
          chapterTitle = `Section ${chapters.length + 1}`;
        }
      }

      const cleanText = content
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
        // Pre-process common block tags to ensure newlines
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '\n• ')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        // Strip remaining tags
        .replace(/<[^>]+>/g, ' ')
        // Collapse horizontal whitespace (tabs, non-breaking spaces) but PRESERVE newlines
        .replace(/[ \t\r\f\v]+/g, ' ')
        // Limit consecutive newlines to 2
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();

      // We no longer duplicate filtering logic here. 
      // All chapters are returned; filtering is done in the next step.
      chapters.push({
        title: chapterTitle,
        fileName: href,
        content: cleanText
      });
    }
  }

  return { title, author, chapters, semanticMap };
};
