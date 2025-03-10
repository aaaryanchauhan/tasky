
import React from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TaskCard from "./TaskCard";
import { Task } from "@/types/task";
import { cn } from "@/lib/utils";

interface BoardColumnProps {
  title: string;
  tasks: Task[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  id: string;
  color?: string;
}

const BoardColumn: React.FC<BoardColumnProps> = ({
  title,
  tasks,
  onAddTask,
  onTaskToggle,
  id,
  color = "bg-secondary"
}) => {
  return (
    <Card className={cn("board-column min-h-[70vh] flex flex-col border overflow-hidden", color)}>
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
            <TaskCard key={task.id} task={task} onToggle={onTaskToggle} />
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
