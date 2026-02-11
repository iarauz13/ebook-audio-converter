import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Alert, ScrollView, TextInput, Modal, TouchableOpacity, FlatList, ActivityIndicator, Image, Animated, Easing, useColorScheme } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useState, useEffect, useRef, useMemo } from 'react';
import { parseEpub, Book } from './utils/epubParser';
import * as Speech from 'expo-speech';
import { intelligentChapterFilter } from './utils/chapterFilter';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Haptics } from './utils/haptics';
import { cleanTextForTTS } from './utils/textCleaner';
import { EDGE_VOICES, synthesizeEdgeTTS } from './utils/edgeTTS';
import { syncWidgetData, buildWidgetData, reloadWidget } from './utils/widgetBridge';

import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Platform, UIManager, LayoutAnimation } from 'react-native';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}
const STORAGE_KEY = 'audiobooks_app_state_v1';
const STREAK_KEY = 'audiobooks_streak_v1';
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';


// Design System Constants
// Design System Constants (iOS Redesign Phase 1)
const lightTheme = {
  colors: {
    background: '#FDFCF5', // (Neutral Base - warm off-white)
    card: '#FCF9C6',       // (Neutral Light - Cream)
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',      // label
      secondary: 'rgba(0, 0, 0, 0.55)',  // secondaryLabel
      tertiary: 'rgba(0, 0, 0, 0.30)',   // tertiaryLabel
      tint: '#9EB23B',         // (Primary - Olive Green)
      success: '#9EB23B',      // (Primary - Olive Green)
      warning: '#C7D36F',      // (Primary Light - Light Olive or Warm Tan #D4A574) - sticking to user preference for badge background
      destructive: '#A84855',  // (Destructive - Burgundy)
    },
    border: '#E0DECA', // (Neutral Base - Sand Beige)
    inputBackground: '#F5F3E8', // Slightly darker cream for inputs
    shadow: '#D4A574', // Warm Tan
  },
  typography: {
    largeTitle: { fontSize: 34, fontWeight: '700' as '700' },
    title1: { fontSize: 28, fontWeight: '700' as '700' },
    title2: { fontSize: 22, fontWeight: '700' as '700' },
    title3: { fontSize: 20, fontWeight: '600' as '600' },
    body: { fontSize: 17, fontWeight: '400' as '400' },
    subheadline: { fontSize: 15, fontWeight: '400' as '400' },
    caption1: { fontSize: 12, fontWeight: '400' as '400' },
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 40,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    round: 999,
  }
};

const darkTheme = {
  ...lightTheme,
  colors: {
    background: '#000000', // systemBlack
    card: '#1C1C1E',       // systemGray6 Dark
    text: {
      primary: '#FFFFFF',
      secondary: '#EBEBF599',
      tertiary: '#EBEBF54D',
      tint: '#9EB23B', // Keep Olive for brand consistency? Or lighten? Let's use Olive.
      success: '#9EB23B',
      warning: '#C7D36F',
      destructive: '#FF453A', // Keep standard Red for dark mode visibility or Burgundy? Burgundy might be too dark. User said #A84855.
    },
    border: '#38383A',
    inputBackground: '#1C1C1E', // Dark input
    shadow: '#000000',
  }
};

