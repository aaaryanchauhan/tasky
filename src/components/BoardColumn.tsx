
import React from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TaskCard from "./TaskCard";
import { Task, ColumnId } from "@/types/task";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";

interface BoardColumnProps {
  title: string;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
  onEditTask?: (task: Task) => void;
  id: string;
  color?: string;
}

const BoardColumn: React.FC<BoardColumnProps> = ({
  title,
  tasks,
  onAddTask,
  onTaskToggle,
  onTaskDelete,
  onMoveTask,
  onEditTask,
  id,
  color = "bg-secondary"
}) => {
  const { theme } = useTheme();
  // Setup drag handlers for the column
  const [isOver, setIsOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    
    const taskId = e.dataTransfer.getData("taskId");
    const sourceColumnId = e.dataTransfer.getData("sourceColumnId") as ColumnId;
    
    if (taskId && sourceColumnId) {
      if (sourceColumnId !== id) {
        onMoveTask(taskId, id as ColumnId);
      }
    }
  };

  // Determine the color class based on the theme
  const colorClass = theme === 'dark' && color === 'bg-secondary' 
    ? 'bg-gray-800/50' 
    : color;

  return (
    <Card 
      className={cn(
        "board-column min-h-[70vh] flex flex-col border overflow-hidden transition-colors duration-300", 
        colorClass,
        isOver && "ring-2 ring-primary ring-inset"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-secondary text-secondary-foreground text-xs font-medium px-2 py-1 rounded-full">
              {tasks.length}
            </span>
            <CardTitle className="text-lg font-medium">{title}</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onAddTask(id)}
            className="p-0 h-8 w-8 rounded-full"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onToggle={onTaskToggle}
              onDelete={onTaskDelete}
              onMove={onMoveTask}
              onEdit={onEditTask}
              currentColumnId={id as ColumnId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default BoardColumn;
