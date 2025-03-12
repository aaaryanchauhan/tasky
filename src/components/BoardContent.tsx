
import React from "react";
import BoardColumn from "@/components/BoardColumn";
import { Column, ColumnId } from "@/types/task";
import DashboardTools from "./DashboardTools";

interface BoardContentProps {
  columns: Column[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
}

const BoardContent: React.FC<BoardContentProps> = ({
  columns,
  onAddTask,
  onTaskToggle,
  onTaskDelete,
  onMoveTask
}) => {
  // Calculate progress percentage
  const totalTasks = columns.reduce((total, column) => total + column.tasks.length, 0);
  const completedTasks = columns.find(col => col.id === "done")?.tasks.length || 0;
  const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return (
    <>
      <DashboardTools progressPercentage={progressPercentage} />
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
