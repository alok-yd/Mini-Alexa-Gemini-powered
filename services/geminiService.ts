import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality } from "@google/genai";
import { ToolName, ToolCallData, LiveConnectionState, LiveConfig } from '../types';

const apiKey = process.env.API_KEY || '';

// --- Tool Definitions ---

const searchYoutubeTool: FunctionDeclaration = {
  name: ToolName.SEARCH_YOUTUBE,
  description: "Search for videos on YouTube. Use this when the user asks to play a song, find a video, or search YouTube.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The search query for YouTube."
      }
    },
    required: ["query"]
  }
};

const openUrlTool: FunctionDeclaration = {
  name: ToolName.OPEN_URL,
  description: "Open a specific URL in a new tab. Use this when the user provides a direct link or asks to go to a specific website.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "The full URL to open (must start with http:// or https://)."
      }
    },
    required: ["url"]
  }
};

const setReminderTool: FunctionDeclaration = {
  name: ToolName.SET_REMINDER,
  description: "Set a timer or reminder. Use this when the user asks to be reminded to do something after a certain time.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      task: {
        type: Type.STRING,
        description: "The task description to remind about."
      },
      delay_minutes: {
        type: Type.NUMBER,
        description: "The delay in minutes before the reminder triggers."
      }
    },
    required: ["task", "delay_minutes"]
  }
};

const toolsDef = [{ functionDeclarations: [searchYoutubeTool, openUrlTool, setReminderTool] }];

// --- Chat Service (Legacy Text/Audio) ---

let client: GoogleGenAI | null = null;
let chatSession: any = null;

export const initializeGemini = () => {
  if (!apiKey) {
    console.error("API Key is missing!");
    return;
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
};

export const getChatSession = () => {
  if (!client) initializeGemini();
  if (!client) throw new Error("Failed to initialize Gemini Client");

  if (!chatSession) {
    chatSession = client.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: "You are 'Mini Alexa', a helpful, futuristic AI assistant. You can control the browser to open links, search YouTube, and set reminders.",
        tools: toolsDef,
      },
    });
  }
  return chatSession;
};

// --- Live Service (Real-time Audio & Video) ---

export class LiveSession {
  private config: LiveConfig;
  private client: GoogleGenAI;
  private session: any = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime = 0;
  private scheduledSources = new Set<AudioBufferSourceNode>();
  private active = false;
  
  // Video Streaming State
  private videoInterval: number | null = null;
  private videoCanvas: HTMLCanvasElement | null = null;

  constructor(config: LiveConfig) {
    this.config = config;
    if (!client) initializeGemini();
    if (!client) throw new Error("Gemini Client not initialized");
    this.client = client;
  }