// Reusable iOS-style Button Component
const IOSButton = ({ title, icon, onPress, variant = 'primary', style, textStyle, disabled, accessibilityLabel, theme }: { title: string, icon?: SymbolViewProps['name'], onPress: () => void, variant?: 'primary' | 'secondary' | 'destructive' | 'success' | 'outline', style?: any, textStyle?: any, disabled?: boolean, accessibilityLabel?: string, theme: typeof lightTheme }) => {
  let backgroundColor = theme.colors.text.tint;
  let textColor = '#FFFFFF';
  let borderWidth = 0;
  let borderColor = 'transparent';

  switch (variant) {
    case 'secondary':
      // Hover/Pressed is Primary Light (#C7D36F) but for Secondary Variant let's use Neutral Base (#E0DECA) if light theme
      backgroundColor = theme.colors.background === '#000000' ? '#2C2C2E' : '#E0DECA';
      textColor = theme.colors.text.primary; // Dark text for contrast on Sand
      break;
    case 'destructive':
      backgroundColor = theme.colors.text.destructive;
      textColor = '#FFFFFF';
      break;
    case 'success':
      backgroundColor = theme.colors.text.success;
      textColor = '#FFFFFF';
      break;
    case 'outline':
      backgroundColor = 'transparent';
      textColor = theme.colors.text.tint;
      borderWidth = 1;
      borderColor = theme.colors.text.tint;
      break;
  }

  if (disabled) {
    backgroundColor = theme.colors.text.tertiary; // Use theme color
    textColor = theme.colors.text.secondary;
  }

  return (
    <TouchableOpacity
      onPress={() => {
        if (!disabled) {
          if (variant === 'destructive') Haptics.warning();
          else if (variant === 'secondary') Haptics.medium();
          else Haptics.medium(); // Default
        }
        onPress();
      }}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      style={[
        {
          backgroundColor,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: theme.borderRadius.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth,
          borderColor,
          flexDirection: 'row', // Align icon and text
          gap: 8,
          opacity: disabled ? 0.6 : 1,
        },
        style
      ]}
    >
      {icon && <SymbolView name={icon} tintColor={textColor} style={{ width: 20, height: 20 }} />}
      <Text style={[{ color: textColor, fontWeight: '600', fontSize: 17 }, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
};



export default function App() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const styles = useMemo(() => getStyles(theme), [theme]);

  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [parsing, setParsing] = useState(false);
  const [playingChapter, setPlayingChapter] = useState<number | null>(null);
  const [rangeText, setRangeText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [conversionStatus, setConversionStatus] = useState("");
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);

  // Voice State
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Speech.Voice | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Cloud Voice State (Edge TTS)
  const [voiceType, setVoiceType] = useState<'offline' | 'cloud'>('offline');
  const [selectedEdgeVoice, setSelectedEdgeVoice] = useState(EDGE_VOICES[0]);
  const cloudAudioRef = useRef<Audio.Sound | null>(null);
  const [isCloudSynthesizing, setIsCloudSynthesizing] = useState(false);

  // Persistence State
  const [isRestoring, setIsRestoring] = useState(true);

  // Gamification / Mascot
  const [streak, setStreak] = useState(0);

  // Video Refs & State
  const videoRef = useRef<Video>(null);
  const checkActivityTimeout = useRef<NodeJS.Timeout | null>(null);
  const [videoSource, setVideoSource] = useState(require('./assets/Echo_Neutral_2.mp4'));
  const [mascotState, setMascotState] = useState<'neutral' | 'reading' | 'celebrate' | 'sleeping_transition' | 'sleeping_loop' | 'thinking' | 'happy'>('neutral');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);





  // Activity Monitor
  const resetInactivityTimer = () => {
    if (checkActivityTimeout.current) clearTimeout(checkActivityTimeout.current);

    // If we were sleeping, wake up!
    if (mascotState === 'sleeping_transition' || mascotState === 'sleeping_loop') {
      setMascotAction('neutral');
    }

    checkActivityTimeout.current = setTimeout(() => {
      setMascotAction('sleeping_transition');
    }, INACTIVITY_TIMEOUT_MS);
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => { if (checkActivityTimeout.current) clearTimeout(checkActivityTimeout.current); };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      // 1. Load Voices
      let available: Speech.Voice[] = [];
      try {
        available = await Speech.getAvailableVoicesAsync();
        const noveltyVoices = new Set([
          'Agnes', 'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
          'Deranged', 'Good News', 'Hysterical', 'Junior', 'Kathy', 'Pipe Organ',
          'Princess', 'Ralph', 'Trinoids', 'Whisper', 'Zarvox', 'Wobble', 'Jester', 'Organ'
        ]);

        const english = available
          .filter(v => v.language.startsWith('en') && !noveltyVoices.has(v.name))
          .sort((a, b) => a.name.localeCompare(b.name));

        // DEBUG: Log all voices to find "Enhanced" or "Premium" identifiers
        console.log("=== AVAILABLE VOICES DEBUG ===");
        english.forEach(v => console.log(`${v.name} (${v.identifier}) - Quality: ${v.quality}`));
        console.log("=== END VOICE DEBUG ===");

        setVoices(english);

        // 2. Load Persisted State
        try {
          const savedState = await AsyncStorage.getItem(STORAGE_KEY);
          if (savedState) {
            const state = JSON.parse(savedState);
            console.log("Found saved state:", state);

            // Restore Voice
            if (state.voiceIdentifier) {
              const restoredVoice = english.find(v => v.identifier === state.voiceIdentifier);
              if (restoredVoice) setSelectedVoice(restoredVoice);
              else setSelectedVoice(english.find(v => v.name === 'Samantha') || english[0]);
            } else {
              setSelectedVoice(english.find(v => v.name === 'Samantha') || english[0]);
            }

            // Restore Book if exists
            if (state.bookUri) {
              const fileInfo = await FileSystem.getInfoAsync(state.bookUri);
              if (fileInfo.exists) {
                setParsing(true);
                // Mock file object (PDF or EPUB)
                setSelectedFile({
                  name: state.bookName || "Restored Book",
                  uri: state.bookUri,
                  mimeType: state.isPdf ? 'application/pdf' : 'application/epub+zip'
                } as any);

                try {
                  let parsedBook: Book;
                  if (state.isPdf) {
                    // Simulated PDF restore
                    parsedBook = {
                      title: (state.bookName || "Restored PDF").replace('.pdf', ''),
                      author: "Unknown Author",
                      chapters: Array.from({ length: 5 }, (_, i) => ({
                        title: `Page ${i + 1}`,
                        fileName: `page_${i + 1}.txt`,
                        content: `Restored PDF content page ${i + 1}.`
                      }))
                    };
                  } else {
                    parsedBook = await parseEpub(state.bookUri);
                  }
                  setBook(parsedBook);

                  if (state.lastChapterIndex !== undefined) {
                    console.log("Restored to chapter:", state.lastChapterIndex);
                  }
                } catch (e) {
                  console.error("Failed to restore book:", e);
                  Alert.alert("Restore Error", "Could not load the previous book.");
                  await AsyncStorage.removeItem(STORAGE_KEY);
                } finally {
                  setParsing(false);
                }
              }
            }
          } else {
            if (english.length > 0) {
              setSelectedVoice(english.find(v => v.name === 'Samantha') || english[0]);
            }
          }

          // 3. Check Streak
          await checkStreak();

        } catch (e) {
          console.error("Failed to load state", e);
        }
      } catch (e) {
        console.log("Failed to init", e);
      } finally {
        setIsRestoring(false);
      }
    };

    initialize();
  }, []);

  const checkStreak = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const json = await AsyncStorage.getItem(STREAK_KEY);
      let data = json ? JSON.parse(json) : { currentStreak: 0, lastLoginDate: null };

      if (data.lastLoginDate === today) {
        // Already logged in today
        setStreak(data.currentStreak);
        return;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (data.lastLoginDate === yesterdayStr) {
        // Consecutive day
        data.currentStreak += 1;
      } else {
        // Streak broken or new user
        data.currentStreak = 1;
      }

      data.lastLoginDate = today;
      setStreak(data.currentStreak);
      await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));

      // Sync to widget
      syncWidgetData(buildWidgetData({
        streak: data.currentStreak,
        lastLoginDate: today,
        bookTitle: book?.title || undefined,
      }));

    } catch (e) {
      console.error("Streak check failed", e);
    }
  };

  // Save State Logic
  const saveState = async (updates: any) => {
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEY);
      const prevState = current ? JSON.parse(current) : {};
      const newState = { ...prevState, ...updates };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newState));

      // Sync book data to widget
      if (updates.bookTitle || updates.lastChapterIndex) {
        const streakJson = await AsyncStorage.getItem(STREAK_KEY);
        const streakData = streakJson ? JSON.parse(streakJson) : { currentStreak: 0, lastLoginDate: '' };
        syncWidgetData(buildWidgetData({
          streak: streakData.currentStreak,
          lastLoginDate: streakData.lastLoginDate || '',
          bookTitle: newState.bookTitle || undefined,
          currentChapter: (newState.lastChapterIndex || 0) + 1,
          totalChapters: newState.totalChapters || 0,
        }));
      }
    } catch (e) {
      console.error("Failed to save state", e);
    }
  };

  // Update voice preference when changed
  useEffect(() => {
    if (selectedVoice) {
      saveState({ voiceIdentifier: selectedVoice.identifier });
    }
  }, [selectedVoice]);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/epub+zip'], // Filter for EPUBs and PDFs
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('File picked:', file);

        // Animate transition
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

        setSelectedFile(file);
        setGeneratedPath(null); // Reset previous conversion
        setConversionStatus("");
        setIsConverting(false);
        setProgress(0);
        setMascotAction('reading'); // Echo reads the new bookfile

        // Determine extension
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const ext = isPdf ? '.pdf' : '.epub';

        // COPY to permanent storage
        const permanentUri = FileSystem.documentDirectory + 'current_book' + ext;
        try {
          await FileSystem.copyAsync({
            from: file.uri,
            to: permanentUri
          });
        } catch (e) {
          console.warn("File copy warning (might already exist, overwriting):", e);
          try {
            await FileSystem.deleteAsync(permanentUri, { idempotent: true });
            await FileSystem.copyAsync({ from: file.uri, to: permanentUri });
          } catch (err) {
            console.error("Critical copy error", err);
            Alert.alert("Error", "Could not save book file.");
            return;
          }
        }

        const persistentFile = { ...file, uri: permanentUri, mimeType: isPdf ? 'application/pdf' : 'application/epub+zip' };

        setSelectedFile(persistentFile);
        setBook(null); // Clear previous book
        setRangeText("");
        setGeneratedPath(null);
        setConversionStatus("");
        setIsConverting(false);
        setProgress(0);

        // Save to Persistence
        saveState({ bookUri: permanentUri, bookName: file.name, lastChapterIndex: 0, isPdf });

        // Start Parsing
        setParsing(true);
        try {
          let parsedBook: Book;
          if (isPdf) {
            // Simulaton:
            await new Promise(r => setTimeout(r, 1000));
            parsedBook = {
              title: file.name.replace('.pdf', ''),
              author: "Unknown Author",
              chapters: Array.from({ length: 5 }, (_, i) => ({
                title: `Page ${i + 1}`,
                fileName: `page_${i + 1}.txt`,
                content: `This is the simulated content for Page ${i + 1} of the PDF. Real PDF text extraction requires adding native modules which might require a rebuild.`
              }))
            };
          } else {
            parsedBook = await parseEpub(permanentUri);

            // Apply Intelligent Filtering (for logging/debugging only now)
            // We do NOT auto-fill the range text anymore as per user request.
            const filteredChapters = intelligentChapterFilter(parsedBook);

            // Log for debugging
            const includedCount = filteredChapters.filter(ch => ch.shouldInclude).length;
            const excludedCount = filteredChapters.length - includedCount;
            if (excludedCount > 0) {
              console.log(`Filter suggests excluding ${excludedCount} chapters.`);
            }

            // setRangeText(includedIndices.join(', ')); // DISABLED
          }
          setBook(parsedBook);
        } catch (e) {
          console.error('Parsing error:', e);
          Alert.alert("Error", "Failed to parse file. Is it valid?");
        } finally {
          setParsing(false);
        }
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert("Error", "Failed to pick document");
    }
  };

  const stopCloudAudio = async () => {
    if (cloudAudioRef.current) {
      try {
        await cloudAudioRef.current.stopAsync();
        await cloudAudioRef.current.unloadAsync();
      } catch (e) { /* ignore */ }
      cloudAudioRef.current = null;
    }
  };

  const speakChapter = async (chapter: any, index: number) => {
    // Save progress
    saveState({ lastChapterIndex: index });

    // If clicking the same chapter, stop it
    if (playingChapter === index) {
      Speech.stop();
      await stopCloudAudio();
      setPlayingChapter(null);
      setMascotAction('neutral');
      return;
    }

    // Stop previous and play new
    Speech.stop();
    await stopCloudAudio();
    setPlayingChapter(index);
    setMascotAction('reading');

    const rawText = chapter.content || "No content found in this chapter.";
    const cleanedText = cleanTextForTTS(rawText);

    console.log("=== CLEANED TEXT ===");
    console.log(cleanedText.substring(0, 300));
    console.log(`=== Voice Type: ${voiceType} ===`);

    if (voiceType === 'cloud') {
      // ── Cloud Voice (Edge TTS) ──
      setIsCloudSynthesizing(true);
      try {
        const mp3Uri = await synthesizeEdgeTTS(cleanedText, selectedEdgeVoice.identifier);
        setIsCloudSynthesizing(false);

        const { sound } = await Audio.Sound.createAsync(
          { uri: mp3Uri },
          { shouldPlay: true }
        );
        cloudAudioRef.current = sound;

        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            setPlayingChapter(null);
            setMascotAction('neutral');
            sound.unloadAsync();
            cloudAudioRef.current = null;
          }
        });
      } catch (e) {
        console.error('[EdgeTTS] Playback error:', e);
        setIsCloudSynthesizing(false);
        setPlayingChapter(null);
        setMascotAction('neutral');
        Alert.alert('Cloud Voice Error', 'Failed to synthesize audio. Check your WiFi connection.');
      }
    } else {
      // ── Offline Voice (Apple TTS) ──
      Speech.speak(cleanedText, {
        rate: 0.85,
        voice: selectedVoice?.identifier,
        onDone: () => {
          setPlayingChapter(null);
          setMascotAction('neutral');
        },
        onStopped: () => {
          setPlayingChapter(null);
          setMascotAction('neutral');
        },
      });
    }
  };

  const setMascotAction = (action: 'reading' | 'neutral' | 'celebrate' | 'sleeping_transition' | 'sleeping_loop' | 'thinking' | 'happy') => {
    setMascotState(action);
    switch (action) {
      case 'reading':
        setVideoSource(require('./assets/Echo_Looking_Down.mp4'));
        break;
      case 'celebrate':
        setVideoSource(require('./assets/Echo_Celebrating.mp4'));
        break;
      case 'sleeping_transition':
        setVideoSource(require('./assets/Echo_Sleeping_Inactive.mp4'));
        break;
      case 'sleeping_loop':
        setVideoSource(require('./assets/Echo_Sleeping_2.mp4'));
        break;
      case 'thinking':
        setVideoSource(require('./assets/Echo_Thinking.mp4'));
        break;
      case 'happy':
        // Reuse celebrate or use a specific happy one if available. 
        // Using celebrate for now as requested "Echo switches to 'happy' pose" 
        // and user mapped "happy" to "Echo_Looking_Left" or "Echo_Celebrating" in plan.
        setVideoSource(require('./assets/Echo_Celebrating.mp4'));
        break;
      case 'neutral':
      default:
        setVideoSource(require('./assets/Echo_Neutral_2.mp4'));
        break;
    }
  };

  const previewVoice = async (voice: Speech.Voice) => {
    Speech.stop();
    await stopCloudAudio();
    Speech.speak(`Hello, I am ${voice.name}. This is a preview.`, {
      voice: voice.identifier,
      rate: 0.85
    });
  };

  const previewEdgeVoice = async (voice: typeof EDGE_VOICES[0]) => {
    Speech.stop();
    await stopCloudAudio();
    setIsCloudSynthesizing(true);
    try {
      const mp3Uri = await synthesizeEdgeTTS(
        `Hello, I am ${voice.name}. This is a preview of the cloud voice.`,
        voice.identifier
      );
      setIsCloudSynthesizing(false);
      const { sound } = await Audio.Sound.createAsync(
        { uri: mp3Uri },
        { shouldPlay: true }
      );
      cloudAudioRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
          cloudAudioRef.current = null;
        }
      });
    } catch (e) {
      setIsCloudSynthesizing(false);
      console.error('[EdgeTTS] Preview error:', e);
      Alert.alert('Preview Error', 'Could not preview cloud voice. Check WiFi.');
    }
  };

  const handleMascotTap = () => {
    resetInactivityTimer(); // Reset sleep timer on interaction
    if (mascotState === 'celebrate') return; // Already celebrating

    // Play celebration
    setMascotAction('celebrate');
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish) {
      // If we just finished celebrating, go back to neutral
      if (mascotState === 'celebrate') {
        setMascotAction('neutral');
      }
      // If we finished transition to sleep, start loop
      if (mascotState === 'sleeping_transition') {
        setMascotAction('sleeping_loop');
      }
    }
  };

  const getSelectedIndices = (): number[] => {
    if (!book) return [];
    if (!rangeText.trim()) return book.chapters.map((_, i) => i); // Default to all

    // Simple parser for "1-5, 8"
    const indices: number[] = [];
    const parts = rangeText.split(',');
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) indices.push(i - 1);
        }
      } else {
        const idx = parseInt(part.trim());
        if (!isNaN(idx)) indices.push(idx - 1);
      }
    }
    // Filter valid (0 <= i < total) and remove duplicates
    return Array.from(new Set(indices.filter(i => i >= 0 && i < book.chapters.length))).sort((a, b) => a - b);
  };

  const startConversion = async () => {
    const selectedIndices = getSelectedIndices();
    if (selectedIndices.length === 0) {
      Alert.alert("Invalid Selection", "Please check your chapter range.");
      return;
    }
    if (!book) {
      Alert.alert("Error", "No book loaded for conversion.");
      return;
    }

    setIsConverting(true);
    setProgress(0);
    setConversionStatus("Initializing...");
    setGeneratedPath(null);

    // Simulate Conversion / Saving to Library
    const storagePath = FileSystem.documentDirectory + "Audiobooks/" + book.title.replace(/[^a-z0-9]/gi, '_');

    try {
      await FileSystem.makeDirectoryAsync(storagePath, { intermediates: true });
    } catch (e) {
      console.error("Failed to create directory:", e);
      Alert.alert("Error", "Failed to create storage directory.");
      setIsConverting(false);
      return;
    }

    for (let i = 0; i < selectedIndices.length; i++) {
      const chapterIdx = selectedIndices[i];
      const chapter = book.chapters[chapterIdx];

      setConversionStatus(`Converting Chapter ${chapterIdx + 1}: ${chapter.title.substring(0, 20)}...`);

      // Simulate processing time (e.g. cleaning text, saving to specific file)
      // In a real app, we might create a specific JSON or text file for this chapter
      await new Promise(r => setTimeout(r, 500));

      // Save dummy chapter text logic
      const cleanedChapterContent = cleanTextForTTS(chapter.content || "");
      await FileSystem.writeAsStringAsync(`${storagePath}/Chapter ${chapterIdx + 1} - ${chapter.title.replace(/[^a-z0-9]/gi, '')}.txt`, cleanedChapterContent);

      setProgress((i + 1) / selectedIndices.length);
    }

    // Create a manifest file to verify completion
    const manifestContent = `Book: ${book.title}\nAuthor: ${book.author}\nVoice: ${selectedVoice?.name}\nChapters Converted: ${selectedIndices.length}\nDate: ${new Date().toISOString()}`;
    const manifestPath = `${storagePath}/manifest.txt`;
    await FileSystem.writeAsStringAsync(manifestPath, manifestContent);

    setGeneratedPath(manifestPath); // For sharing a single file example

    setConversionStatus("Done!");
    Alert.alert("Conversion Complete", `Saved to: ${storagePath}`);
    setIsConverting(false);
  };

  const shareAudiobook = async () => {
    if (!generatedPath) return;

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert("Sharing not available", "Sharing is not available on this platform");
      return;
    }

    try {
      await Sharing.shareAsync(generatedPath);
    } catch (e) {
      console.error("Share error:", e);
    }
  };

  if (isRestoring) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.text.tint} />
        <Text style={{ marginTop: theme.spacing.md, ...theme.typography.body, color: theme.colors.text.secondary }}>Loading Library...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollContent}>

            {/* Mascot / Header Section */}
            {/* Mascot / Header Section */}
            <View style={styles.mascotContainer}>
              <TouchableOpacity
                onPress={handleMascotTap}
                activeOpacity={0.8}
                style={styles.mascotContainerWrapper}
              >
                <Video
                  ref={videoRef}
                  style={{ width: '100%', height: '100%' }}
                  source={videoSource}
                  useNativeControls={false}
                  resizeMode={ResizeMode.COVER}
                  isLooping={['neutral', 'reading', 'sleeping_loop', 'thinking'].includes(mascotState)}
                  shouldPlay={true}
                  isMuted={true}
                  onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                />
              </TouchableOpacity>

              <Text style={styles.title}>Audiobooks to Go</Text>

              <View style={styles.streakBadge}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <SymbolView name="flame.fill" tintColor="#3C3C43" style={{ width: 16, height: 16, marginRight: 6 }} />
                  <Text style={styles.streakText}>{streak} Day Streak</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Step 1: Import Book</Text>

              {!selectedFile ? (
                <View style={{ alignItems: 'center', marginVertical: 20 }}>
                  <Image
                    source={require('./assets/Echo_Holding_Book.png')}
                    style={{ width: 140, height: 140, marginBottom: 16 }}
                    resizeMode="contain"
                  />
                  <Text style={{ ...theme.typography.title3, color: theme.colors.text.primary, textAlign: 'center', marginBottom: 4 }}>
                    Echo is ready for a new story
                  </Text>
                  <Text style={{ ...theme.typography.body, color: theme.colors.text.secondary, textAlign: 'center', marginBottom: 24 }}>
                    Tap below to import your EPUB
                  </Text>
                  <IOSButton title="Select File" icon="arrow.down.doc.fill" onPress={pickDocument} theme={theme} />
                </View>
              ) : (
                <>
                  <Text style={styles.helperText}>Note: Please select one EPUB file at a time.</Text>
                  <View style={{ gap: theme.spacing.md }}>
                    <IOSButton title="Select File" icon="arrow.down.doc.fill" onPress={pickDocument} theme={theme} />
                    <IOSButton title="Reset / Clear" icon="xmark.circle.fill" onPress={async () => {
                      Haptics.heavy(); // Heavy for reset
                      setSelectedFile(null);
                      setBook(null);
                      setRangeText("");
                      setMascotAction('neutral');
                      setGeneratedPath(null);
                      setConversionStatus("");
                      setIsConverting(false);
                      setProgress(0);
                      // Clear State
                      await AsyncStorage.removeItem(STORAGE_KEY);
                    }} variant="destructive" theme={theme} />
                  </View>
                </>
              )}

              {parsing && <Text style={styles.status}>Parsing File...</Text>}

              {
                selectedFile && book && (
                  <View style={styles.fileInfo}>
                    {selectedFile.name.toLowerCase().endsWith('.pdf') && (
                      <View style={{ backgroundColor: theme.colors.text.warning + '20', padding: theme.spacing.md, borderRadius: theme.borderRadius.sm, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md, width: '100%' }}>
                        <Text style={{ ...theme.typography.caption1, fontWeight: 'bold', color: theme.colors.text.warning }}>⚠️ PDF Mode (Experimental)</Text>
                        <Text style={{ ...theme.typography.caption1, color: theme.colors.text.warning }}>Pages are treated as chapters. Text extraction may be imperfect for scanned documents.</Text>
                      </View>
                    )}
                    <View style={styles.bookInfo}>
                      <Text style={styles.bookTitle}>{book.title.replace(/\.pd[f]$/i, '').replace(/\.epub$/i, '')}</Text>
                      <Text style={styles.bookAuthor}>{book.author}</Text>

                      {/* Step 2: Selection */}
                      <Text style={styles.sectionHeader}>Step 2: Select {selectedFile.name.toLowerCase().endsWith('.pdf') ? 'Pages' : 'Chapters'}</Text>
                      <Text style={styles.helperText}>Enter range (e.g. 1-10). Check "Chapter Index" below for titles.</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 1-5, 8"
                        placeholderTextColor={theme.colors.text.secondary}
                        value={rangeText}
                        onChangeText={(text) => {
                          Haptics.light();
                          setRangeText(text);

                          // Motion Logic: Typing -> Thinking
                          setMascotAction('thinking');

                          if (debounceTimer.current) clearTimeout(debounceTimer.current);
                          debounceTimer.current = setTimeout(() => {
                            // Validation simulation (if text has content)
                            if (text.length > 0) {
                              setMascotAction('happy');
                              // After a brief happy moment, go back to neutral or stay happy?
                              // Let's stay happy until blur or change? Or just happy for 2s then neutral.
                              setTimeout(() => setMascotAction('neutral'), 2000);
                            } else {
                              setMascotAction('neutral');
                            }
                          }, 800);
                        }}
                        keyboardType="numbers-and-punctuation"
                        accessibilityLabel="Chapter Range Input"
                        accessibilityHint="Enter chapter numbers or ranges to convert"
                      />
                      <Text style={styles.previewText}>
                        Will convert {getSelectedIndices().length} of {book.chapters.length} chapters
                      </Text>

                      {/* Step 3: Voice Selection */}
                      <Text style={styles.sectionHeader}>Step 3: Choose Narrator</Text>
                      {/* Voice Type Toggle */}
                      <View style={{ flexDirection: 'row', marginBottom: theme.spacing.sm, gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => setVoiceType('offline')}
                          style={{
                            flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.md,
                            backgroundColor: voiceType === 'offline' ? theme.colors.text.tint : theme.colors.inputBackground,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontWeight: '600', fontSize: 14, color: voiceType === 'offline' ? '#fff' : theme.colors.text.primary }}>📱 Offline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setVoiceType('cloud')}
                          style={{
                            flex: 1, paddingVertical: 10, borderRadius: theme.borderRadius.md,
                            backgroundColor: voiceType === 'cloud' ? theme.colors.text.tint : theme.colors.inputBackground,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontWeight: '600', fontSize: 14, color: voiceType === 'cloud' ? '#fff' : theme.colors.text.primary }}>☁️ Cloud (HD)</Text>
                        </TouchableOpacity>
                      </View>

                      {voiceType === 'offline' ? (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md, backgroundColor: theme.colors.background, padding: theme.spacing.md, borderRadius: theme.borderRadius.md }}>
                            <Text numberOfLines={1} style={{ flex: 1, marginRight: theme.spacing.md, ...theme.typography.body }}>{selectedVoice ? selectedVoice.name : "Default"}</Text>
                            <IOSButton title="Change" onPress={() => setShowVoiceModal(true)} variant="secondary" style={{ paddingVertical: 6, paddingHorizontal: 12 }} textStyle={{ fontSize: 15 }} theme={theme} />
                          </View>
                          <Text style={styles.helperText}>Tip: Download "Enhanced" voices in iOS Settings &gt; Accessibility &gt; Spoken Content.</Text>
                          {selectedVoice && <View style={{ marginBottom: 15 }}><IOSButton title={`Preview ${selectedVoice.name}`} onPress={() => previewVoice(selectedVoice)} variant="outline" theme={theme} /></View>}
                        </>
                      ) : (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md, backgroundColor: theme.colors.background, padding: theme.spacing.md, borderRadius: theme.borderRadius.md }}>
                            <Text numberOfLines={1} style={{ flex: 1, marginRight: theme.spacing.md, ...theme.typography.body }}>{selectedEdgeVoice.name}</Text>
                            <IOSButton title="Change" onPress={() => setShowVoiceModal(true)} variant="secondary" style={{ paddingVertical: 6, paddingHorizontal: 12 }} textStyle={{ fontSize: 15 }} theme={theme} />
                          </View>
                          <Text style={[styles.helperText, { color: theme.colors.text.warning }]}>⚠️ WiFi required for cloud voices.</Text>
                          {isCloudSynthesizing && <ActivityIndicator style={{ marginVertical: 8 }} />}
                          <View style={{ marginBottom: 15 }}>
                            <IOSButton
                              title={`Preview ${selectedEdgeVoice.name}`}
                              onPress={() => previewEdgeVoice(selectedEdgeVoice)}
                              variant="outline"
                              disabled={isCloudSynthesizing}
                              theme={theme}
                            />
                          </View>
                        </>
                      )}

                      {/* Step 4: Storage & Convert */}
                      <Text style={styles.sectionHeader}>Step 4: Convert</Text>
                      <Text style={styles.storageText}>
                        Saving to: {FileSystem.documentDirectory}Audiobooks/
                      </Text>

                      {isConverting ? (
                        <View style={styles.progressContainer}>
                          <Text style={styles.status}>{conversionStatus}</Text>
                          <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                          </View>
                          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
                        </View>
                      ) : (
                        <View style={{ gap: 10 }}>
                          <IOSButton title="Convert & Save" icon="waveform.circle.fill" onPress={() => { Haptics.heavy(); startConversion(); }} theme={theme} />
                          {generatedPath && (
                            <IOSButton title="Share / Export" icon="square.and.arrow.up" onPress={shareAudiobook} variant="success" theme={theme} />
                          )}
                        </View>
                      )}
                    </View>

                    {/* Chapter List Preview */}
                    <Text style={[styles.sectionHeader, { marginTop: 20 }]}>Chapter Index</Text>
                    <Text style={[styles.helperText, { marginBottom: 10 }]}>
                      Use these <Text style={{ fontWeight: 'bold' }}># numbers</Text> in Step 2 above.
                    </Text>
                    <View style={styles.chapterList}>
                      <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                        {book.chapters.map((c, i) => (
                          <View key={i} style={styles.chapterRow}>
                            <Text style={[styles.chapterItem, { flex: 1 }]}>
                              <Text style={{ fontWeight: 'bold' }}>#{i + 1}</Text> - {c.title}
                            </Text>
                            <TouchableOpacity onPress={() => speakChapter(c, i)}>
                              <Text style={{ color: playingChapter === i ? 'red' : '#007AFF', fontWeight: 'bold' }}>
                                {playingChapter === i ? "Stop" : "Play"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )
              }
            </View>
          </ScrollView>

          {/* Voice Picker Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={showVoiceModal}
            onRequestClose={() => setShowVoiceModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  {voiceType === 'cloud' ? '☁️ Cloud Voices' : '📱 Offline Voices'}
                </Text>

                {voiceType === 'cloud' ? (
                  /* ── Cloud Voices List ── */
                  <FlatList
                    data={EDGE_VOICES}
                    keyExtractor={(item) => item.identifier}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.voiceItem, selectedEdgeVoice?.identifier === item.identifier && styles.selectedVoiceItem]}
                        onPress={() => {
                          setSelectedEdgeVoice(item);
                          setShowVoiceModal(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.voiceName}>{item.name}</Text>
                          <Text style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>{item.language} · Neural</Text>
                        </View>
                        <TouchableOpacity onPress={() => previewEdgeVoice(item)} style={{ padding: 5 }}>
                          <Text style={{ color: '#007AFF' }}>{isCloudSynthesizing ? '...' : 'Test'}</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    )}
                  />
                ) : (
                  /* ── Offline Voices List ── */
                  <FlatList
                    data={voices}
                    keyExtractor={(item) => item.identifier}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.voiceItem, selectedVoice?.identifier === item.identifier && styles.selectedVoiceItem]}
                        onPress={() => {
                          setSelectedVoice(item);
                          setShowVoiceModal(false);
                        }}
                      >
                        <Text style={styles.voiceName}>{item.name}</Text>
                        <TouchableOpacity onPress={() => previewVoice(item)} style={{ padding: 5 }}>
                          <Text style={{ color: '#007AFF' }}>Test</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    )}
                  />
                )}

                {/* Chapter Count Indicator */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 8,
                  padding: 12,
                  backgroundColor: theme.colors.text.warning + '26',
                  borderRadius: 8,
                }}>
                  <SymbolView name="checkmark.circle.fill" tintColor={theme.colors.text.tint} style={{ width: 20, height: 20, marginRight: 8 }} />
                  <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text.tint }}>
                    Will convert {book?.chapters.length || 0} chapters
                  </Text>
                </View>
                <View style={{ marginTop: theme.spacing.md }}>
                  <IOSButton title="Close" onPress={() => setShowVoiceModal(false)} variant="secondary" theme={theme} />
                </View>
              </View>
            </View>
          </Modal>

        </SafeAreaView>
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}

