
import React, { useState, useRef } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";

const lofiStations = [
  {
    name: "Lofi Girl",
    url: "https://play.streamafrica.net/lofiradio"
  },
  {
    name: "Chillhop",
    url: "http://stream.zeno.fm/0r0xa792kwzuv"
  },
  {
    name: "Box Lofi",
    url: "http://stream.zeno.fm/f3wvbbqmdg8uv"
  }
];

const MusicPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(60);
  const [currentStation, setCurrentStation] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(error => {
        console.error("Audio playback error:", error);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleVolumeChange = (value: number[]) => {
    if (!audioRef.current) return;
    const newVolume = value[0];
    setVolume(newVolume);
    audioRef.current.volume = newVolume / 100;
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const changeStation = (index: number) => {
    setCurrentStation(index);
    if (audioRef.current) {
      const wasPlaying = !audioRef.current.paused;
      audioRef.current.src = lofiStations[index].url;
      if (wasPlaying) {
        audioRef.current.play().catch(error => {
          console.error("Audio playback error:", error);
        });
        setIsPlaying(true);
      }
    }
  };

  return (
    <Card className="p-4 h-full bg-[#EFF6FF] dark:bg-slate-800 border-blue-200 dark:border-slate-700">
      <div className="flex flex-col h-full">
        <h3 className="text-lg font-semibold mb-3 text-black dark:text-white">Study Lofi Music</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {lofiStations.map((station, index) => (
            <Button
              key={station.name}
              variant={currentStation === index ? "default" : "outline"}
              size="sm"
              onClick={() => changeStation(index)}
            >
              {station.name}
            </Button>
          ))}
        </div>
        
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={handlePlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? 
                <Pause className="h-4 w-4 text-black dark:text-white" /> : 
                <Play className="h-4 w-4 text-black dark:text-white" />
              }
            </Button>
            <span className="text-sm font-medium ml-2 text-black dark:text-white">
              {isPlaying ? "Now Playing: " + lofiStations[currentStation].name : "Paused"}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? 
                <VolumeX className="h-4 w-4 text-black dark:text-white" /> : 
                <Volume2 className="h-4 w-4 text-black dark:text-white" />
              }
            </Button>
            <Slider
              value={[volume]}
              min={0}
              max={100}
              step={1}
              className="w-24"
              onValueChange={handleVolumeChange}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
      
      <audio
        ref={audioRef}
        src={lofiStations[currentStation].url}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </Card>
  );
};

export default MusicPlayer;
