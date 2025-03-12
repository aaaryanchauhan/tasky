
import React from 'react';
import MusicPlayer from './MusicPlayer';
import Timer from './Timer';
import Quote from './Quote';

interface DashboardToolsProps {
  progressPercentage: number;
}

const DashboardTools: React.FC<DashboardToolsProps> = ({ progressPercentage }) => {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="col-span-1">
          <MusicPlayer />
        </div>
        <div className="col-span-1">
          <Timer />
        </div>
        <div className="col-span-1">
          <Quote />
        </div>
      </div>
    </div>
  );
};

export default DashboardTools;
