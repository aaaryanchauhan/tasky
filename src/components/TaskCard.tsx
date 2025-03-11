
import React from "react";
import { cn } from "@/lib/utils";
import { Check, Calendar, GripVertical } from "lucide-react";
import { Task, ColumnId } from "@/types/task";

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onMove: (id: string, targetColumnId: ColumnId) => void;
  currentColumnId: ColumnId;
  showBoardLabel?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  onToggle, 
  onMove, 
  currentColumnId,
  showBoardLabel = false
}) => {
  // Setup drag handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.setData("sourceColumnId", currentColumnId);
    e.dataTransfer.effectAllowed = "move";
    
    // Add a slight delay to improve visual feedback
    setTimeout(() => {
      e.currentTarget.classList.add("opacity-50");
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove("opacity-50");
  };

  return (
    <div 
      className={cn(
        "task-card bg-white dark:bg-gray-800 rounded-lg border p-3 group animate-slide-in",
        "hover:border-primary/30 cursor-grab active:cursor-grabbing",
        "touch-manipulation relative"
      )}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {showBoardLabel && (
        <div className="absolute top-0 right-0 bg-primary text-xs text-white px-1.5 py-0.5 rounded-bl-md rounded-tr-md">
          {task.boardId}
        </div>
      )}
      <div className="flex items-start gap-2">
        <button 
          className={cn(
            "flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border border-muted-foreground/30 flex items-center justify-center",
            task.completed ? "bg-primary border-primary" : ""
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task.id);
          }}
        >
          {task.completed && <Check size={12} className="text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <h3 
            className={cn(
              "font-medium text-sm break-words mb-1", 
              task.completed && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className={cn(
              "text-xs text-muted-foreground mb-2",
              task.completed && "line-through opacity-70"
            )}>
              {task.description}
            </p>
          )}
          {task.dueDate && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar size={12} />
              <span>{new Date(task.dueDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-muted-foreground cursor-grab">
            <GripVertical size={16} />
          </span>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
