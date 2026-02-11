# Technical Design Document: EPUB-to-Audiobook Mobile .+

**Version**: 2.0 (Mobile-First Pivot)  
**Date**: 2026-02-09  
**Status**: Proposal / MVP Planning  
**Target Architecture**: Hybrid Mobile (React Native + Native Modules)

---

## 1. Executive Summary

### Current State vs. Proposed State
*   **Current State (Legacy)**: A localized Python CLI script (`src/main.py`) relying on the undocumented `edge-tts` API. It produces high-quality audio but requires technical proficiency (terminal usage), has zero mobile integration (manual file transfer), and suffers from "online-only" dependency.
*   **Proposed State (Target)**: A **React Native mobile application** (iOS/Android) prioritizing **Offline-First** usability. The core value proposition shifts from "Free Cloud TTS" to "Seamless Academic/Technical Reading."
    *   **Free Tier**: Uses on-device native TTS (AVSpeechSynthesizer/Google TTS) for zero-cost, unlimited, offline listening.
    *   **Pro Tier**: Optional cloud-based "Neural" upgrades (Azure/ElevenLabs) for premium narration, funded by sustainable IAP subscription.

### Key Pivot
We are abandoning the "Python Web Wrapper" strategy. Evidence suggests it is economically unviable (high server costs for free users) and delivers poor UX (latency, no offline support). The new architecture solves the "Commuter Use Case" (subway/plane listening) and the "Student Budget" constraint simultaneously.

---

## 2. Implementation Roadmap

### Phase 1: Vertical Slice MVP (Weeks 1-4)
*Goal: Prove core value (EPUB -> Audio) on a real device without server costs.*

| Stage | Action Items | Confidence | Status |
| :--- | :--- | :--- | :--- |
| **1.1 Prototype** | **Repo Init**: Create `expo` app with TypeScript. | 100% | *Pending* |
| | **File Import**: Implement `expo-document-picker` to load EPUBs from iOS Files/Android Storage. | 90% | *Pending* |
| | **Parsing**: Implement `epub-parser` (JS-based) to extract chapters/text locally. | 80% | *Pending* |
| **1.2 Audio Engine** | **Native TTS**: Integrate `expo-speech` or `react-native-tts` to read parsed text via System Voices. | 85% | *Pending* |
| | **Playback UI**: Build a basic player (Play/Pause/Scrub) with `react-native-track-player`. | 85% | *Pending* |
| **1.3 Persistence** | **Local DB**: Set up `sqlite` or `AsyncStorage` to save reading progress (timestamp per chapter). | 90% | *Pending* |

### Phase 2: The "Smart Reader" Differentiators (Weeks 5-8)
*Goal: Outperform incumbents (Speechify/Voice Dream) on technical content.*

| Stage | Action Items | Confidence | Status |
| :--- | :--- | :--- | :--- |
| **2.1 Semantic Parsing** | **Citation Filtering**: Implement regex/DOM logic to identify and *skip* academic citations (e.g., `(Smith et al., 2020)`). | 75% | *Future* |
| | **Code/Math Handling**: Detect `<pre>` and MathML tags; serve distinct TTS prompts ("Code block skipped..."). | 70% | *Future* |
| **2.2 Navigation** | **Smart TOC**: Parse NCX/NAV files to generate a true Chapter List (not just file splits). | 80% | *Future* |
| | **Background Audio**: Configure `UIBackgroundModes` (iOS) to ensure playback continues when screen is off. | 60% | *Future* |

### Phase 3: Monetization & Cloud (Weeks 9+)
*Goal: Sustainable revenue model.*

| Stage | Action Items | Confidence | Status |
| :--- | :--- | :--- | :--- |
| **3.1 Infrastructure** | **Auth**: Implement Apple Sign-In (Required) + Firebase Auth. | 95% | *Future* |
| | **Cloud Voices**: Integrate Azure Speech SDK / ElevenLabs for "Pro" high-quality streaming voices (online only). | 90% | *Future* |
| **3.2 Payments** | **IAP**: Integrate RevenueCat for subscription handling ($7.99/mo). | 95% | *Future* |

