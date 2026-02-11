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

### UI/UX Redesign Specification - Audiobooks Mobile (iOS)
Current Issues Analysis
Based on the screenshot provided, the following critical design problems need immediate resolution:
CRITICAL ISSUES:

Typography Hierarchy Failure

App title "Audiobooks Mobile" is oversized and competes with content
Book title shows filename artifacts ("Donna Tartt - The Secret History-Vintage (2004).epub") instead of clean metadata
Inconsistent font weights and sizes throughout
Instructions use italic gray text (poor readability)


Color System Violations

Not using iOS system colors
Poor contrast in gray italic text on white background
Blue background gradient doesn't follow iOS design language


Mascot Integration Problem

Echo is relegated to top-right corner (feels disconnected)
"Ready to read? 📖" speech bubble looks amateur
Mascot should be functionally integrated, not decorative


Layout & Spacing Issues

Inconsistent padding within white card
"1 Day Streak" badge placement is cramped
No clear visual grouping between steps
Violates iOS 8pt grid system


iOS Design System Non-Compliance

Not using SF Pro font family
Custom UI elements instead of native iOS components
Link styling doesn't match iOS system blue
Card design doesn't follow iOS conventions




Design Specification for Implementation
1. TYPOGRAPHY SYSTEM
Implement iOS-compliant typography hierarchy using SF Pro:
swift// Font scale to implement

// Headers
.largeTitle: SF Pro Display, 34pt, Bold (for screens, not this page)
.title1: SF Pro Display, 28pt, Bold
.title2: SF Pro Display, 22pt, Bold
.title3: SF Pro Display, 20pt, Semibold

// Body
.body: SF Pro Text, 17pt, Regular (default iOS body text)
.callout: SF Pro Text, 16pt, Regular
.subheadline: SF Pro Text, 15pt, Regular
.footnote: SF Pro Text, 13pt, Regular
.caption1: SF Pro Text, 12pt, Regular
.caption2: SF Pro Text, 11pt, Regular
Specific fixes:

"Audiobooks Mobile" title: Reduce to 28pt (Title1) instead of current ~40pt
"Tartt The Secret History": Use 22pt Bold (Title2), display as "The Secret History" (clean title, no filename)
"Donna Tartt": Use 17pt Regular (Body), secondary color
Step headers ("Step 1: Import Book"): Use 20pt Semibold (Title3)
Instructions ("Note: Please select..."): Use 15pt Regular (Subheadline) in REGULAR weight, NOT italic
"Will convert 17 of 17 chapters": Use 17pt Regular (Body) with system blue color
Input placeholder ("e.g. 1-5, 8"): Use 17pt Regular in placeholder gray
Narrator name ("Samantha"): Use 17pt Regular

Remove italic styling everywhere - iOS Human Interface Guidelines discourage italic for UI text (reserved for emphasis in content, not instructions).

2. COLOR SYSTEM
Replace custom colors with iOS semantic color system:
swift// Primary colors
Background (top): Use solid color instead of gradient
  - Suggested: UIColor.systemBlue or custom #4A90E2 (static, not gradient)
  
Card background: UIColor.systemBackground (white in light mode, dark in dark mode)
Card shadow: Use subtle iOS elevation
  - Shadow: color=black, opacity=0.08, radius=16, offset=(0,8)

// Text colors
Primary text: UIColor.label (adapts to dark mode)
Secondary text: UIColor.secondaryLabel (gray that adapts to dark mode)
Tertiary text: UIColor.tertiaryLabel (lighter gray)

