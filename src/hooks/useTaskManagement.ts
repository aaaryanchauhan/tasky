
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Task, ColumnId } from "@/types/task";

export function useTaskManagement(
  columns: any[], 
  setColumns: React.Dispatch<React.SetStateAction<any[]>>,
  activeBoard: string
) {
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  const handleAddTask = (columnId: string) => {
    setActiveColumn(columnId);
    setIsAddTaskOpen(true);
  };

  const handleCreateTask = (taskData: { title: string; description: string; dueDate: Date | undefined }) => {
    if (activeColumn) {
      const newTask: Task = {
        id: uuidv4(),
        title: taskData.title,
        description: taskData.description,
        completed: false,
        columnId: activeColumn,
        dueDate: taskData.dueDate?.toISOString(),
        createdAt: new Date().toISOString(),
        boardId: activeBoard,
      };

      setColumns(columns.map(column => {
        if (column.id === activeColumn && column.boardId === activeBoard) {
          return {
            ...column,
            tasks: [...column.tasks, newTask]
          };
        }
        return column;
      }));

      toast.success("Task added successfully");
    }
  };

  const handleTaskToggle = (taskId: string) => {
    setColumns(columns.map(column => {
      const updatedTasks = column.tasks.map(task => {
        if (task.id === taskId) {
          const newCompletedState = !task.completed;
          
          if (newCompletedState && column.id !== "done") {
            toast.success("Task completed and moved to Done");
          } else if (!newCompletedState && column.id === "done") {
            toast.info("Task reopened and moved to To Do");
          }
          
          return { ...task, completed: newCompletedState };
        }
        return task;
      });

      return { ...column, tasks: updatedTasks };
    }));

    setTimeout(() => {
      setColumns(prevColumns => {
        let taskToMove: Task | null = null;
        let sourceColumnId: string | null = null;
        let targetColumnId: string | null = null;

        prevColumns.forEach(column => {
          column.tasks.forEach(task => {
            if (task.id === taskId) {
              taskToMove = task;
              sourceColumnId = column.id;
              targetColumnId = task.completed ? "done" : "todo";
            }
          });
        });

        if (sourceColumnId === targetColumnId || !taskToMove) {
          return prevColumns;
        }

        return prevColumns.map(column => {
          if (column.id === sourceColumnId && column.boardId === activeBoard) {
            return {
              ...column,
              tasks: column.tasks.filter(t => t.id !== taskId)
            };
          }
          if (column.id === targetColumnId && column.boardId === activeBoard && taskToMove) {
            return {
              ...column,
              tasks: [...column.tasks, { ...taskToMove, columnId: targetColumnId }]
            };
          }
          return column;
        });
      });
    }, 300);
  };

  const handleTaskDelete = (taskId: string) => {
    setColumns(prevColumns => {
      const newColumns = prevColumns.map(column => ({
        ...column,
        tasks: column.tasks.filter(task => task.id !== taskId)
      }));
      
      toast.success("Task deleted successfully");
      return newColumns;
    });
  };

  const handleMoveTask = (taskId: string, targetColumnId: ColumnId) => {
    setColumns(prevColumns => {
      let taskToMove: Task | null = null;
      let sourceColumnId: string | null = null;

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

      const newCompletedState = targetColumnId === "done";
      taskToMove.completed = newCompletedState;
      taskToMove.columnId = targetColumnId;

      if (targetColumnId === "inprogress") {
        toast.info("Task moved to In Progress");
      } else if (targetColumnId === "done") {
        toast.success("Task completed and moved to Done");
      } else if (targetColumnId === "todo") {
        toast.info("Task moved back to To Do");
      }

      return prevColumns.map(column => {
        if (column.id === sourceColumnId && column.boardId === activeBoard) {
          return {
            ...column,
            tasks: column.tasks.filter(t => t.id !== taskId)
          };
        }
        if (column.id === targetColumnId && column.boardId === activeBoard) {
          return {
            ...column,
            tasks: [...column.tasks, taskToMove!]
          };
        }
        return column;
      });
    });
  };

  return {
    isAddTaskOpen,
    setIsAddTaskOpen,
    handleAddTask,
    handleCreateTask,
    handleTaskToggle,
    handleTaskDelete,
    handleMoveTask
  };
}