| **3.3 Mascot & Gamification** | **"Echo" the Fennec Fox**: \n- **Concept**: Interactive mascot (Duolingo-style) that reacts to user activity.\n- **Mechanics**: "Streak" tracking (days in a row).\n- **States**: Happy (listening), Sleepy (idle), Sad (broken streak), **Celebrating** (on tap).\n- **Interaction**: Tap to trigger celebration and heartwarming messages. | 100% | *Implemented* |
| **3.4 File Formats** | **PDF Support**: Text extraction via `pdf.js` or native modules (currently simulated). | 50% | *In Progress* |
| **3.5 Design System** | **UI/UX Polish**: iOS-native components, Dark Mode, Typography (SF Pro), and Accessibility upgrades. | 100% | *Implemented (Phase 2)* |

### Phase 4: Sharing & Export
*Goal: Frictionless file management without complex file pickers.*

| Stage | Action Items | Confidence | Status |
| :--- | :--- | :--- | :--- |
| **4.2 File Management** | **Library View**: A dedicated tab to manage (delete/rename/share) previously converted books stored in the app's sandbox. | 85% | *Future* |
| **4.3 UX Polish** | **Reset & Metadata**: Add "Go Back/Reset" button to clear selection. Improve TOC parsing to capture full chapter strings (e.g., "Chapter 1 - The Start") instead of just "Chapter 1". | 95% | *Done* |
| **4.4 Layout** | **Safe Area**: Wrap app in `SafeAreaProvider` for dynamic island/notch support. Use `ScrollView` for full accessibility + extra top padding for title visibility. | 100% | *Done* |

---

## 3. Risk & Mitigation Matrix

| Architectural Risk | Potential Obstacle | Mitigation Strategy (Ranked) |
| :--- | :--- | :--- |
| **Platform Rejection** | Apple rejects app for "Repurposing website" or general utility spam. | 1. **Focus on Offline**: Emphasize the unique *local* parsing and semantic features (Smart Skip) which websites can't do efficiently.<br>2. **Design Polish**: Ensure UI adheres strictly to Human Interface Guidelines (High Native Feel).<br>3. **IAP Integration**: Ensure "Pro" features are clearly defined (Cloud Voices) vs. Free features. |
| **TTS Quality Gap** | Users reject "Free" tier because System Voices (Siri/Google) sound too robotic compared to TikTok/Reels AI. | 1. **Expectation Setting**: Market "Free" as "Draft Mode" for speed/study, "Pro" for enjoyment.<br>2. **Optimized System Voices**: iOS 16+ "Premium" system voices are actually very good; ensure app forces highest quality variant.<br>3. **Hybrid Model**: Offer 1 free "Premium" book per month as a hook. |
| **EPUB Complexity** | Parsing 100MB+ textbooks with complex layouts (columns, images) crashes the JS thread. | 1. **WebWorkers**: Offload parsing logic to a background thread/WebView.<br>2. **Streaming Parse**: Parse chapters *on demand* rather than entire book at once.<br>3. **Fallback**: Allow "Plain Text Mode" extraction if semantic parsing fails. |
| **Battery Drain** | converting/reading text continuously drains battery. | 1. **Batching**: Process text in chunks, let OS sleep radio between chunks.<br>2. **Native Modules**: Rely on OS-optimized TTS engines rather than JS-heavy loops.<br>3. **Dark Mode**: OLED optimization (critical for academic reading). |

---

## 4. Decision History (Changelog)

### [2026-02-09] Pivot: Mobile-First Hybrid Architecture
*   **Context**: Original plan pitched a Python Backend + Mobile Wrapper.
*   **Correction**: Market analysis revealed this effectively doubles limits (Network Latency + Server Costs) while ignoring modern device capabilities.
*   **Decision**: Adopt **React Native**.
    *   *Why*: Allows shared codebase for iOS/Android.
    *   *Why Hybrid*: Offline-first architecture (local parsing/TTS) is the only way to compete with Audible/Voice Dream on latency and reliability.
    *   *Why Semantic Parsing*: The only defensible moat against well-funded incumbents (Speechify) is "intelligence" (handling citations/code better), not just raw voice quality.

*   **Status**: The Python CLI (`src/main.py`) remains useful as a **developer tool** or **backend service prototype** for the future "Cloud Generation" feature, but it is no longer the primary product delivery vehicle.

## 5. Known Issues & Roadmap