// Interactive colors
Links: UIColor.systemBlue (don't use custom blue)
Destructive: UIColor.systemRed (for "Reset / Clear")
Success: UIColor.systemGreen (for streak badge)

// Specific element colors
"1 Day Streak" badge:
  - Background: UIColor.systemOrange with 0.15 alpha
  - Border: UIColor.systemOrange
  - Icon + Text: UIColor.systemOrange (full opacity)

"Ready to read?" bubble:
  - Remove entirely OR
  - Redesign as subtle tooltip with systemGray6 background
```

**Fix specific instances:**

- **"Note: Please select one EPUB file at a time"**: Change from italic gray to Regular weight, secondaryLabel color
- **"Enter range (e.g. 1-10)..."**: Change to secondaryLabel color, Regular weight
- **"Select File"**: Use systemBlue (iOS link color)
- **"Reset / Clear"**: Use systemRed
- **"Change"**: Use systemBlue

---

### **3. MASCOT REDESIGN & PLACEMENT**

**Problem**: Echo is visually disconnected and feels like an afterthought.

**Solution**: Redesign mascot integration following these principles:

#### **Option A: Centered Mascot (Recommended)**
```
Layout structure:
┌─────────────────────────────┐
│   [Echo mascot centered]    │  ← Size: 120x120pt
│   Looking down at content   │
│                             │
│  "Audiobooks Mobile"        │  ← Title below mascot
│  🔥 1 Day Streak           │  ← Badge integrated into title area
├─────────────────────────────┤
│                             │
│  [White card content]       │
│   Step 1: Import Book       │
│   ...                       │
└─────────────────────────────┘
```

**Implementation details:**
- Echo size: 120x120pt (visible but not overwhelming)
- Position: Horizontally centered, 60pt from top of safe area
- Animation: Echo looks DOWN toward the card (use the "looking down" pose you generated)
- Remove the "Ready to read?" speech bubble entirely

#### **Option B: Inline Mascot (Alternative)**
```
Layout:
┌─────────────────────────────┐
│ [Echo 80x80] Audiobooks     │  ← Mascot inline with title
│              🔥 1 Day Streak│
├─────────────────────────────┤
│  [White card content]       │
└─────────────────────────────┘
Choose Option A - it gives Echo more personality and creates a clearer visual hierarchy.

4. LAYOUT & SPACING SYSTEM
Implement iOS 8pt grid system with proper spacing:
swift// Spacing constants (all multiples of 8)
let spacing = (
  xxs: 4,    // Tight spacing within grouped elements
  xs: 8,     // Minimum spacing
  sm: 16,    // Standard spacing between elements
  md: 24,    // Spacing between sections
  lg: 32,    // Large spacing
  xl: 40     // Extra large spacing
)
```

**Specific layout fixes:**

#### **Top Section:**
```
SafeArea top
  + 60pt
  = Echo mascot (centered, 120x120pt)
  + 16pt
  = "Audiobooks Mobile" (Title1, centered)
  + 8pt
  = "🔥 1 Day Streak" badge (centered below title)
  + 32pt
  = White card begins
```

#### **White Card Layout:**
```
Card padding: 20pt on all sides (not 16pt, use 20pt for better breathing room)

Inside card:
┌─ Step 1: Import Book ─────────────┐
│  + 8pt                             │
│  Note: Please select one EPUB...  │
│  + 16pt                            │
│  [Select File]    [Reset / Clear]  │
│  + 16pt                            │
│  Selected: Donna Tartt - ...       │  ← Remove this technical filename
│  + 8pt                             │
│  The Secret History                │  ← Clean title (Title2)
│  Donna Tartt                       │  ← Author (Body, secondary color)
├─ (24pt vertical spacing) ──────────┤
│  Step 2: Select Chapters           │
│  + 8pt                             │
│  Enter range (e.g. 1-10)...        │
│  + 12pt                            │
│  [Input field with placeholder]    │
│  + 8pt                             │
│  Will convert 17 of 17 chapters    │  ← Make this more prominent
├─ (24pt vertical spacing) ──────────┤
│  Step 3: Choose Narrator           │
│  + 12pt                            │
│  [Narrator selector]               │
│  Samantha              [Change]    │
│  + 8pt                             │
│  Tip: Download "Enhanced" voices...│
└────────────────────────────────────┘
  + 20pt
  = Bottom padding
```

**Important spacing rules:**
- Between step sections: 24pt (creates clear visual grouping)
- Between elements within a step: 8-16pt depending on relationship
- Card edges to content: 20pt consistent padding
- Text line height: Use iOS default (1.2x for headers, 1.4x for body)

---

### **5. SPECIFIC COMPONENT REDESIGNS**

#### **A. Book Title Display**

**Current (WRONG):**
```
Selected: Donna Tartt - The Secret History-Vintage (2004).epub
Tartt The Secret History
Donna Tartt
```

**Fixed (CORRECT):**
```
The Secret History          ← 22pt Bold, primary label
Donna Tartt                 ← 17pt Regular, secondary label
Implementation:
typescript// Parse EPUB metadata, never show filename
interface BookMetadata {
  title: string;        // "The Secret History"
  author: string;       // "Donna Tartt"
  // Don't display: fileName, publisher, year in this view
}

// Display logic
<View style={{ marginTop: 16 }}>
  <Text style={styles.bookTitle}>{book.title}</Text>
  <Text style={styles.bookAuthor}>{book.author}</Text>
</View>

const styles = StyleSheet.create({
  bookTitle: {
    fontSize: 22,
    fontWeight: '700',  // Bold
    color: 'label',     // iOS semantic color
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 17,
    fontWeight: '400',  // Regular
    color: 'secondaryLabel',
  },
});
B. Chapter Count Indicator
Current: Small blue text, easy to miss
Fixed: Prominent success indicator with icon
typescript// Make it more visible
<View style={styles.chapterCountContainer}>
  <Text style={styles.chapterCountIcon}>✓</Text>
  <Text style={styles.chapterCountText}>
    Will convert 17 of 17 chapters
  </Text>
</View>

const styles = StyleSheet.create({
  chapterCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',  // systemGreen with alpha
    borderRadius: 8,
  },
  chapterCountIcon: {
    fontSize: 17,
    marginRight: 8,
  },
  chapterCountText: {
    fontSize: 17,
    fontWeight: '600',  // Semibold
    color: 'systemGreen',
  },
});
C. "1 Day Streak" Badge
Current: Orange badge with flame emoji, cramped placement
Fixed: Better visual treatment
typescript<View style={styles.streakBadge}>
  <Text style={styles.streakEmoji}>🔥</Text>
  <Text style={styles.streakText}>1 Day Streak</Text>
