
import React from 'react';
import MusicPlayer from './MusicPlayer';
import Timer from './Timer';
import Notes from './Quote';
import WebsiteLinks from './WebsiteLinks';

interface DashboardToolsProps {
  progressPercentage: number;
  visible?: boolean;
}

const DashboardTools: React.FC<DashboardToolsProps> = ({ 
  progressPercentage,
  visible = true
}) => {
  if (!visible) return null;
  
  return (
    <div className="w-full">
      <div className="mb-4">
        <WebsiteLinks />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="col-span-1">
          <MusicPlayer />
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
