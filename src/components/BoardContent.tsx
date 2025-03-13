
import React from "react";
import BoardColumn from "@/components/BoardColumn";
import { Column, ColumnId, Board } from "@/types/task";
import DashboardTools from "./DashboardTools";
import BoardSelector from "@/components/BoardSelector";
import { KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface BoardContentProps {
  columns: Column[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
  boards: Board[];
  activeBoard: string;
  onBoardChange: (boardId: string) => void;
  onCreateBoard: (boardName: string) => void;
}

const BoardContent: React.FC<BoardContentProps> = ({
  columns,
  onAddTask,
  onTaskToggle,
  onTaskDelete,
  onMoveTask,
  boards,
  activeBoard,
  onBoardChange,
  onCreateBoard
}) => {
  // Calculate progress percentage
  const totalTasks = columns.reduce((total, column) => total + column.tasks.length, 0);
  const completedTasks = columns.find(col => col.id === "done")?.tasks.length || 0;
  const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return (
    <>
      {/* Dashboard tools component */}
      <DashboardTools progressPercentage={progressPercentage} />
      
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Tasks Progress: {progressPercentage}% Complete</span>
        </div>
        <div className="w-full progress-bar-custom mb-4">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>
      
      {/* Board selection controls - between progress bar and columns */}
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
      
      {/* Board columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map((column) => (
          <BoardColumn
            key={`${column.boardId}-${column.id}`}
            id={column.id}
            title={column.title}
            tasks={column.tasks}
            onAddTask={onAddTask}
            onTaskToggle={onTaskToggle}
            onTaskDelete={onTaskDelete}
            onMoveTask={onMoveTask}
            color={column.color}
          />
        ))}
      </div>
    </>
  );
};

export default BoardContent;
