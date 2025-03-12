
import React from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TaskCard from "./TaskCard";
import { Task, ColumnId } from "@/types/task";
import { cn } from "@/lib/utils";
import { useTheme } from "./ThemeProvider";

interface BoardColumnProps {
  title: string;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
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
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
          <span className="bg-secondary text-secondary-foreground text-xs font-medium px-2 py-1 rounded-full">
            {tasks.length}
          </span>
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
              currentColumnId={id as ColumnId}
            />
          ))}
        </div>
      </CardContent>
      <button
        onClick={() => onAddTask(id)}
        className="m-3 p-2 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
      >
        <Plus size={16} />
        <span>Add Task</span>
      </button>
    </Card>
  );
};

export default BoardColumn;
