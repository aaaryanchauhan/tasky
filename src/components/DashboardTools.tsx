
import React from 'react';
import MusicPlayer from './MusicPlayer';
import Timer from './Timer';
import Notes from './Quote';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface DashboardToolsProps {
  progressPercentage: number;
  visible?: boolean;
}

const DashboardTools: React.FC<DashboardToolsProps> = ({ 
  progressPercentage,
  visible = true
}) => {
  const [isMusicPlayerVisible, setIsMusicPlayerVisible] = useLocalStorage<boolean>("taskflow-music-visible", true);
  
  if (!visible) return null;
  
  const toggleMusicVisibility = () => {
    setIsMusicPlayerVisible(!isMusicPlayerVisible);
    toast.info(isMusicPlayerVisible ? "LoFi Music player hidden" : "LoFi Music player visible");
  };
  
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="col-span-1">
          {isMusicPlayerVisible ? (
            <div className="relative">
              <MusicPlayer />
              <Button 
                variant="ghost" 
                size="sm" 
                className="absolute top-2 right-2"
                onClick={toggleMusicVisibility}
              >
                <EyeOff className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full h-full min-h-[80px] flex items-center justify-center gap-2"
              onClick={toggleMusicVisibility}
            >
              <Eye className="w-4 h-4" /> Show LoFi Music Player
            </Button>
          )}
        </div>
        <div className="col-span-1">
          <Timer />
        </div>
        <div className="col-span-1">
          <Notes />
        </div>
      </div>
    </div>
  );
};

export default DashboardTools;
