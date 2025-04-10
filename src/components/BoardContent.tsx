
import React, { useState } from "react";
import BoardColumn from "@/components/BoardColumn";
import { Column, ColumnId, Board, Task } from "@/types/task";
import DashboardTools from "./DashboardTools";
import BoardSelector from "@/components/BoardSelector";
import { KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskCard from "./TaskCard";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";
import { Progress } from "@/components/ui/progress";
import WebsiteLinks from "./WebsiteLinks";

interface BoardContentProps {
  columns: Column[];
  allColumns?: Column[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
  onEditTask?: (task: Task) => void;
  boards: Board[];
  activeBoard: string;
  onBoardChange: (boardId: string) => void;
  onCreateBoard: (boardName: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  dashboardToolsVisible?: boolean;
}

const BoardContent: React.FC<BoardContentProps> = ({
  columns,
  allColumns = [],
  onAddTask,
  onTaskToggle,
  onTaskDelete,
  onMoveTask,
  onEditTask,
  boards,
  activeBoard,
  onBoardChange,
  onCreateBoard,
  onDeleteBoard,
  dashboardToolsVisible = true
}) => {
  const [showGeneralView, setShowGeneralView] = useState(false);
  const { theme } = useTheme();
  const [isOver, setIsOver] = useState<{ [key: string]: boolean }>({});

  const totalTasks = columns.reduce((total, column) => total + column.tasks.length, 0);
  const completedTasks = columns.find(col => col.id === "done")?.tasks.length || 0;
  const progressPercentage = totalTasks === 0 ? 0 : Math.round(completedTasks / totalTasks * 100);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(prev => ({ ...prev, [columnId]: true }));
  };

  const handleDragLeave = (columnId: string) => {
    setIsOver(prev => ({ ...prev, [columnId]: false }));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, columnId: ColumnId) => {
    e.preventDefault();
    setIsOver(prev => ({ ...prev, [columnId]: false }));
    const taskId = e.dataTransfer.getData("taskId");
    const sourceColumnId = e.dataTransfer.getData("sourceColumnId") as ColumnId;
    if (taskId && sourceColumnId) {
      if (sourceColumnId !== columnId) {
        onMoveTask(taskId, columnId);
      }
    }
  };

  const getOrganizedColumns = (): Column[] => {
    if (!allColumns || allColumns.length === 0) return [];
    return ["todo", "inprogress", "done"].map(columnId => {
      const tasksForColumn: Task[] = [];
      allColumns.forEach(column => {
        if (column.id === columnId) {
          tasksForColumn.push(...column.tasks);
        }
      });
      return {
        id: columnId as ColumnId,
        title: columnId === "todo" ? "To Do" : columnId === "inprogress" ? "In Progress" : "Done",
        tasks: tasksForColumn,
        color: columnId === "todo" ? "bg-secondary" : columnId === "inprogress" ? "bg-blue-50 dark:bg-blue-950/30" : "bg-green-50 dark:bg-green-950/30",
        boardId: "general"
      };
    });
  };

  const handleGeneralViewSelect = () => {
    setShowGeneralView(true);
  };

  const handleBoardSelect = (boardId: string) => {
    if (boardId !== "general-view") {
      setShowGeneralView(false);
      onBoardChange(boardId);
    } else {
      setShowGeneralView(true);
    }
  };

  const handleReturnToBoard = () => {
    setShowGeneralView(false);
    onBoardChange('main');
  };
  
  const organizedColumns = getOrganizedColumns();
  const generalViewTotalTasks = organizedColumns.reduce((total, column) => total + column.tasks.length, 0);
  const generalViewCompletedTasks = organizedColumns.find(col => col.id === "done")?.tasks.length || 0;
  const generalViewProgressPercentage = generalViewTotalTasks === 0 ? 0 : Math.round(generalViewCompletedTasks / generalViewTotalTasks * 100);
  
  return (
    <>
      <WebsiteLinks className="mb-6" />
      
      <DashboardTools 
        progressPercentage={showGeneralView ? generalViewProgressPercentage : progressPercentage} 
        visible={dashboardToolsVisible}
      />
      
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Tasks Progress: {showGeneralView ? generalViewProgressPercentage : progressPercentage}% Complete
          </span>
          {showGeneralView && (
            <span className="text-sm text-muted-foreground">
              {generalViewCompletedTasks} of {generalViewTotalTasks} tasks
            </span>
          )}
        </div>
        <Progress value={showGeneralView ? generalViewProgressPercentage : progressPercentage} className="h-2" />
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <BoardSelector 
          boards={boards} 
          activeBoard={showGeneralView ? "general-view" : activeBoard} 
          onBoardChange={handleBoardSelect} 
          onCreateBoard={onCreateBoard}
          onDeleteBoard={onDeleteBoard} 
          onGeneralViewSelect={handleGeneralViewSelect} 
        />
        
        {showGeneralView ? (
          <Button variant="outline" size="sm" className="gap-1" onClick={handleReturnToBoard}>
            <KanbanSquare className="w-4 h-4" />
            Return to Board View
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleGeneralViewSelect} className="gap-1">
            <KanbanSquare className="w-4 h-4" />
            General View
          </Button>
        )}
      </div>
      
      {showGeneralView ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {organizedColumns.map(column => {
            const colorClass = theme === 'dark' && column.color === 'bg-secondary' ? 'bg-gray-800/50' : column.color;
            return (
              <div 
                key={column.id} 
                className={cn(
                  "min-h-[70vh] flex flex-col border overflow-hidden transition-colors duration-300 rounded-lg", 
                  colorClass, 
                  isOver[column.id] && "ring-2 ring-primary ring-inset"
                )} 
                onDragOver={e => handleDragOver(e, column.id)} 
                onDragLeave={() => handleDragLeave(column.id)} 
                onDrop={e => handleDrop(e, column.id as ColumnId)}
              >
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="bg-secondary text-secondary-foreground text-xs font-medium px-2 py-1 rounded-full">
                        {column.tasks.length}
                      </span>
                      <h3 className="text-lg font-medium">{column.title}</h3>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="flex flex-col gap-2">
                    {column.tasks.map(task => (
                      <TaskCard 
                        key={task.id} 
                        task={task} 
                        onToggle={onTaskToggle} 
                        onMove={onMoveTask} 
                        onDelete={onTaskDelete} 
                        onEdit={onEditTask} 
                        currentColumnId={column.id as ColumnId} 
                        showBoardLabel={true}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map(column => (
            <BoardColumn 
              key={`${column.boardId}-${column.id}`} 
              id={column.id} 
              title={column.title} 
              tasks={column.tasks} 
              onAddTask={onAddTask} 
              onTaskToggle={onTaskToggle} 
              onTaskDelete={onTaskDelete} 
              onMoveTask={onMoveTask} 
              onEditTask={onEditTask} 
              color={column.color} 
            />
          ))}
        </div>
      )}
    </>
  );
};

export default BoardContent;
