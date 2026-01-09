import React from 'react';
import { Message } from '../types';

interface ChatBubbleProps {
  message: Message;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-4 animate-fade-in">
        <span className="text-xs text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
          {message.text}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] px-5 py-3 rounded-2xl shadow-lg backdrop-blur-sm text-sm sm:text-base leading-relaxed ${
          isUser
            ? 'bg-cyan-600/20 border border-cyan-500/30 text-cyan-50 rounded-tr-sm'
            : 'bg-slate-800/60 border border-slate-700/50 text-slate-200 rounded-tl-sm'
        }`}
      >
        {message.text}
      </div>
    </div>
  );
};
