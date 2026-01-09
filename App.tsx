import React, { useState, useEffect, useRef } from 'react';
import { initializeGemini, LiveSession } from './services/geminiService';
import { ReminderList } from './components/ReminderList';
import { LivePulse } from './components/LivePulse';
import { Reminder, ToolName, LiveConnectionState } from './types';

// Initialize Gemini on load
initializeGemini();

const App: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [liveState, setLiveState] = useState<LiveConnectionState>(LiveConnectionState.DISCONNECTED);
  const [audioVolumes, setAudioVolumes] = useState({ user: 0, model: 0 });
  
  // Camera State
  const [isCameraOn, setIsCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Captions State
  const [captions, setCaptions] = useState<{text: string, isUser: boolean} | null>(null);
  const captionTimeoutRef = useRef<any>(null);

  const liveSessionRef = useRef<LiveSession | null>(null);

  // Handle Tool Actions (Reminders, etc.)
  const handleToolAction = async (name: string, args: any) => {
    let result = "done";

    switch (name) {
      case ToolName.OPEN_URL:
        if (args.url) {
            window.open(args.url, '_blank');
            result = `Opened ${args.url}`;
        }
        break;
      case ToolName.SEARCH_YOUTUBE:
        if (args.query) {
            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
            window.open(url, '_blank');
            result = `Searched for ${args.query}`;
        }
        break;
      case ToolName.SET_REMINDER:
        if (args.task && args.delay_minutes) {
            const delayMs = args.delay_minutes * 60 * 1000;
            const newReminder: Reminder = {
                id: Date.now().toString(),
                text: args.task,
                dueTime: Date.now() + delayMs,
                completed: false,
                originalDelayMinutes: args.delay_minutes
            };
            setReminders(prev => [...prev, newReminder]);
            result = `Reminder set for ${args.task}`;
        }
        break;
    }
    return result;
  };

  // Toggle Live Session
  const toggleLive = () => {
    if (liveState === LiveConnectionState.CONNECTED || liveState === LiveConnectionState.CONNECTING) {
      stopLiveSession();
    } else {
      startLiveSession();
    }
  };

  const startLiveSession = async () => {
    const session = new LiveSession({
        onStateChange: setLiveState,
        onVolumeChange: (user, model) => setAudioVolumes({ user, model }),
        onToolCall: async (toolCalls) => {
            const results = [];
            for (const tc of toolCalls) {
                const res = await handleToolAction(tc.name, tc.args);
                results.push(res);
            }
            return results;
        },
        onCaption: (text, isUser, isComplete) => {
             // Append to current if it's the same speaker and not complete replacement
             setCaptions({ text, isUser });
             
             // Clear caption after 3 seconds of silence/completion
             if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
             captionTimeoutRef.current = setTimeout(() => {
                 setCaptions(null);
             }, 4000);
        }
    });
    liveSessionRef.current = session;
    await session.connect();
    
    // If camera was already on, start streaming immediately
    if (isCameraOn && videoRef.current) {
        session.startVideoStream(videoRef.current);
    }
  };

  const stopLiveSession = () => {
    liveSessionRef.current?.stop();
    setLiveState(LiveConnectionState.DISCONNECTED);
    setAudioVolumes({ user: 0, model: 0 });
    setCaptions(null);
  };

  // Toggle Camera
  const toggleCamera = async () => {
    if (isCameraOn) {
        // Stop Camera
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
        liveSessionRef.current?.stopVideoStream();
    } else {
        // Start Camera
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                // Wait for video to be ready
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play();
                    if (liveState === LiveConnectionState.CONNECTED) {
                        liveSessionRef.current?.startVideoStream(videoRef.current!);
                    }
                };
            }
            setIsCameraOn(true);
        } catch (e) {
            console.error("Camera permission denied", e);
            alert("Camera permission denied.");
        }
    }
  };

  // Effect to manage reminders (Polling)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setReminders(prev => {
        let changed = false;
        const next = prev.map(r => {
           if (!r.completed && r.dueTime <= now) {
               changed = true;
               // Play sound or notification
               const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
               audio.play().catch(() => {});
               if ("Notification" in window && Notification.permission === "granted") {
                 new Notification("Reminder", { body: r.text });
               }
               return { ...r, completed: true };
           }
           return r;
        });
        return changed ? next : prev;
      });
    }, 1000);
    
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    return () => clearInterval(interval);
  }, []);

  // Cleanup
  useEffect(() => {
      return () => {
          stopLiveSession();
          if (streamRef.current) {
              streamRef.current.getTracks().forEach(t => t.stop());
          }
      }
  }, []);

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col items-center justify-center relative overflow-hidden font-sans selection:bg-cyan-500/30">
      
      {/* Dynamic Background */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${liveState === LiveConnectionState.CONNECTED ? 'opacity-100' : 'opacity-30'}`}>
         <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px]"></div>
         <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[128px]"></div>
      </div>

      {/* Camera Feed (PIP Style) */}
      <div className={`absolute top-6 left-6 transition-all duration-500 z-20 ${isCameraOn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}>
        <div className="relative rounded-2xl overflow-hidden border border-slate-700 shadow-2xl w-48 sm:w-64 aspect-video bg-slate-900">
             <video 
                ref={videoRef} 
                muted 
                playsInline 
                className="w-full h-full object-cover transform scale-x-[-1]" 
             />
             <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">
                 <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                 <span className="text-[10px] font-medium tracking-wider uppercase">Live Vision</span>
             </div>
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl p-8">
        
        {/* Connection Status */}
        <div className="absolute top-0 flex flex-col items-center gap-2 mb-10">
             <div className={`px-4 py-1.5 rounded-full border text-xs font-medium tracking-widest uppercase transition-all duration-300 ${
                 liveState === LiveConnectionState.CONNECTED 
                   ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                   : liveState === LiveConnectionState.CONNECTING
                     ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 animate-pulse'
                     : 'border-slate-700 bg-slate-800/50 text-slate-400'
             }`}>
                 {liveState === LiveConnectionState.DISCONNECTED && "Ready"}
                 {liveState === LiveConnectionState.CONNECTING && "Connecting..."}
                 {liveState === LiveConnectionState.CONNECTED && "Online"}
                 {liveState === LiveConnectionState.ERROR && "Error"}
             </div>
        </div>

        {/* The Brain / Pulse */}
        <div className="mb-12 mt-12 scale-125 sm:scale-150">
            <LivePulse 
                active={liveState === LiveConnectionState.CONNECTED}
                userVolume={audioVolumes.user}
                modelVolume={audioVolumes.model}
            />
        </div>

        {/* Live Captions */}
        <div className="h-24 w-full flex items-center justify-center text-center px-4 mb-8">
            {captions && (
                <div className={`transition-all duration-300 transform ${captions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <p className={`text-xl sm:text-2xl font-light leading-relaxed ${captions.isUser ? 'text-slate-300' : 'text-cyan-300'}`}>
                        "{captions.text}"
                    </p>
                </div>
            )}
            {!captions && liveState === LiveConnectionState.CONNECTED && (
                <p className="text-slate-600 text-sm animate-pulse">Listening...</p>
            )}
        </div>

        {/* Control Dock */}
        <div className="flex items-center gap-6 p-4 rounded-3xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl shadow-2xl transition-transform hover:scale-105">
            
            {/* Camera Toggle */}
            <button 
                onClick={toggleCamera}
                className={`p-4 rounded-full transition-all duration-300 ${
                    isCameraOn 
                    ? 'bg-slate-100 text-slate-900 shadow-lg shadow-slate-500/20' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
                title="Toggle Camera (Vision)"
            >
                {isCameraOn ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" /><path fillRule="evenodd" d="M9.344 3.071a4.993 4.993 0 015.312 0l.208.107a.66.66 0 01.328.567v.419c0 .768.42 1.48 1.107 1.78.618.27 1.344.208 1.913-.19.341-.239.757-.333 1.169-.22.56.154 1.05.513 1.366 1.002.316.488.396 1.102.164 1.638-.266.615-.173 1.34.258 1.884a.75.75 0 00.126.126 5.032 5.032 0 01.325 7.64l-.16.15a.66.66 0 01-.58.156 2.479 2.479 0 00-1.78 2.659c.088.665.51 1.258 1.107 1.574a.66.66 0 01.328.568v.419a4.993 4.993 0 01-5.312 0l-.208-.107a2.536 2.536 0 00-2.146-.082 2.52 2.52 0 00-1.465 1.722c-.15.658-.696 1.168-1.366 1.26a1.996 1.996 0 01-1.579-.478l-.16-.15a.66.66 0 01-.156-.58 2.479 2.479 0 00-2.659-1.78c-.665.088-1.258.51-1.574 1.107a.66.66 0 01-.568.328h-.419a4.993 4.993 0 01-5.312 0l-.107-.208a2.536 2.536 0 00-2.146.082 2.52 2.52 0 00-1.722 1.465c-.658.15-1.168.696-1.26 1.366a1.996 1.996 0 01.478 1.579l.15.16a.66.66 0 01.58.156c.615.266 1.34.173 1.884-.258a.75.75 0 00.126-.126 5.032 5.032 0 017.64-.325l.15.16a.66.66 0 01.156.58 2.479 2.479 0 002.659 1.78c.665-.088 1.258-.51 1.574-1.107a.66.66 0 01.568-.328h.419z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                )}
            </button>

            {/* Main Action Button */}
            <button 
                onClick={toggleLive}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl ${
                    liveState === LiveConnectionState.CONNECTED
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                    : 'bg-gradient-to-tr from-cyan-500 to-blue-600 hover:scale-110 text-white shadow-cyan-500/40'
                }`}
            >
                {liveState === LiveConnectionState.CONNECTED || liveState === LiveConnectionState.CONNECTING ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                         <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                )}
            </button>

            {/* Placeholder for future feature (e.g., Settings) */}
            <button title="Settings" className="p-4 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </button>
        </div>

      </div>

      {/* Floating Active Reminders Panel */}
      {reminders.length > 0 && (
         <div className="absolute top-6 right-6 z-20 w-72">
             <ReminderList 
                 reminders={reminders} 
                 onRemove={(id) => setReminders(prev => prev.filter(r => r.id !== id))} 
             />
         </div>
      )}

      {/* Footer Hint */}
      <div className="absolute bottom-6 text-slate-500 text-xs font-medium tracking-wide">
         POWERED BY GEMINI 2.5
      </div>
    </div>
  );
};

export default App;