
import React from 'react';
import MusicPlayer from './MusicPlayer';
import Timer from './Timer';
import Quote from './Quote';
import { Progress } from './ui/progress';

interface DashboardToolsProps {
  progressPercentage: number;
}

const DashboardTools: React.FC<DashboardToolsProps> = ({ progressPercentage }) => {
  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Tasks Progress: {progressPercentage}% Complete</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>
      
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
