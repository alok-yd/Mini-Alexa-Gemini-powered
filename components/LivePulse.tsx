import React from 'react';

interface LivePulseProps {
  active: boolean;
  userVolume: number;
  modelVolume: number;
}

export const LivePulse: React.FC<LivePulseProps> = ({ active, userVolume, modelVolume }) => {
  // Simple visualization logic: 
  // Base size + dynamic expansion based on volume
  // Different colors for user (Mic input) vs Model (Speaker output)
  
  const baseSize = 80;
  // Amplify volume for visual effect
  const userScale = 1 + Math.min(userVolume * 5, 1.5);
  const modelScale = 1 + Math.min(modelVolume * 5, 1.5);

  return (
    <div className="relative flex items-center justify-center h-64 w-full">
      {/* Background Glow */}
      <div className={`absolute w-40 h-40 rounded-full blur-3xl transition-all duration-500 ${
        active 
          ? (modelVolume > 0.01 ? 'bg-cyan-500/30' : 'bg-blue-600/20') 
          : 'bg-slate-800/20'
      }`} />

      {/* Main Pulse Circle */}
      <div 
        className={`relative rounded-full flex items-center justify-center transition-all duration-75 shadow-2xl ${
           modelVolume > 0.01 
             ? 'bg-gradient-to-br from-cyan-400 to-blue-500 shadow-cyan-500/50' 
             : userVolume > 0.01 
               ? 'bg-gradient-to-br from-red-400 to-pink-600 shadow-red-500/50'
               : 'bg-slate-700 shadow-slate-900/50'
        }`}
        style={{
          width: `${baseSize * (modelVolume > 0.01 ? modelScale : userScale)}px`,
          height: `${baseSize * (modelVolume > 0.01 ? modelScale : userScale)}px`,
        }}
      >
        {/* Inner Icon */}
        <span className="text-3xl text-white drop-shadow-md">
            {modelVolume > 0.01 ? '🤖' : userVolume > 0.01 ? '🎙️' : '⚪'}
        </span>
      </div>

      {/* Status Text */}
      <div className="absolute bottom-4 text-slate-400 text-sm font-medium tracking-widest uppercase">
         {active 
            ? (modelVolume > 0.01 ? 'Gemini Speaking...' : userVolume > 0.01 ? 'Listening...' : 'Live Connected') 
            : 'Ready to Connect'}
      </div>
    </div>
  );
};
