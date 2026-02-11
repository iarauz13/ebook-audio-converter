import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Alert, ScrollView, TextInput, Modal, TouchableOpacity, FlatList, ActivityIndicator, Image, Animated, Easing } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useState, useEffect, useRef } from 'react';
import { parseEpub, Book } from './utils/epubParser';
import * as Speech from 'expo-speech';
import { intelligentChapterFilter } from './utils/chapterFilter';
import { Video, ResizeMode } from 'expo-av';

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
const theme = {
  colors: {
    background: '#F2F2F7', // systemGray6 for overall background
    card: '#FFFFFF',       // systemBackground
    text: {
      primary: '#000000',      // label
      secondary: '#3C3C4399',  // secondaryLabel (60% opacity)
      tertiary: '#3C3C434D',   // tertiaryLabel (30% opacity)
      tint: '#007AFF',         // systemBlue
      success: '#34C759',      // systemGreen
      warning: '#FF9500',      // systemOrange
      destructive: '#FF3B30',  // systemRed
    },
    border: '#C6C6C8', // separator
  },
  typography: {
    largeTitle: { fontSize: 34, fontWeight: '700' as '700', color: '#000000' },
    title1: { fontSize: 28, fontWeight: '700' as '700', color: '#000000' },
    title2: { fontSize: 22, fontWeight: '700' as '700', color: '#000000' },
    title3: { fontSize: 20, fontWeight: '600' as '600', color: '#000000' },
    body: { fontSize: 17, fontWeight: '400' as '400', color: '#000000' },
    subheadline: { fontSize: 15, fontWeight: '400' as '400', color: '#3C3C4399' },
    caption1: { fontSize: 12, fontWeight: '400' as '400', color: '#3C3C4399' },
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

export default function App() {
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

  // Persistence State
  const [isRestoring, setIsRestoring] = useState(true);

  // Gamification / Mascot
  const [streak, setStreak] = useState(0);

  // Video Refs & State
  const videoRef = useRef<Video>(null);
  const checkActivityTimeout = useRef<NodeJS.Timeout | null>(null);
  const [videoSource, setVideoSource] = useState(require('./assets/Echo_Neutral_2.mp4'));
  const [isLooping, setIsLooping] = useState(true);





  // Activity Monitor
  const resetInactivityTimer = () => {
    if (checkActivityTimeout.current) clearTimeout(checkActivityTimeout.current);

    // If we were sleeping, wake up!
    if (videoSource === require('./assets/Echo_Sleeping_Inactive.mp4')) {
      setVideoSource(require('./assets/Echo_Neutral_2.mp4'));
      setIsLooping(true);
    }

    checkActivityTimeout.current = setTimeout(() => {
      // Go to sleep
      setVideoSource(require('./assets/Echo_Sleeping_Inactive.mp4'));
      setIsLooping(true);
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
        type: ['application/epub+zip', 'application/pdf'], // Filter for EPUBs and PDFs
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('File picked:', file);

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

  const speakChapter = (chapter: any, index: number) => {
    // Save progress
    saveState({ lastChapterIndex: index });

    // Speaking activity -> Update mascot to happy if not already (simple interaction)


    // If clicking the same chapter, stop it
    if (playingChapter === index) {
      Speech.stop();
      setPlayingChapter(null);
      return;
    }

    // Stop (previous) and play new
    Speech.stop();
    setPlayingChapter(index);
    setMascotAction('reading');

    const textToRead = chapter.content || "No content found in this chapter.";

    Speech.speak(textToRead, {
      rate: 0.85,
      voice: selectedVoice?.identifier,
      onDone: () => {
        setPlayingChapter(null);
      },
      onStopped: () => setPlayingChapter(null),
    });
  };

  const setMascotAction = (action: 'reading' | 'neutral' | 'celebrate') => {
    switch (action) {
      case 'reading':
        setVideoSource(require('./assets/Echo_Looking_Down.mp4'));
        setIsLooping(true);
        break;
      case 'celebrate':
        setVideoSource(require('./assets/Echo_Celebrating.mp4'));
        setIsLooping(true);
        break;
      case 'neutral':
      default:
        setVideoSource(require('./assets/Echo_Neutral_2.mp4'));
        setIsLooping(true);
        break;
    }
  };

  const previewVoice = (voice: Speech.Voice) => {
    Speech.stop();
    Speech.speak(`Hello, I am ${voice.name}. This is a preview.`, {
      voice: voice.identifier,
      rate: 0.85
    });
  };

  const handleMascotTap = () => {
    resetInactivityTimer(); // Reset sleep timer on interaction
    if (videoSource === require('./assets/Echo_Celebrating.mp4')) return; // Already celebrating

    // Play celebration
    setVideoSource(require('./assets/Echo_Celebrating.mp4'));
    setIsLooping(false); // Play once then stop (handled by status update)
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.didJustFinish) {
      // If we just finished celebrating, go back to neutral
      if (videoSource === require('./assets/Echo_Celebrating.mp4')) {
        setVideoSource(require('./assets/Echo_Neutral_2.mp4'));
        setIsLooping(true);
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
      await FileSystem.writeAsStringAsync(`${storagePath}/Chapter ${chapterIdx + 1} - ${chapter.title.replace(/[^a-z0-9 ]/gi, '')}.txt`, chapter.content);

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
                  isLooping={isLooping}
                  shouldPlay={true}
                  isMuted={true}
                  onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                />
              </TouchableOpacity>

              <Text style={styles.title}>Audiobooks Mobile</Text>

              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>🔥 {streak} Day Streak</Text>
              </View>
            </View>

            <View style={styles.card}>
              {/* Step 1: Import */}
              <Text style={styles.subtitle}>Step 1: Import Book</Text>
              <Text style={styles.helperText}>Note: Please select one EPUB file at a time.</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
                <Button title="Select File" onPress={pickDocument} />
                {selectedFile && <Button title="Reset / Clear" onPress={async () => {
                  setSelectedFile(null);
                  setBook(null);
                  setRangeText("");
                  setGeneratedPath(null);
                  setConversionStatus("");
                  setIsConverting(false);
                  setProgress(0);
                  // Clear State
                  await AsyncStorage.removeItem(STORAGE_KEY);
                }} color="red" />}
              </View>

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
                        value={rangeText}
                        onChangeText={setRangeText}
                        keyboardType="numbers-and-punctuation"
                      />
                      <Text style={styles.previewText}>
                        Will convert {getSelectedIndices().length} of {book.chapters.length} chapters
                      </Text>

                      {/* Step 3: Voice Selection */}
                      <Text style={styles.sectionHeader}>Step 3: Choose Narrator</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xs, backgroundColor: '#f9f9f9', padding: theme.spacing.md, borderRadius: theme.borderRadius.sm, borderWidth: 1, borderColor: theme.colors.border }}>
                        <Text numberOfLines={1} style={{ flex: 1, marginRight: theme.spacing.md }}>{selectedVoice ? selectedVoice.name : "Default"}</Text>
                        <Button title="Change" onPress={() => setShowVoiceModal(true)} />
                      </View>
                      <Text style={styles.helperText}>Tip: Download "Enhanced" voices in iOS Settings &gt; Accessibility &gt; Spoken Content.</Text>
                      {selectedVoice && <View style={{ marginBottom: 15 }}><Button title={`Preview ${selectedVoice.name}`} onPress={() => previewVoice(selectedVoice)} /></View>}

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
                        <View>
                          <Button title="Convert & Save" onPress={startConversion} />
                          {generatedPath && (
                            <View style={{ marginTop: 10 }}>
                              <Button title="Share / Export" onPress={shareAudiobook} color="#28a745" />
                            </View>
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
                <Text style={styles.modalTitle}>Select Voice</Text>
                <FlatList
                  data={voices}
                  keyExtractor={(item) => item.identifier}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.voiceItem, selectedVoice?.identifier === item.identifier && styles.selectedVoiceItem]}
                      onPress={() => {
                        setSelectedVoice(item);
                        setShowVoiceModal(false);
                        // Optional: Speak name on select
                        // previewVoice(item);
                      }}
                    >
                      <Text style={styles.voiceName}>{item.name}</Text>
                      <TouchableOpacity onPress={() => previewVoice(item)} style={{ padding: 5 }}>
                        <Text style={{ color: '#007AFF' }}>Test</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                />
                <Button title="Close" onPress={() => setShowVoiceModal(false)} />
              </View>
            </View>
          </Modal>

        </SafeAreaView>
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255, 149, 0, 0.15)', // systemOrange with low alpha
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    marginTop: theme.spacing.sm,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: theme.colors.text.warning
  },
  streakText: {
    color: theme.colors.text.warning,
    fontWeight: '600',
    fontSize: theme.typography.subheadline.fontSize
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  helperText: {
    ...theme.typography.subheadline,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.md,
    // fontStyle: 'italic' // REMOVED ITALIC
  },
  status: {
    marginTop: theme.spacing.md,
    // fontStyle: 'italic', // REMOVED ITALIC 
    ...theme.typography.subheadline,
    color: theme.colors.text.secondary
  },
  fileInfo: {
    marginTop: theme.spacing.lg,
    width: '100%'
  },
  fileName: {
    ...theme.typography.caption1,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs
  },
  bookInfo: {
    marginBottom: 0
  },
  bookTitle: {
    ...theme.typography.title2,
    marginBottom: theme.spacing.xxs
  },
  bookAuthor: {
    ...theme.typography.body,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.lg
  },
  sectionHeader: {
    ...theme.typography.title3,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 5
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
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.xs
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
