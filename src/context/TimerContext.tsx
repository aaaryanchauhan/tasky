
import React, { createContext, useState, useContext, useEffect } from 'react';

interface TimerContextType {
  time: number;
  isRunning: boolean;
  minutes: string;
  isEditing: boolean;
  setTime: (time: number) => void;
  setIsRunning: (isRunning: boolean) => void;
  setMinutes: (minutes: string) => void;
  setIsEditing: (isEditing: boolean) => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

interface TimerProviderProps {
  children: React.ReactNode;
}

export const TimerProvider: React.FC<TimerProviderProps> = ({ children }) => {
  const [time, setTime] = useState(() => {
    const savedTime = localStorage.getItem('timer-time');
    return savedTime ? parseInt(savedTime, 10) : 25 * 60;
  });
  
  const [isRunning, setIsRunning] = useState(() => {
    const savedIsRunning = localStorage.getItem('timer-running');
    return savedIsRunning ? savedIsRunning === 'true' : false;
  });
  
  const [minutes, setMinutes] = useState(() => {
    const savedMinutes = localStorage.getItem('timer-minutes');
    return savedMinutes || "25";
  });
  
  const [isEditing, setIsEditing] = useState(false);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('timer-time', time.toString());
    localStorage.setItem('timer-running', isRunning.toString());
    localStorage.setItem('timer-minutes', minutes);
  }, [time, isRunning, minutes]);

  return (
    <TimerContext.Provider 
      value={{ 
        time, 
        isRunning, 
        minutes, 
        isEditing,
        setTime, 
        setIsRunning, 
        setMinutes,
        setIsEditing
      }}
    >
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
};