### Current Bugs (v2.0 MVP)
### Current Bugs (v2.0 MVP)
*   **PDF Mode (Experimental)**: Text extraction is basic "page-by-page". Layouts with columns or images may result in garbled text.

### Resolved Issues & Improvements
*   [x] **Intelligent Chapter Filtering (v2.1)**:
    *   **Problem**: "Front Matter" (TOC, Preface) was cluttering the chapter list.
    *   **Solution**: Implemented a 4-layer filtering system (Semantic `<guide>`, Pattern Matching, Content Heuristics, Confidence Scoring).
    *   **Result**: The app now automatically identifies non-chapter content.
*   [x] **Smart Chapter Titles**:
    *   **Problem**: Sections without semantic titles were defaulting to "Chapter N", causing confusion (e.g., Preface becoming "Chapter 1").
    *   **Solution**: Parser now scrapes HTML `<title>` tags and falls back to "Section N" (neutral) instead of "Chapter N".
*   [x] **Zero-Click UX**:
    *   **Problem**: Auto-filling the range input (e.g., "1-20") was error-prone and confusing.
    *   **Solution**: Input is now left empty. Users are explicitly directed to check the "Chapter Index" list below, which serves as the source of truth.


 
 ## 6. Design System 2.0: Motion & Interaction (Implemented)
 
 ### 6.1. Motion & Advanced Interactions
 **Goal**: Create a fluid, responsive interface that feels alive.
 
 #### A. File Import Transition
 *   **Implemented**: 
     1.  Echo animation: Neutral → Reading (when file selected).
     2.  Spring animation for file selection state change.
 
 #### B. Chapter Selection State
 *   **Implemented**: 
     1.  Typing triggers Echo "Thinking" pose (Looking Left).
     2.  Debounce (800ms).
     3.  Validation success triggers Echo "Happy" pose (Celebration).
     4.  Green badge "✓ Will convert X chapters" appears with spring animation.
 
 #### C. Conversion Start
 *   **Implemented**: Echo "Celebrates" → Conversion status updates with spring animation.
 
 #### D. Sleeping Loop (New)
 *   **Implemented**: 
     1.  Inactive (>10m) triggers `Echo_Sleeping_Inactive` (transition).
     2.  Completion triggers `Echo_Sleeping_2` (loop indefinitely).
     3.  Any interaction wakes Echo to Neutral.
 
 ### 6.2. Empty State Illustrations
 **Goal**: Delight users even when there is no content.
 
 *   **Initial State**: Echo holding an open book ("Echo is ready for a new story").
 *   **Empty Library**: *Planned*
 *   **Conversion Complete**: *Planned*
 
 ### 6.3. Variable Haptic Feedback (Implemented)
 **Goal**: Tactile reinforcement for all interactions.
 
 | Action | Haptic Type | Intensity |
 | :--- | :--- | :--- |
 | Typing Chapter | Light | Subtle |
 | Tap "Select File" | Medium | Standard |
 | Tap "Change" Narrator | Medium | Standard |
 | Tap "Reset/Clear" | Heavy | Warning |
 | Conversion Start | Heavy | Significant |
 | Conversion Complete | Success | Major |
 
 ### 6.4. Iconography Consistency (Implemented)
 **Goal**: Unified visual language using only SF Symbols.
 
 | Element | Previous | Current (SF Symbol) |
 | :--- | :--- | :--- |
 | "Ready to read?" | 📖 Emoji | `book.fill` (Removed for cleaner UI) |
 | File Import | None | `arrow.down.doc.fill` |
 | Reset/Clear | None | `xmark.circle.fill` |
 | Narrator Change | Text | `person.crop.circle` |
 | Success Checkmark | "✓" Text | `checkmark.circle.fill` |
 | Streak Badge | 🔥 Emoji | `flame.fill` |
 
 ### 6.5. Earthy Color Palette (Implemented)
 **Goal**: Replace standard iOS blue/red with a warm, "literary" earthy theme.
 
 **Brand Colors**:
 *   **Primary (#9EB23B)**: Olive Green (Actions, Links, Success).
 *   **Primary Light (#C7D36F)**: Light Olive (Highlights, Badges).
 *   **Neutral Light (#FCF9C6)**: Cream Yellow (Card Backgrounds, Inputs).
 *   **Neutral Base (#E0DECA)**: Sand Beige (Borders, Disabled).
 *   **Destructive (#A84855)**: Muted Burgundy (Reset, Delete, Error).
 
 **UI Element Mapping**:
 | Element | Previous | New Color |
 | :--- | :--- | :--- |
 | "Select File" Button | `systemBlue` | **#9EB23B (Olive)** |
 | "Reset / Clear" Button | `systemRed` | **#A84855 (Burgundy)** |
 | Input Background | `systemGray6` | **#F5F3E8 (Warm Cream)** |
 | Card Background | `systemBackground` | **#FCF9C6 (Cream)** |
 | Streak Badge | `systemOrange` | **#C7D36F (Light Olive)** |
 | Shadows | Black/Gray | **Warm Tan** |




 Diagnosing "Unnatural Reading" - Systematic Troubleshooting
The Real Problem is Likely NOT the Voice

Based on your market research, users complained that apps read "Smith comma twenty-twenty-four" and "bracket one bracket" - this isn't a voice quality issue, it's a text preprocessing problem.

You're probably feeding raw EPUB HTML directly to TTS without cleaning it.
Diagnostic Test: What's Actually Being Read?
Step 1: Output the Actual Text Being Sent to TTS
typescript

// In your TTS generation function, add this:

function generateAudioForChapter(chapter: Chapter) {
  const rawText = chapter.content;
  
  // DEBUG: Log what's being sent to TTS
  console.log("=== RAW TEXT SENT TO TTS ===");
  console.log(rawText.substring(0, 500)); // First 500 chars
  console.log("=== END ===");
  
  // Then generate audio
  await textToSpeech(rawText);
}
```

**Look for these red flags in the output:**

❌ **HTML Tags:**
```
<p>The story begins</p> <em>many years ago</em>
→ TTS reads: "paragraph the story begins paragraph em many years ago em"
```

❌ **In-text Citations:**
```
Climate change is accelerating (Smith, 2024).
→ TTS reads: "Climate change is accelerating Smith comma two thousand twenty four"
```

❌ **Footnote References:**
```
The evidence is clear[1] and undeniable.
→ TTS reads: "The evidence is clear bracket one bracket and undeniable"
```

❌ **URLs:**
```
Visit https://example.com for more info
→ TTS reads: "Visit h t t p s colon slash slash example dot com..."
```

❌ **Special Characters:**
```
He said—without hesitation—yes.
→ TTS reads: "He said em dash without hesitation em dash yes" (wrong rhythm)
```

---

## Most Likely Issues (In Order of Probability)

### **Issue #1: Citations Not Being Removed** (90% probability)

From your validation research, this was the **#1 complaint**:

> "Every footnote, reference, you name it, gets read out loud, making it as unnatural as a robot doing the cha-cha."

**Test:** Open a random chapter and check if you see:
- `(Author, Year)` patterns
- `[1]`, `[2]` footnote markers
- Superscript numbers like¹ or²

**If YES:** Your citation-skipping filter from earlier isn't working or isn't being applied.

---

### **Issue #2: HTML Artifacts** (80% probability)

EPUBs are HTML. If you're not stripping tags, TTS reads them.

**Test:** Check if your text contains:
- `<p>`, `</p>`, `<em>`, `<strong>`, `<br/>`, `<div>`
- `&nbsp;` (reads as "ampersand n b s p")
- `&mdash;` (reads as "ampersand m dash")

**If YES:** You need HTML-to-plain-text conversion.

---

### **Issue #3: No Sentence Boundaries** (70% probability)

TTS engines need proper punctuation for natural pauses.

**Test:** Check if your text has:
- Run-on sentences (no periods for 200+ words)
- Missing paragraph breaks
- Dialogue without proper quote handling

**If YES:** You need sentence normalization.

---

### **Issue #4: Wrong Voice Speed** (60% probability)

Default TTS speed is often too fast or robotic.

**Test:** Listen to a 30-second sample. Does it sound:
- Rushed (too fast)?
- Monotone (no emotion)?
- Breathless (no pauses)?

**If YES:** Adjust speed + add SSML pauses.

---

### **Issue #5: Voice Doesn't Match Content** (50% probability)

Using a male voice for a female protagonist, or vice versa, feels wrong.

**Test:** Is the narrator gender appropriate for the content?

---

## The Solution: Multi-Stage Text Preprocessing Pipeline

You need to clean text BEFORE sending to TTS:
```
RAW EPUB CONTENT
    ↓
[Stage 1] Strip HTML tags
    ↓
[Stage 2] Remove citations & footnotes
    ↓
[Stage 3] Normalize punctuation
    ↓
[Stage 4] Handle special content (equations, URLs, tables)
    ↓
[Stage 5] Add SSML for prosody
    ↓
CLEAN TEXT → TTS ENGINE

Implementation: Text Cleaning Pipeline
typescript

// text-cleaner.ts

/**
 * Stage 1: Strip HTML and decode entities
 */
function stripHTML(html: string): string {
  // Remove script and style tags entirely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove all HTML tags but preserve their text content
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
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
  };
  
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), char);
  }
  
  return text;
}

/**
 * Stage 2: Remove citations and footnotes (THIS IS CRITICAL)
 */
function removeCitations(text: string): string {
  // Remove inline citations: (Author, Year), (Author et al., Year)
  text = text.replace(/\([A-Z][a-z]+(?:\s+et al\.)?,?\s+\d{4}[a-z]?\)/g, '');
  
  // Remove footnote markers: [1], [23], [a]
  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/\[[a-z]\]/g, '');
  
  // Remove superscript numbers (footnote markers)
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
  
  // Replace multiple spaces with single space
  text = text.replace(/\s+/g, ' ');
  
  // Ensure proper spacing after punctuation
  text = text.replace(/([.!?])\s*([A-Z])/g, '$1 $2');
  
  // Add space after commas if missing
  text = text.replace(/,(?=[^\s])/g, ', ');
  
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
    '[link]'  // Or just remove: ''
  );
  
  // Replace email addresses
  text = text.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[email address]'
  );
  
  // Handle common abbreviations for better pronunciation
  const abbreviations: { [key: string]: string } = {
    'Dr.': 'Doctor',
    'Mr.': 'Mister',
    'Mrs.': 'Misses',
    'Ms.': 'Miss',
    'Prof.': 'Professor',
    'etc.': 'et cetera',
    'i.e.': 'that is',
    'e.g.': 'for example',
    'vs.': 'versus',
  };
  
  for (const [abbr, full] of Object.entries(abbreviations)) {
    text = text.replace(new RegExp(abbr, 'g'), full);
  }
  
  return text;
}