  async connect() {
    if (this.active) return;
    
    try {
      this.config.onStateChange?.(LiveConnectionState.CONNECTING);

      // Initialize Audio Contexts
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContext({ sampleRate: 24000 });
      
      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Connect to Gemini Live
      const sessionPromise = this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.config.onStateChange?.(LiveConnectionState.CONNECTED);
            this.active = true;
            this.startAudioInput(stream, sessionPromise);
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message, sessionPromise),
          onclose: () => {
            this.config.onStateChange?.(LiveConnectionState.DISCONNECTED);
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.config.onStateChange?.(LiveConnectionState.ERROR);
            this.stop();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: "You are 'Mini Alexa', a highly intelligent, voice-first AI. You are witty, concise, and helpful. You can see the user's camera if they enable it. If you see something, describe it or answer questions about it.",
          tools: toolsDef,
        },
      });

      // Save session reference (it's a promise initially)
      this.session = sessionPromise;

    } catch (error) {
      console.error("Failed to connect live session", error);
      this.config.onStateChange?.(LiveConnectionState.ERROR);
      this.stop();
    }
  }

  // --- Video Streaming ---
  startVideoStream(videoElement: HTMLVideoElement) {
    if (!this.session || this.videoInterval) return;

    this.videoCanvas = document.createElement('canvas');
    const ctx = this.videoCanvas.getContext('2d', { willReadFrequently: true });
    
    // Send frames at 2 FPS to balance latency and bandwidth
    const FPS = 2; 

    this.videoInterval = window.setInterval(() => {
        if (!this.active || !this.videoCanvas || !ctx) return;
        
        // Draw video frame to canvas
        this.videoCanvas.width = videoElement.videoWidth * 0.5; // Downscale for performance
        this.videoCanvas.height = videoElement.videoHeight * 0.5;
        ctx.drawImage(videoElement, 0, 0, this.videoCanvas.width, this.videoCanvas.height);
        
        // Convert to base64
        const base64Data = this.videoCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        
        // Send to Gemini
        this.session.then((session: any) => {
            try {
                session.sendRealtimeInput({
                    media: {
                        mimeType: 'image/jpeg',
                        data: base64Data
                    }
                });
            } catch (e) {
                console.error("Error sending video frame:", e);
            }
        });
    }, 1000 / FPS);
  }

  stopVideoStream() {
    if (this.videoInterval) {
        clearInterval(this.videoInterval);
        this.videoInterval = null;
    }
    this.videoCanvas = null;
  }

  // --- Audio Input ---

  private startAudioInput(stream: MediaStream, sessionPromise: Promise<any>) {
    if (!this.inputAudioContext) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.active) return;
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.config.onVolumeChange?.(rms, 0); // Send user volume

      // Convert to PCM 16-bit
      const pcmData = this.floatTo16BitPCM(inputData);
      const base64Data = this.arrayBufferToBase64(pcmData);

      sessionPromise.then((session) => {
        session.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data
          }
        });
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  // --- Message Handling ---

  private async handleMessage(message: LiveServerMessage, sessionPromise: Promise<any>) {
    // 1. Handle Audio Response
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outputAudioContext) {
      this.playAudioChunk(audioData);
    }

    // 2. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.stopAudioPlayback();
      this.config.onCaption?.("[Interrupted]", false, true);
    }

    // 3. Handle Transcriptions (Captions)
    // User Input Transcription
    if (message.serverContent?.inputTranscription) {
        const text = message.serverContent.inputTranscription.text;
        if (text) {
             this.config.onCaption?.(text, true, !!message.serverContent.turnComplete);
        }
    }
    
    // Model Output Transcription
    if (message.serverContent?.outputTranscription) {
        const text = message.serverContent.outputTranscription.text;
        if (text) {
            this.config.onCaption?.(text, false, !!message.serverContent.turnComplete);
        }
    }

    // 4. Handle Tool Calls
    if (message.toolCall) {
      const toolCalls = message.toolCall.functionCalls.map(fc => ({
        name: fc.name,
        args: fc.args,
        id: fc.id
      }));

      // Notify UI to execute tools
      if (this.config.onToolCall) {
         const results = await this.config.onToolCall(toolCalls);
         
         // Send responses back
         const session = await sessionPromise;
         const functionResponses = results.map((result, index) => ({
             id: toolCalls[index].id,
             name: toolCalls[index].name,
             response: { result } // Result must be an object
         }));

         session.sendToolResponse({
             functionResponses
         });
      }
    }
  }

  private async playAudioChunk(base64Audio: string) {
    if (!this.outputAudioContext) return;

    try {
      const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
      const audioBuffer = await this.pcmToAudioBuffer(arrayBuffer, this.outputAudioContext);
      
      // Schedule playback
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      
      const currentTime = this.outputAudioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }
      
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      
      this.scheduledSources.add(source);
      
      source.onended = () => {
        this.scheduledSources.delete(source);
      };

      // Simple visualizer simulation for model
      this.config.onVolumeChange?.(0, 0.4); 
      setTimeout(() => this.config.onVolumeChange?.(0, 0), audioBuffer.duration * 1000);

    } catch (e) {
      console.error("Error playing audio chunk", e);
    }
  }

  private stopAudioPlayback() {
    this.scheduledSources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.scheduledSources.clear();
    this.nextStartTime = 0;
  }

  stop() {
    this.active = false;
    this.stopVideoStream();
    this.stopAudioPlayback();

    // Close Audio Contexts
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    
    // Disconnect Media Streams
    if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
    }
    if (this.inputSource) {
        this.inputSource.disconnect();
        this.inputSource = null;
    }

    if (this.session) {
        this.session.then((s: any) => {
            if (s.close) s.close();
        }).catch(() => {});
        this.session = null;
    }
  }

  // --- Helpers ---

  private floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private async pcmToAudioBuffer(arrayBuffer: ArrayBuffer, context: AudioContext): Promise<AudioBuffer> {
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    
    const audioBuffer = context.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    return audioBuffer;
  }
}
