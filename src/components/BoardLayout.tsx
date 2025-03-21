
import React, { useState } from "react";
import Header from "@/components/Header";
import WaveBackground from "@/components/WaveBackground";
import { Board } from "@/types/task";

interface BoardLayoutProps {
  children: React.ReactNode;
  boards: Board[];
  activeBoard: string;
  onBoardChange: (boardId: string) => void;
  onCreateBoard: (boardName: string) => void;
}

const BoardLayout: React.FC<BoardLayoutProps> = ({
  children,
  boards,
  activeBoard,
  onBoardChange,
  onCreateBoard
}) => {
  const [dashboardToolsVisible, setDashboardToolsVisible] = useState(true);

  const handleToggleDashboardTools = () => {
    setDashboardToolsVisible(!dashboardToolsVisible);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <WaveBackground />
      <Header 
        onToggleDashboardTools={handleToggleDashboardTools}
        dashboardToolsVisible={dashboardToolsVisible}
      />
      
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<any>, {
                dashboardToolsVisible
              });
            }
            return child;
          })}
        </div>
      </main>
    </div>
  );
};

export default BoardLayout;
