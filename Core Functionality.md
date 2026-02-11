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


 
 ## 6. Design System 2.0: Motion & Interaction (Phase 3 Roadmap)
 
 ### 6.1. Motion & Advanced Interactions
 **Goal**: Create a fluid, responsive interface that feels alive.
 
 #### A. File Import Transition
 *   **Current**: Instant file picker appearance.
 *   **Target**: 
     1.  Echo animation: Neutral → Looking Down (0.3s).
     2.  Card content fades out (0.2s).
     3.  File picker slides up from bottom with spring (0.4s, dampingRatio: 0.8).
 
 #### B. Chapter Selection State
 *   **Current**: Instant input update.
 *   **Target**: 
     1.  Typing "1-5, 8" triggers Echo "Thinking" pose (0.2s).
     2.  Debounce (0.5s).
     3.  Validation success triggers Echo "Happy" pose (0.2s).
     4.  Green badge "✓ Will convert X chapters" scales in (spring).
 
 #### C. Conversion Start
 *   **Current**: Instant screen change.
 *   **Target**: Echo "Celebrates" → Card zooms out → New screen slides in from right.
 
 ### 6.2. Empty State Illustrations
 **Goal**: Delight users even when there is no content.
 
 *   **Initial State**: Echo holding an open book ("Echo is ready for a new story").
 *   **Empty Library**: Echo sleeping on a bookshelf ("Your audiobook library is empty").
 *   **Conversion Complete**: Echo with headphones, eyes closed peacefuly ("Your audiobook is ready").
 
 ### 6.3. Variable Haptic Feedback
 **Goal**: Tactile reinforcement for all interactions.
 
 | Action | Haptic Type | Intensity |
 | :--- | :--- | :--- |
 | Typing Chapter | Light | Subtle |
 | Tap "Select File" | Medium | Standard |
 | Tap "Change" Narrator | Medium | Standard |
 | Tap "Reset/Clear" | Heavy | Warning |
 | Conversion Start | Heavy | Significant |
 | Conversion Complete | Success | Major |
 
 ### 6.4. Iconography Consistency
 **Goal**: Unified visual language using only SF Symbols.
 
 | Element | Current | Replace With (SF Symbol) |
 | :--- | :--- | :--- |
 | "Ready to read?" | 📖 Emoji | `book.fill` |
 | File Import | None | `arrow.down.doc.fill` |
 | Reset/Clear | None | `xmark.circle.fill` |
 | Narrator Change | Text | `person.crop.circle` |
 | Success Checkmark | "✓" Text | `checkmark.circle.fill` |

 ### 6.5. Earthy Color Palette (Rebranding)
 **Goal**: Replace standard iOS blue/red with a warm, "literary" earthy theme.

 **Brand Colors**:
 *   **Primary (#9EB23B)**: Olive Green (Actions, Links, Success).
 *   **Primary Light (#C7D36F)**: Light Olive (Highlights, Badges).
 *   **Neutral Light (#FCF9C6)**: Cream Yellow (Card Backgrounds, Inputs).
 *   **Neutral Base (#E0DECA)**: Sand Beige (Borders, Disabled).
 *   **Destructive (#A84855)**: Muted Burgundy (Reset, Delete, Error).

 **UI Element Mapping**:
 | Element | Current | New Color |
 | :--- | :--- | :--- |
 | "Select File" Button | `systemBlue` | **#9EB23B (Olive)** |
 | "Reset / Clear" Button | `systemRed` | **#A84855 (Burgundy)** |
 | Input Background | `systemGray6` | **#F5F3E8 (Warm Cream)** |
 | Card Background | `systemBackground` | **#FCF9C6 (Cream)** |
 | Streak Badge | `systemOrange` | **#C7D36F (Light Olive)** |
 | Shadows | Black/Gray | **Warm Tan** |