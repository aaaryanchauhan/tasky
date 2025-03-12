
import React from 'react';
import { Card } from '@/components/ui/card';

interface SandDialProps {
  percentage: number;
}

const SandDial: React.FC<SandDialProps> = ({ percentage }) => {
  return (
    <Card className="p-4 flex items-center justify-center">
      <div className="relative w-32 h-48 bg-secondary rounded-lg overflow-hidden">
        <div 
          className="absolute bottom-0 left-0 right-0 bg-primary transition-all duration-1000"
          style={{ 
            height: `${percentage}%`,
            transition: 'height 1s linear'
          }}
        />
        <div className="absolute top-1/2 left-0 right-0 h-2 bg-muted-foreground/20" />
      </div>
    </Card>
  );
};

export default SandDial;
