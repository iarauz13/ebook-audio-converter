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

| **3.3 Mascot & Gamification** | **"Echo" the Fennec Fox**: \n- **Concept**: Interactive mascot (Duolingo-style) that reacts to user activity.\n- **Mechanics**: "Streak" tracking (days in a row).\n- **States**: Happy (listening), Sleepy (idle), Sad (broken streak).\n- **Widget**: Home Screen widget showing current streak and Echo's mood. | 0% | *New Idea* |
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

### [Legacy] Python CLI (Deprioritized)
*   **Status**: The Python CLI (`src/main.py`) remains useful as a **developer tool** or **backend service prototype** for the future "Cloud Generation" feature, but it is no longer the primary product delivery vehicle.