const getStyles = (theme: typeof lightTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: theme.spacing.lg,
    paddingBottom: 50,
  },
  // Mascot Styles
  mascotContainerWrapper: {
    width: 120,
    height: 120,
    borderRadius: theme.borderRadius.round,
    // borderWidth: 2, // Removed border for cleaner look
    // borderColor: theme.colors.text.secondary, 
    marginBottom: theme.spacing.xs,
    backgroundColor: '#000',
    overflow: 'hidden', // Clip video content
  },
  mascotContainer: {
    flexDirection: 'column', // Centered layout
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: theme.spacing.lg,
    marginTop: 60, // 60pt top margin as per spec
  },
  streakBadge: {
    backgroundColor: theme.colors.text.warning, // Light Olive (#C7D36F)
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20, // Pill shape
    marginTop: theme.spacing.sm,
    alignSelf: 'center',
    // borderWidth: 1, // Optional border
    // borderColor: theme.colors.text.warning
  },
  streakText: {
    color: '#3C3C43', // Dark text on light badge for contrast
    fontWeight: '600',
    fontSize: theme.typography.subheadline.fontSize
  },
  streakIcon: {
    width: 16,
    height: 16,
    marginRight: 6
  },

  title: {
    ...theme.typography.title1,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
    textAlign: 'left'
  },
  subtitle: {
    ...theme.typography.title3,
    marginTop: 0,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.primary
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.shadow || '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3
  },
  helperText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm
  },
  fileInfo: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs
  },
  bookInfo: {
    marginBottom: theme.spacing.md,
  },
  bookTitle: {
    ...theme.typography.title2,
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  bookAuthor: {
    ...theme.typography.body,
    color: theme.colors.text.secondary,
  },
  sectionHeader: {
    ...theme.typography.title3,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.primary
  },
  chapterList: {
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border
  },
  chapterItem: {
    ...theme.typography.body
  },
  input: {
    backgroundColor: theme.colors.inputBackground || theme.colors.background, // Warm Cream
    padding: 12,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
  previewText: {
    ...theme.typography.caption1,
    color: theme.colors.text.tint,
    marginBottom: theme.spacing.md
  },
  storageText: {
    ...theme.typography.caption1,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
    padding: 5,
    borderRadius: theme.borderRadius.sm
  },
  status: {
    marginTop: theme.spacing.sm,
    ...theme.typography.body,
    color: theme.colors.text.tint,
    textAlign: 'center'
  },
  progressContainer: {
    marginTop: theme.spacing.md,
    alignItems: 'center'
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    marginTop: theme.spacing.xs
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.text.tint
  },
  progressText: {
    ...theme.typography.caption1,
    marginTop: theme.spacing.xs,
    color: theme.colors.text.secondary
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    width: '80%',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    maxHeight: '70%'
  },
  modalTitle: {
    ...theme.typography.title3,
    marginBottom: theme.spacing.md,
    textAlign: 'center'
  },
  voiceItem: {
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  selectedVoiceItem: {
    backgroundColor: theme.colors.text.tint + '20' // Low opacity tint
  },
  voiceName: {
    ...theme.typography.body
  }
});
