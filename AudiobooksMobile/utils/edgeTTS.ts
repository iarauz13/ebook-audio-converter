/**
 * edgeTTS.ts
 * A client for Microsoft Edge's Online Neural TTS Service.
 * 
 * This module connects to the same WebSocket endpoint used by the Edge browser's "Read Aloud" feature.
 * It allows us to generate high-quality "Neural" speech (Ava, Andrew, etc.) for free,
 * bypassing the need for an Azure API key.
 * 
 * Protocol:
 * 1. Connect to wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
 * 2. Authenticate with Sec-MS-GEC token (DRM) and MUID cookie
 * 3. Send configuration (speech.config)
 * 4. Send SSML (Speech Synthesis Markup Language)
 * 5. Receive binary audio chunks (2-byte header length + headers + audio body)
 * 6. Assemble chunks into a playable MP3 file saved to cache
 */

import * as FileSystem from 'expo-file-system/legacy';
import uuid from 'react-native-uuid';
import { Buffer } from 'buffer';

// ─── Constants ──────────────────────────────────────────────────────────────────

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_WEBSOCKET_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

// ─── Available Voices ───────────────────────────────────────────────────────────

export const EDGE_VOICES = [
  { identifier: 'en-US-AvaNeural', name: 'Ava (US)', language: 'en-US', quality: 'Neural' },
  { identifier: 'en-US-AndrewNeural', name: 'Andrew (US)', language: 'en-US', quality: 'Neural' },
  { identifier: 'en-US-EmmaNeural', name: 'Emma (US)', language: 'en-US', quality: 'Neural' },
  { identifier: 'en-US-BrianNeural', name: 'Brian (US)', language: 'en-US', quality: 'Neural' },
  { identifier: 'en-US-JennyNeural', name: 'Jenny (US)', language: 'en-US', quality: 'Neural' },
  { identifier: 'en-US-GuyNeural', name: 'Guy (US)', language: 'en-US', quality: 'Neural' },
  { identifier: 'en-GB-SoniaNeural', name: 'Sonia (UK)', language: 'en-GB', quality: 'Neural' },
  { identifier: 'en-GB-RyanNeural', name: 'Ryan (UK)', language: 'en-GB', quality: 'Neural' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Generate the JavaScript-style date string matching edge-tts Python library format. */
function getXTime(): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  const dayName = days[d.getUTCDay()];
  const monthName = months[d.getUTCMonth()];
  const day = d.getUTCDate().toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const s = d.getUTCSeconds().toString().padStart(2, '0');
  return `${dayName} ${monthName} ${day} ${year} ${h}:${m}:${s} GMT+0000 (Coordinated Universal Time)`;
}

/** Generate the Sec-MS-GEC DRM token (SHA256 hash of rounded timestamp + trusted token). */
function generateSecMsGec(): string {
  let ticks = Date.now() / 1000;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300; // Round down to nearest 5 minutes
  ticks *= S_TO_NS / 100; // Convert to 100-nanosecond intervals

  // In React Native we don't have Node's `crypto`. Use a JS-only SHA-256.
  // The `buffer` package gives us what we need for encoding.
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return jsSha256(strToHash).toUpperCase();
}

/** Pure-JS SHA-256 (no Node crypto dependency). */
function jsSha256(message: string): string {
  // SHA-256 constants
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  // Pre-processing: encode message as UTF-8 bytes
  const msgBytes: number[] = [];
  for (let i = 0; i < message.length; i++) {
    const code = message.charCodeAt(i);
    if (code < 0x80) {
      msgBytes.push(code);
    } else if (code < 0x800) {
      msgBytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      msgBytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }

  const bitLength = msgBytes.length * 8;
  msgBytes.push(0x80);
  while ((msgBytes.length % 64) !== 56) {
    msgBytes.push(0);
  }
  // Append original length in bits as 64-bit big-endian
  for (let i = 56; i >= 0; i -= 8) {
    msgBytes.push((bitLength >>> i) & 0xff);
  }

  // Initialize hash values
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  // Process each 64-byte chunk
  for (let offset = 0; offset < msgBytes.length; offset += 64) {
    const w: number[] = new Array(64);
    for (let i = 0; i < 16; i++) {
      w[i] = (msgBytes[offset + i * 4] << 24) | (msgBytes[offset + i * 4 + 1] << 16) |
        (msgBytes[offset + i * 4 + 2] << 8) | msgBytes[offset + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  // Produce hex digest
  const toHex = (n: number) => ('00000000' + (n >>> 0).toString(16)).slice(-8);
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

/** Generate a random hex string for MUID cookie. */
function generateMuid(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map(b => ('0' + b.toString(16)).slice(-2)).join('').toUpperCase();
}

function generateConnectId(): string {
  return uuid.v4().toString().replace(/-/g, '');
}

// ─── Main Synthesize Function ───────────────────────────────────────────────────

/**
 * Synthesizes text to an audio file using Edge TTS.
 * @param text The text to speak.
 * @param voiceIdentifier The voice ID (e.g., 'en-US-AvaNeural').
 * @param rate Speed (default '+0%', options: '-20%', '+10%').
 * @param pitch Pitch (default '+0Hz', options: '-5Hz', '+5Hz').
 * @returns Path to the saved MP3 file in the app cache.
 */
export const synthesizeEdgeTTS = async (
  text: string,
  voiceIdentifier: string,
  rate: string = '+0%',
  pitch: string = '+0Hz'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const requestId = generateConnectId();
    const connectId = generateConnectId();
    const secMsGec = generateSecMsGec();
    const muid = generateMuid();

    // Build full URL with DRM parameters
    const url = `${EDGE_WEBSOCKET_URL}&ConnectionId=${connectId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    console.log('[EdgeTTS] Connecting...');

    // Note: React Native's WebSocket does NOT support custom headers in the constructor.
    // The DRM params are passed as query parameters instead (which is how the Python library works too).
    // The MUID cookie may not be sent by RN WebSocket — but the test showed it works with query params alone.
    const ws = new WebSocket(url);
    const audioChunks: string[] = []; // base64-encoded audio chunks

    ws.onopen = () => {
      console.log('[EdgeTTS] Connected, sending config...');

      // 1. Send speech configuration
      const configMsg =
        `X-Timestamp:${getXTime()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        });
      ws.send(configMsg);

      // 2. Send SSML
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voiceIdentifier}'>` +
        `<prosody pitch='${pitch}' rate='${rate}'>` +
        text +
        `</prosody></voice></speak>`;

      const ssmlMsg =
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${getXTime()}\r\nPath:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
      console.log('[EdgeTTS] SSML sent, awaiting audio...');
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = event.data;

      if (typeof data === 'string') {
        // Text message — look for turn.end
        if (data.includes('Path:turn.end')) {
          console.log('[EdgeTTS] Turn ended.');
          ws.close();
        }
      } else if (data instanceof Blob) {
        // Binary audio data — React Native WebSocket returns Blob
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          if (!base64Data) return;

          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length < 2) return;

          // Microsoft binary format:
          // First 2 bytes = header length (UInt16BE)
          // Next N bytes = ASCII headers
          // Remaining bytes = audio body (MP3)
          const headerLen = buffer.readUInt16BE(0);
          const headers = buffer.subarray(2, 2 + headerLen).toString();
          const body = buffer.subarray(2 + headerLen);

          if (headers.includes('Path:audio') && body.length > 0) {
            audioChunks.push(body.toString('base64'));
          }
        };
        reader.readAsDataURL(data);
      }
    };

    ws.onclose = async () => {
      if (audioChunks.length === 0) {
        reject(new Error('No audio received from Edge TTS'));
        return;
      }

      // Reassemble all chunks into a single MP3
      const fullBase64 = audioChunks.join('');
      const fileUri = `${FileSystem.cacheDirectory}edge_tts_${uuid.v4()}.mp3`;

      try {
        await FileSystem.writeAsStringAsync(fileUri, fullBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log(`[EdgeTTS] Saved MP3: ${fileUri}`);
        resolve(fileUri);
      } catch (e) {
        reject(e);
      }
    };

    ws.onerror = (e: Event) => {
      console.error('[EdgeTTS] WebSocket Error:', e);
      reject(new Error('Edge TTS WebSocket connection failed'));
    };
  });
};
