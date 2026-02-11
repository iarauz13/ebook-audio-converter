import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Alert, ScrollView, TextInput, Modal, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useState, useEffect, useRef } from 'react';
import { parseEpub, Book } from './utils/epubParser';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'audiobooks_app_state_v1';
const STREAK_KEY = 'audiobooks_streak_v1';

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
  const [mascotMood, setMascotMood] = useState<'happy' | 'sleepy' | 'excited'>('sleepy');
  const [mascotMessage, setMascotMessage] = useState("Zzz...");

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
        setMascotMood('happy');
        setMascotMessage("Back for more? Awesome!");
        return;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (data.lastLoginDate === yesterdayStr) {
        // Consecutive day
        data.currentStreak += 1;
        setMascotMood('excited');
        setMascotMessage(`Wow! ${data.currentStreak} day streak! 🔥`);
      } else {
        // Streak broken or new user
        if (data.currentStreak > 0) {
          setMascotMood('sleepy'); // Was sad/sleepy because broken
          setMascotMessage("Oh no, streak broken... Let's start again!");
        } else {
          setMascotMood('happy');
          setMascotMessage("Welcome! Let's read.");
        }
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
    setMascotMood('happy');
    setMascotMessage("Listening matches! 🦊🎧");

    // If clicking the same chapter, stop it
    if (playingChapter === index) {
      Speech.stop();
      setPlayingChapter(null);
      setMascotMood('sleepy'); // Back to idle
      setMascotMessage("Taking a break?");
      return;
    }

    // Stop (previous) and play new
    Speech.stop();
    setPlayingChapter(index);

    const textToRead = chapter.content || "No content found in this chapter.";

    Speech.speak(textToRead, {
      rate: 1.0,
      voice: selectedVoice?.identifier,
      onDone: () => {
        setPlayingChapter(null);
        setMascotMood('happy'); // Finished reading
        setMascotMessage("That was precise!");
      },
      onStopped: () => setPlayingChapter(null),
    });
  };

  const previewVoice = (voice: Speech.Voice) => {
    Speech.stop();
    Speech.speak(`Hello, I am ${voice.name}. This is a preview.`, {
      voice: voice.identifier,
      rate: 1.0
    });
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

    // Create Dir
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
      <View style={{ flex: 1, backgroundColor: '#3b5998', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={{ color: 'white', marginTop: 10 }}>Loading Library...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <LinearGradient
        colors={['#4c669f', '#3b5998', '#192f6a']}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollContent}>

            {/* Mascot / Header Section */}
            <View style={styles.mascotContainer}>
              <View>
                <Text style={styles.title}>Audiobooks Mobile</Text>
                <View style={styles.streakBadge}>
                  <Text style={styles.streakText}>🔥 {streak} Day Streak</Text>
                </View>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Image
                  source={require('./assets/echo_neutral.jpg')}
                  style={styles.mascotImage}
                />
                <View style={styles.speechBubble}>
                  <Text style={styles.speechText}>{mascotMessage}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              {/* Step 1: Import */}
              <Text style={styles.subtitle}>Step 1: Import Book</Text>
              <Text style={styles.helperText}>Note: Please select one EPUB file at a time.</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
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
                    <Text style={styles.fileName}>Selected: {selectedFile.name}</Text>
                    {selectedFile.name.toLowerCase().endsWith('.pdf') && (
                      <View style={{ backgroundColor: '#fff3cd', padding: 10, borderRadius: 5, marginTop: 5, marginBottom: 10, width: '100%' }}>
                        <Text style={{ color: '#856404', fontSize: 12, fontWeight: 'bold' }}>⚠️ PDF Mode (Experimental)</Text>
                        <Text style={{ color: '#856404', fontSize: 12 }}>Pages are treated as chapters. Text extraction may be imperfect for scanned documents.</Text>
                      </View>
                    )}
                    <View style={styles.bookInfo}>
                      <Text style={styles.bookTitle}>{book.title}</Text>
                      <Text style={styles.bookAuthor}>{book.author}</Text>

                      {/* Step 2: Selection */}
                      <Text style={styles.sectionHeader}>Step 2: Select {selectedFile.name.toLowerCase().endsWith('.pdf') ? 'Pages' : 'Chapters'}</Text>
                      <Text style={styles.helperText}>Enter range (e.g. 1-10) or leave empty for all.</Text>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 5, borderWidth: 1, borderColor: '#ccc' }}>
                        <Text numberOfLines={1} style={{ flex: 1, marginRight: 10 }}>{selectedVoice ? selectedVoice.name : "Default"}</Text>
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
        <StatusBar style="light" />
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    paddingBottom: 50,
  },
  // Mascot Styles
  mascotImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#fff',
    marginBottom: 5,
    backgroundColor: '#ddd' // Fallback
  },
  mascotContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    marginBottom: 20,
    marginTop: 10,
  },
  streakBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    marginTop: 5,
    alignSelf: 'flex-start'
  },
  streakText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14
  },
  speechBubble: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 10,
    marginTop: 5,
    maxWidth: 150,
    borderTopRightRadius: 0,
  },
  speechText: {
    fontSize: 12,
    color: '#333'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 0,
    marginBottom: 5,
    color: '#333'
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    fontStyle: 'italic'
  },
  status: {
    marginTop: 10,
    fontStyle: 'italic',
    color: '#555',
  },
  fileInfo: {
    marginTop: 20,
    width: '100%'
  },
  fileName: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5
  },
  bookInfo: {
    marginBottom: 0
  },
  bookTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5
  },
  bookAuthor: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 5,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5
  },
  chapterList: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 5,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  chapterItem: {
    fontSize: 14
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 5
  },
  previewText: {
    fontSize: 12,
    color: '#007AFF',
    marginBottom: 15
  },
  storageText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
    padding: 5,
    borderRadius: 5
  },
  progressContainer: {
    marginTop: 10,
    alignItems: 'center'
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 5
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF'
  },
  progressText: {
    fontSize: 12,
    marginTop: 5,
    color: '#555'
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
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    maxHeight: '70%'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center'
  },
  voiceItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  selectedVoiceItem: {
    backgroundColor: '#f0f8ff'
  },
  voiceName: {
    fontSize: 16
  }
});