</View>

const styles = StyleSheet.create({
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',  // Center below title
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 149, 0, 0.15)',  // systemOrange with low alpha
    borderRadius: 20,      // Fully rounded pill shape
    borderWidth: 1,
    borderColor: 'systemOrange',
    marginTop: 8,
  },
  streakEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  streakText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'systemOrange',
  },
});
D. Step Headers
Current: Not visually distinct enough
Fixed: Clear section headers
typescript<Text style={styles.stepHeader}>Step 1: Import Book</Text>

const styles = StyleSheet.create({
  stepHeader: {
    fontSize: 20,
    fontWeight: '600',    // Semibold
    color: 'label',
    marginBottom: 8,
  },
});
E. Input Field
Current: Generic text input
Fixed: iOS-native styled input
typescript<TextInput
  style={styles.chapterInput}
  placeholder="e.g. 1-5, 8"
  placeholderTextColor="tertiaryLabel"
  value={chapterRange}
  onChangeText={setChapterRange}
/>

const styles = StyleSheet.create({
  chapterInput: {
    fontSize: 17,
    fontWeight: '400',
    color: 'label',
    backgroundColor: 'systemGray6',  // iOS input background
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'separator',
  },
});

6. ACCESSIBILITY REQUIREMENTS
Must implement:

Dynamic Type Support

All text must scale with iOS system font size settings
Use fontSize: UIFont.TextStyle.body instead of hardcoded 17pt
Test with Settings > Accessibility > Larger Text enabled


VoiceOver Labels

swift   // Example
   Echo.accessibilityLabel = "Echo, your audiobook assistant"
   StreakBadge.accessibilityLabel = "1 day streak"
   ChapterInput.accessibilityLabel = "Enter chapter range"
   ChapterInput.accessibilityHint = "For example, 1 through 5, comma, 8"

Color Contrast