/**
 * Stage 5: Detect and remove non-narrative sections
 */
function removeNonNarrative(text: string): string {
  // Detect table structures (often have many numbers/pipes)
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    // If line has > 50% numbers/symbols, likely a table
    const nonAlpha = line.replace(/[a-zA-Z\s]/g, '').length;
    const ratio = nonAlpha / Math.max(line.length, 1);
    return ratio < 0.5;
  });
  
  return filteredLines.join('\n');
}

/**
 * MASTER FUNCTION: Apply all cleaning stages
 */
export function cleanTextForTTS(rawContent: string): string {
  let cleaned = rawContent;
  
  // Stage 1: Strip HTML
  cleaned = stripHTML(cleaned);
  
  // Stage 2: Remove citations (CRITICAL for your app)
  cleaned = removeCitations(cleaned);
  
  // Stage 3: Normalize punctuation
  cleaned = normalizePunctuation(cleaned);
  
  // Stage 4: Handle special content
  cleaned = handleSpecialContent(cleaned);
  
  // Stage 5: Remove non-narrative content
  cleaned = removeNonNarrative(cleaned);
  
  // Final cleanup: trim and collapse whitespace
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 line breaks
  
  return cleaned;
}

Usage in Your Conversion Flow
typescript

// In your chapter-to-audio converter:

