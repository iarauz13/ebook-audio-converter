
/**
 * test_edge_tts_node.ts
 * A standalone Node.js script to verify the Edge TTS logic.
 * 
 * Usage:
 * npx ts-node test_edge_tts_node.ts
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Mock browser WebSocket for Node environment
(global as any).WebSocket = WebSocket;

// Constants from edge-tts
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_WEBSOCKET_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

function getXTime() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const d = new Date();
  const dayName = days[d.getUTCDay()];
  const monthName = months[d.getUTCMonth()];
  const day = d.getUTCDate().toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const seconds = d.getUTCSeconds().toString().padStart(2, '0');

  return `${dayName} ${monthName} ${day} ${year} ${hours}:${minutes}:${seconds} GMT+0000 (Coordinated Universal Time)`;
}

function generateSecMsGec(): string {
  let ticks = Date.now() / 1000;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function generateConnectId(): string {
  return uuidv4().replace(/-/g, '');
}

function generateMuid(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

async function synthesizeEdgeTTS(text: string, voiceIdentifier: string, outputFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = uuidv4().replace(/-/g, '');
    const connectId = generateConnectId();
    const secMsGec = generateSecMsGec();
    const muid = generateMuid();

    const url = `${EDGE_WEBSOCKET_URL}&ConnectionId=${connectId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    console.log(`Debug URL: ${url}`);
    console.log(`Timestamp: ${getXTime()}`);
    console.log(`MUID: ${muid}`);

    const ws = new WebSocket(url, {
      headers: {
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": `muid=${muid};`
      }
    });
    const audioChunks: Buffer[] = [];

    console.log(`Connecting to Edge TTS (${voiceIdentifier})...`);

    ws.on('open', () => {
      console.log("Connected!");

      // 1. Send Config
      const configMsg = `X-Timestamp:${getXTime()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false"
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        });
      ws.send(configMsg);

      // 2. Send SSML
      const ssml = `
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
<voice name='${voiceIdentifier}'>
<prosody pitch='+0Hz' rate='+0%'>
${text}
</prosody>
</voice>
</speak>`;

      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${getXTime()}\r\nPath:ssml\r\n\r\n` + ssml;
      ws.send(ssmlMsg);
      console.log("Sent SSML request...");
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        const text = data.toString();
        // console.log("Received Text:", text); 
        if (text.includes("Path:turn.end")) {
          console.log("Received end of turn.");
          ws.close();
        }
      } else {
        // Binary Handling
        // In Node 'ws', data is already a Buffer.
        // Microsoft format:
        // 2 bytes: header length (Int16BE)
        // N bytes: Headers (ASCII)
        // Rest: Body

        if (data.length < 2) {
          return;
        }

        const headerLen = data.readUInt16BE(0);
        const headers = data.subarray(2, 2 + headerLen).toString();
        const body = data.subarray(2 + headerLen);

        // console.log("Binary Headers:", headers);

        if (headers.includes("Path:audio") && body.length > 0) {
          audioChunks.push(body);
          process.stdout.write('.'); // Progress dot
        }
      }
    });

    ws.on('close', () => {
      console.log("\nConnection closed.");
      if (audioChunks.length === 0) {
        reject(new Error("No audio received"));
        return;
      }

      const fullBuffer = Buffer.concat(audioChunks);
      fs.writeFileSync(outputFile, fullBuffer);
      console.log(`Saved MP3 to: ${outputFile} (${fullBuffer.length} bytes)`);
      resolve(outputFile);
    });

    ws.on('error', (e) => {
      console.error("WebSocket Error:", e);
      reject(e);
    });
  });
}

// RUN TEST
(async () => {
  try {
    console.log("Testing Edge TTS...");
    await synthesizeEdgeTTS(
      "Hello! This is a test of the Microsoft Edge TTS system running from a standalone Node script.",
      "en-US-AvaNeural",
      path.join(process.cwd(), "test_output.mp3")
    );
    console.log("✅ Custom Edge TTS Client Test Passed!");
  } catch (e) {
    console.error("❌ Test Failed:", e);
    process.exit(1);
  }
})();
