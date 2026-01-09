// Message Types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

// Reminder Type
export interface Reminder {
  id: string;
  text: string;
  dueTime: number; // Date.now() + delay
  completed: boolean;
  originalDelayMinutes: number;
}

// Global window extension for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// Tool definitions for Gemini
export enum ToolName {
  SEARCH_YOUTUBE = 'search_youtube',
  OPEN_URL = 'open_url',
  SET_REMINDER = 'set_reminder',
}

export interface ToolCallData {
  name: string;
  args: Record<string, any>;
}

export enum LiveConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export interface LiveConfig {
  onTranscript?: (text: string, isUser: boolean) => void;
  onToolCall?: (toolCalls: ToolCallData[]) => Promise<any[]>;
  onStateChange?: (state: LiveConnectionState) => void;
  onVolumeChange?: (userVolume: number, modelVolume: number) => void;
  onCaption?: (text: string, isUser: boolean, isComplete: boolean) => void;
}