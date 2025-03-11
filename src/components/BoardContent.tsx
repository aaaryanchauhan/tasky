
import React from "react";
import BoardColumn from "@/components/BoardColumn";
import { Column, ColumnId } from "@/types/task";

interface BoardContentProps {
  columns: Column[];
  onAddTask: (columnId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
}

const BoardContent: React.FC<BoardContentProps> = ({
  columns,
  onAddTask,
  onTaskToggle,
  onMoveTask
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {columns.map((column) => (
        <BoardColumn
          key={`${column.boardId}-${column.id}`}
          id={column.id}
          title={column.title}
          tasks={column.tasks}
          onAddTask={onAddTask}
          onTaskToggle={onTaskToggle}
          onMoveTask={onMoveTask}
          color={column.color}
        />
      ))}
    </div>
  );
};

export default BoardContent;
