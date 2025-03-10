
import React from "react";
import { cn } from "@/lib/utils";
import { Check, Calendar, MoreHorizontal, ArrowLeft, ArrowRight } from "lucide-react";
import { Task, ColumnId } from "@/types/task";

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onMove: (id: string, targetColumnId: ColumnId) => void;
  currentColumnId: ColumnId;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onToggle, onMove, currentColumnId }) => {
  const handleMoveLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentColumnId === "inprogress") {
      onMove(task.id, "todo");
    } else if (currentColumnId === "done") {
      onMove(task.id, "inprogress");
    }
  };

  const handleMoveRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentColumnId === "todo") {
      onMove(task.id, "inprogress");
    } else if (currentColumnId === "inprogress") {
      onMove(task.id, "done");
    }
  };

  return (
    <div 
      className={cn(
        "task-card bg-white dark:bg-gray-800 rounded-lg border p-3 group animate-slide-in",
        "hover:border-primary/30 cursor-pointer",
        "touch-manipulation"
      )}
      onClick={() => onToggle(task.id)}
    >
      <div className="flex items-start gap-2">
        <button 
          className={cn(
            "flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border border-muted-foreground/30 flex items-center justify-center",
            task.completed ? "bg-primary border-primary" : ""
          )}
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
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {currentColumnId !== "todo" && (
            <button 
              onClick={handleMoveLeft}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              aria-label="Move left"
            >
              <ArrowLeft size={14} className="text-muted-foreground" />
            </button>
          )}
          {currentColumnId !== "done" && (
            <button 
              onClick={handleMoveRight}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
              aria-label="Move right"
            >
              <ArrowRight size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
