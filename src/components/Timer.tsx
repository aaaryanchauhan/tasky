
import React, { useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { useTimer } from '@/context/TimerContext';

const Timer: React.FC = () => {
  const { 
    time, setTime,
    isRunning, setIsRunning,
    minutes, setMinutes,
    isEditing, setIsEditing
  } = useTimer();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (isRunning && time > 0) {
      intervalRef.current = setInterval(() => {
        setTime(prev => prev - 1);
      }, 1000);
    } else if (time === 0) {
      setIsRunning(false);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
        setTimeout(() => {
          if (audioRef.current) audioRef.current.pause();
        }, 10000);
      }
      toast("Time's up!");
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, time, setTime, setIsRunning]);

  const toggleTimer = () => {
    if (isEditing) return;
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTime(parseInt(minutes) * 60 || 25 * 60);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleEditToggle = () => {
    if (isRunning) return;
    
    if (isEditing) {
      // Save changes
      const newMinutes = parseInt(minutes);
      if (!isNaN(newMinutes) && newMinutes > 0) {
        setTime(newMinutes * 60);
      } else {
        setMinutes("25");
        setTime(25 * 60);
      }
    }
    setIsEditing(!isEditing);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-4 h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Focus Timer</h3>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleEditToggle}
          disabled={isRunning}
          className="h-8 w-8"
        >
          <Edit className="h-4 w-4" />
        </Button>
      </div>

      {isEditing ? (
        <div className="my-4">
          <Input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            min="1"
            max="60"
            className="text-center text-lg"
            placeholder="Minutes"
          />
          <Button 
            onClick={handleEditToggle} 
            className="w-full mt-2"
          >
            Set Timer
          </Button>
        </div>
      ) : (
        <>
          <div className="text-center text-3xl font-bold mb-4">{formatTime(time)}</div>
          <div className="flex justify-center gap-2">
            <Button onClick={toggleTimer} variant="outline">
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button onClick={resetTimer} variant="outline">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};

export default Timer;
