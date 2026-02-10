import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/epub+zip', // Filter for EPUBs
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        console.log('User cancelled document picker');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('File picked:', file);
        setSelectedFile(file);
        Alert.alert("Success", `Selected: ${file.name}`);
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert("Error", "Failed to pick document");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audiobooks Mobile</Text>

      <View style={styles.card}>
        <Text style={styles.subtitle}>Step 1: Import Book</Text>
        <Button title="Select EPUB File" onPress={pickDocument} />

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text>Selected: {selectedFile.name}</Text>
            <Text style={styles.fileSize}>{(selectedFile.size ? selectedFile.size / 1024 : 0).toFixed(1)} KB</Text>
          </View>
        )}
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  card: {
    width: '100%',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 15,
  },
  fileInfo: {
    marginTop: 20,
    alignItems: 'center',
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
  }
});
