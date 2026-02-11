/**
 * Widget Data Bridge
 * 
 * Syncs streak, book, and listening data to shared UserDefaults
 * so the iOS widget can read it via App Groups.
 * 
 * In development (Expo Go), this is a no-op since App Groups
 * require native code signing. In production builds, this writes
 * to the shared UserDefaults suite "group.com.audiobooks.shared".
 * 
 * NOTE: This module requires `expo-modules-core` and a native
 * Swift module to actually write to UserDefaults. For now, we
 * provide the JS interface and data shape. The native module
 * will be connected during `npx expo prebuild`.
 */

import { Platform } from 'react-native';

// App Group identifier — must match app.json and expo-target.config.js
const APP_GROUP = 'group.com.audiobooks.shared';

export interface WidgetData {
  currentStreak: number;
  lastLoginDate: string;
  hasListenedToday: boolean;
  lastBookTitle: string;
  lastBookAuthor: string;
  currentChapter: number;
  totalChapters: number;
  totalListeningMinutes: number;
  booksCompleted: number;
  echoState: 'happy' | 'reading' | 'worried' | 'sad' | 'celebrating' | 'waving' | 'neutral';
}

/**
 * Try to import the native module. In Expo Go this will fail
 * gracefully since native modules aren't available.
 */
let NativeWidgetModule: any = null;

try {
  // This will be available after `npx expo prebuild` with the native module
  // For now, we use a try/catch to gracefully handle Expo Go
  if (Platform.OS === 'ios') {
    // Dynamic require — will be resolved at build time
    NativeWidgetModule = require('./WidgetDataNative').default;
  }
} catch (e) {
  // Expected in Expo Go — native module not available
  console.log('[WidgetBridge] Native module not available (Expo Go mode)');
}

/**
 * Sync widget data to shared UserDefaults.
 * No-op in Expo Go; writes to App Groups in production builds.
 */
export async function syncWidgetData(data: WidgetData): Promise<void> {
  if (Platform.OS !== 'ios') {
    return; // Widgets are iOS only
  }

  if (NativeWidgetModule) {
    try {
      await NativeWidgetModule.setWidgetData(data);
      await NativeWidgetModule.reloadWidgets();
      console.log('[WidgetBridge] Data synced to widget');
    } catch (e) {
      console.warn('[WidgetBridge] Failed to sync:', e);
    }
  } else {
    // In Expo Go, just log what would be synced
    if (__DEV__) {
      console.log('[WidgetBridge] Would sync (dev mode):', JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Force the widget to reload its timeline.
 * Call this when the app comes to the foreground.
 */
export async function reloadWidget(): Promise<void> {
  if (Platform.OS !== 'ios' || !NativeWidgetModule) return;

  try {
    await NativeWidgetModule.reloadWidgets();
  } catch (e) {
    console.warn('[WidgetBridge] Failed to reload:', e);
  }
}

/**
 * Helper to build WidgetData from app state.
 * Call this from checkStreak() and saveState() in App.tsx.
 */
export function buildWidgetData(params: {
  streak: number;
  lastLoginDate: string;
  bookTitle?: string;
  bookAuthor?: string;
  currentChapter?: number;
  totalChapters?: number;
  totalListeningMinutes?: number;
  booksCompleted?: number;
}): WidgetData {
  const today = new Date().toISOString().split('T')[0];
  const hasListenedToday = params.lastLoginDate === today;

  // Determine Echo state based on data
  let echoState: WidgetData['echoState'] = 'neutral';
  if (!params.bookTitle && params.streak === 0) {
    echoState = 'waving'; // New user
  } else if (params.streak === 0) {
    echoState = 'sad'; // Broken streak
  } else if (!hasListenedToday && params.streak > 0) {
    echoState = 'worried'; // Streak at risk
  } else if (!params.bookTitle && (params.booksCompleted || 0) > 0) {
    echoState = 'celebrating'; // Finished book
  } else if (hasListenedToday) {
    echoState = 'happy'; // Active and engaged
  } else {
    echoState = 'reading'; // Has a book, reading normally
  }

  return {
    currentStreak: params.streak,
    lastLoginDate: params.lastLoginDate,
    hasListenedToday,
    lastBookTitle: params.bookTitle || '',
    lastBookAuthor: params.bookAuthor || '',
    currentChapter: params.currentChapter || 0,
    totalChapters: params.totalChapters || 0,
    totalListeningMinutes: params.totalListeningMinutes || 0,
    booksCompleted: params.booksCompleted || 0,
    echoState,
  };
}
