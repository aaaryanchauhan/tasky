
import React from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Column, ColumnId } from "@/types/task";
import GeneralBoard from "./GeneralBoard";
import { loadColumns, saveColumns } from "@/utils/localStorage";

const GeneralBoardContainer = () => {
  const [columns, setColumns] = React.useState<Column[]>(() => {
    const savedColumns = loadColumns();
    return savedColumns || [];
  });

  React.useEffect(() => {
    saveColumns(columns);
  }, [columns]);

  const handleTaskToggle = (taskId: string) => {
    setColumns(prevColumns => 
      prevColumns.map(column => ({
        ...column,
        tasks: column.tasks.map(task => 
          task.id === taskId 
            ? { ...task, completed: !task.completed }
            : task
        )
      }))
    );
  };

  const handleMoveTask = (taskId: string, targetColumnId: ColumnId) => {
    setColumns(prevColumns => {
      let taskToMove = null;
      let sourceColumnId = null;

      // Find the task and its source column
      prevColumns.forEach(column => {
        const task = column.tasks.find(t => t.id === taskId);
        if (task) {
          taskToMove = { ...task };
          sourceColumnId = column.id;
        }
      });

      if (!taskToMove || sourceColumnId === targetColumnId) {
        return prevColumns;
      }

      // Update task's completed status based on target column
      taskToMove.completed = targetColumnId === "done";
      taskToMove.columnId = targetColumnId;

      // Return updated columns
      return prevColumns.map(column => {
        if (column.id === sourceColumnId) {
          return {
            ...column,
            tasks: column.tasks.filter(t => t.id !== taskId)
          };
        }
        if (column.id === targetColumnId) {
          return {
            ...column,
            tasks: [...column.tasks, taskToMove!]
          };
        }
        return column;
      });
    });
  };

  return (
    <GeneralBoard
      columns={columns}
      onTaskToggle={handleTaskToggle}
      onMoveTask={handleMoveTask}
    />
  );
};

export default GeneralBoardContainer;
