import React, { useEffect, useState } from 'react';
import { Reminder } from '../types';

interface ReminderListProps {
  reminders: Reminder[];
  onRemove: (id: string) => void;
}

export const ReminderList: React.FC<ReminderListProps> = ({ reminders, onRemove }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (reminders.length === 0) return null;

  return (
    <div className="mt-4 bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-xl">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active Reminders</h3>
      <ul className="space-y-2">
        {reminders.map((reminder) => {
          const timeLeft = Math.max(0, Math.ceil((reminder.dueTime - now) / 1000));
          const isOverdue = timeLeft === 0;

          return (
            <li 
              key={reminder.id} 
              className={`flex items-center justify-between p-2 rounded-lg border ${
                isOverdue 
                  ? 'bg-red-500/10 border-red-500/30' 
                  : 'bg-slate-800/40 border-slate-700/30'
              }`}
            >
              <div className="flex flex-col">
                <span className={`text-sm font-medium ${isOverdue ? 'text-red-300' : 'text-slate-200'}`}>
                  {reminder.text}
                </span>
                <span className="text-xs text-slate-500">
                  {isOverdue ? 'Completed' : `in ${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s`}
                </span>
              </div>
              <button
                onClick={() => onRemove(reminder.id)}
                className="text-slate-400 hover:text-red-400 transition-colors p-1"
                aria-label="Remove reminder"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
