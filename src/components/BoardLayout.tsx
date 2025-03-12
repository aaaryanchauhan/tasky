
import React from "react";
import { Link } from "react-router-dom";
import { KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import WaveBackground from "@/components/WaveBackground";
import BoardSelector from "@/components/BoardSelector";
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
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <WaveBackground />
      <Header />
      
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Dashboard tools (music, timer, quote) will be rendered here first */}
          <div className="mb-6">
            {/* The first part of children (DashboardTools) will be rendered here */}
            {Array.isArray(children) && children.length > 0 ? children[0] : null}
          </div>
          
          {/* Board selection controls */}
          <div className="flex justify-between items-center mb-6">
            <BoardSelector 
              boards={boards}
              activeBoard={activeBoard}
              onBoardChange={onBoardChange}
              onCreateBoard={onCreateBoard}
            />
            <Link to="/general">
              <Button variant="outline" size="sm" className="gap-1">
                <KanbanSquare className="w-4 h-4" />
                General Board
              </Button>
            </Link>
          </div>
          
          {/* The rest of children (BoardContent) will be rendered here */}
          {Array.isArray(children) && children.length > 1 ? children.slice(1) : null}
        </div>
      </main>
    </div>
  );
};

export default BoardLayout;
