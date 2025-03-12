
import React from 'react';
import MusicPlayer from './MusicPlayer';
import Timer from './Timer';
import SandDial from './SandDial';
import { Progress } from './ui/progress';

interface DashboardToolsProps {
  progressPercentage: number;
}

const DashboardTools: React.FC<DashboardToolsProps> = ({ progressPercentage }) => {
  const [sandLevel, setSandLevel] = React.useState(100);

  return (
    <div className="w-full mb-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Tasks Progress: {progressPercentage}% Complete</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1">
          <MusicPlayer />
        </div>
        <div className="col-span-1">
          <Timer />
        </div>
        <div className="col-span-1">
          <SandDial percentage={sandLevel} />
        </div>
      </div>
    </div>
  );
};

export default DashboardTools;