All text must meet WCAG AA standards (4.5:1 for normal text)
Test in both light and dark mode
Never use italic gray text for instructions (current violation)


Touch Targets

Minimum 44x44pt for all interactive elements
"Select File", "Change", "Reset/Clear" buttons must meet this




7. DARK MODE SUPPORT
Critical: App must support iOS dark mode
swift// Use semantic colors that adapt automatically
Background: systemBackground (white → black)
Card: secondarySystemBackground (light gray → dark gray)
Text: label (black → white)
Secondary text: secondaryLabel
Borders: separator

// Test appearance
Xcode > Environment Overrides > Toggle Appearance
All colors specified above using UIColor.system* will automatically adapt.

Implementation Priority
Phase 1: Critical Fixes (Ship This Week)

✅ Fix typography (SF Pro, correct sizes, remove italic)
✅ Fix color contrast (remove gray italic, use semantic colors)
✅ Clean book title display (remove filename)
✅ Improve spacing (8pt grid, 24pt between sections)
✅ Center Echo mascot with proper integration

Phase 2: Polish (Next Week)

✅ Implement proper iOS input styling
✅ Add dark mode support
✅ Improve chapter count indicator (green success badge)
✅ Add accessibility labels

Phase 3: Advanced (Month 2)

✅ Dynamic Type support
✅ Landscape layout optimization
✅ iPad layout (if supporting tablet)


Before/After Comparison
BEFORE (Current Issues):

❌ 40pt+ app title (too large)
❌ Italic gray instructions (poor readability)
❌ Filename displayed: "Donna Tartt - The Secret History-Vintage (2004).epub"
❌ Echo in corner with speech bubble (disconnected)
❌ Inconsistent spacing
❌ Custom blue colors (not iOS system blue)
❌ "Ready to read? 📖" bubble (amateur)

AFTER (Target State):

✅ 28pt app title (appropriate hierarchy)
✅ Regular weight instructions in readable color
✅ Clean display: "The Secret History" / "Donna Tartt"
✅ Echo centered, looking down at content (integrated)
✅ 8pt grid spacing system (24pt between sections)
✅ iOS system colors (proper blue, green, orange)
✅ No speech bubble (clean professional interface)


Code Implementation Template
typescript// Typography scale
const Typography = {
  largeTitle: { fontSize: 34, fontWeight: '700' as '700' },
  title1: { fontSize: 28, fontWeight: '700' as '700' },
  title2: { fontSize: 22, fontWeight: '700' as '700' },
  title3: { fontSize: 20, fontWeight: '600' as '600' },
  body: { fontSize: 17, fontWeight: '400' as '400' },
  callout: { fontSize: 16, fontWeight: '400' as '400' },
  subheadline: { fontSize: 15, fontWeight: '400' as '400' },
  footnote: { fontSize: 13, fontWeight: '400' as '400' },
};

// Spacing scale
const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 40,
};

// Apply to components
const styles = StyleSheet.create({
  appTitle: {
    ...Typography.title1,
    color: 'white',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  
  stepHeader: {
    ...Typography.title3,
    color: 'label',
    marginBottom: Spacing.xs,
  },
  
  instructionText: {
    ...Typography.subheadline,
    color: 'secondaryLabel',
    marginBottom: Spacing.sm,
  },
  
  bookTitle: {
    ...Typography.title2,
    color: 'label',
    marginBottom: 4,
  },
  
  bookAuthor: {
    ...Typography.body,
    color: 'secondaryLabel',
  },
});

Final Checklist for Developer
Before marking this complete, verify:

 All text uses SF Pro font family
 No italic text in UI instructions
 All font sizes match specification above
 Spacing follows 8pt grid (4, 8, 16, 24, 32, 40)
 Echo is centered, 120x120pt, looking down
 "Ready to read?" bubble is removed
 Book title shows clean metadata, not filename
 Colors use iOS semantic system (systemBlue, label, etc.)
 App works in dark mode
 All touch targets are minimum 44x44pt
 VoiceOver labels are implemented
 Layout tested on iPhone SE (small screen) and iPhone Pro Max (large screen)