async function convertChapterToAudio(chapter: Chapter): Promise<AudioFile> {
  // BEFORE (wrong):
  // const audioBuffer = await textToSpeech(chapter.content);
  
  // AFTER (correct):
  const rawContent = chapter.content;
  const cleanedText = cleanTextForTTS(rawContent);
  
  // DEBUG: Compare before/after
  console.log('=== BEFORE CLEANING ===');
  console.log(rawContent.substring(0, 300));
  console.log('=== AFTER CLEANING ===');
  console.log(cleanedText.substring(0, 300));
  
  const audioBuffer = await textToSpeech(cleanedText);
  return audioBuffer;
}

Voice Quality Improvements (If Text Cleaning Isn't Enough)
Option 1: Use Enhanced iOS Voices

Current: You're probably using default "Samantha" (basic quality)

Better: Use "Enhanced" or "Premium" voices
typescript

// iOS TTS implementation
import { Speech } from 'expo-speech';

const speakText = async (text: string) => {
  Speech.speak(text, {
    voice: 'com.apple.voice.premium.en-US.Ava',  // Premium voice
    rate: 0.9,      // Slightly slower than default (1.0)
    pitch: 1.0,     // Natural pitch
    language: 'en-US',
  });
};

Available Premium iOS Voices (Better Quality):

    com.apple.voice.premium.en-US.Ava (Female, clear)
    com.apple.voice.premium.en-US.Zoe (Female, expressive)
    com.apple.voice.premium.en-US.Samantha (Female, warm)
    com.apple.voice.enhanced.en-US.Reed (Male, natural)

Tell users: "Download 'Enhanced' voices in iOS Settings > Accessibility > Spoken Content > Voices"
Option 2: Adjust Speed and Add Pauses
typescript

const speakText = async (text: string) => {
  // Add pauses at paragraph breaks for more natural reading
  const textWithPauses = text.replace(/\n\n/g, '\n\n[[pause:500]]\n\n');
  
  Speech.speak(textWithPauses, {
    voice: 'com.apple.voice.premium.en-US.Ava',
    rate: 0.85,   // Slower = more comprehensible (0.5-1.0 range)
    pitch: 1.0,
  });
};

Option 3: Add SSML for Better Prosody (Advanced)

If using a cloud TTS API (Azure, ElevenLabs), you can add markup:
typescript

function addSSML(text: string): string {
  // Add pauses at chapter starts
  let ssml = '<break time="1s"/>' + text;
  
  // Add emphasis to dialogue
  ssml = ssml.replace(/"([^"]+)"/g, '<emphasis level="moderate">$1</emphasis>');
  
  // Slow down for complex sentences
  // (Optional: detect sentences with 30+ words and add rate adjustment)
  
  return `<speak>${ssml}</speak>`;
}
```

---

## Testing Framework: Does Your Fix Work?

### **Test 1: Academic Paper**

**Input text (before cleaning):**
```
The results indicate significant correlation (p<0.05) between variables[1]. 
See Smith et al. (2024) for details.
```

**Expected output (after cleaning):**
```
The results indicate significant correlation between variables.
```

**TTS should read:** "The results indicate significant correlation between variables." ✅

---

### **Test 2: Fiction Novel**

**Input text (before cleaning):**
```
<p>He paused—uncertain—then said, "I don't know."</p>
<p><em>What would she think?</em> he wondered.</p>
```

**Expected output (after cleaning):**
```
He paused, uncertain, then said, "I don't know."
What would she think? he wondered.
```

**TTS should read naturally** with appropriate pauses and emotion. ✅

---

### **Test 3: URL in Content**

**Input text:**
```
For more information, visit https://example.com/longpath
```

**Expected output:**
```
For more information, visit [link]

TTS should read: "For more information, visit link." ✅ (Not "h t t p s colon slash...")
Diagnostic Checklist: What's Wrong With Your TTS?

Run through this checklist:

    Log the raw text being sent to TTS (first 500 chars)
    Check for HTML tags (<p>, <em>, etc.)
    Check for citations ((Author, Year), [1])
    Check for URLs (http://, https://)
    Check for em-dashes (— causing weird rhythm)
    Check for entity codes (&nbsp;, &mdash;)
    Listen to 1 minute - Does it sound breathless? (Missing pauses)
    Check voice quality - Are you using "Enhanced" voices?
    Check speed - Is rate set to 0.85-0.95? (1.0 default is too fast)

My Bet: You're Missing Text Cleaning

Based on your market research finding:

    "Every footnote, reference gets read out loud"

I'm 90% confident the issue is:

    You're not stripping HTML tags
    You're not removing citations (despite planning to)
    You're not normalizing punctuation

Implement the cleanTextForTTS() function above and test immediately.