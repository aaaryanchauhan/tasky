
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Board, Column, Task, ColumnId } from "@/types/task";
import { saveBoards, saveColumns, loadBoards, loadColumns } from "@/utils/localStorage";

export const generateInitialColumns = (boardId: string): Column[] => [
  {
    id: "todo",
    title: "To Do",
    tasks: [
      {
        id: uuidv4(),
        title: "Create new task",
        description: "Add a brief task description",
        completed: false,
        columnId: "todo",
        createdAt: new Date().toISOString(),
        boardId,
      },
    ],
    color: "bg-secondary",
    boardId,
  },
  {
    id: "inprogress",
    title: "In Progress",
    tasks: [],
    color: "bg-blue-50 dark:bg-blue-950/30",
    boardId,
  },
  {
    id: "done",
    title: "Done",
    tasks: [],
    color: "bg-green-50 dark:bg-green-950/30",
    boardId,
  },
];

const initialBoards: Board[] = [
  {
    id: "main",
    title: "Main Board",
    createdAt: new Date().toISOString(),
  },
];

export function useTaskBoard() {
  const [boards, setBoards] = useState<Board[]>(() => {
    const savedBoards = loadBoards();
    return savedBoards || initialBoards;
  });
  
  const [activeBoard, setActiveBoard] = useState<string>(() => {
    const savedBoards = loadBoards();
    return savedBoards && savedBoards.length > 0 ? savedBoards[0].id : initialBoards[0].id;
  });
  
  const [columns, setColumns] = useState<Column[]>(() => {
    const savedColumns = loadColumns();
    return savedColumns || generateInitialColumns(activeBoard);
  });
  
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  useEffect(() => {
    saveBoards(boards);
  }, [boards]);

  useEffect(() => {
    saveColumns(columns);
  }, [columns]);

  useEffect(() => {
    const boardColumns = columns.filter(col => col.boardId === activeBoard);
    if (boardColumns.length === 0) {
      setColumns(prev => [...prev, ...generateInitialColumns(activeBoard)]);
    }
  }, [activeBoard]);

  const handleBoardChange = (boardId: string) => {
    setActiveBoard(boardId);
  };

  const handleCreateBoard = (boardName: string) => {
    const newBoardId = uuidv4();
    
    const newBoard: Board = {
      id: newBoardId,
      title: boardName,
      createdAt: new Date().toISOString(),
    };
    
    setBoards([...boards, newBoard]);
    
    const newColumns = generateInitialColumns(newBoardId);
    setColumns([...columns, ...newColumns]);
    
    setActiveBoard(newBoardId);
    
    toast.success(`Board "${boardName}" created`);
  };

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

  const activeBoardColumns = columns.filter(column => column.boardId === activeBoard);

  return {
    boards,
    activeBoard,
    columns,
    activeBoardColumns,
    isAddTaskOpen,
    setIsAddTaskOpen,
    handleBoardChange,
    handleCreateBoard,
    handleAddTask,
    handleCreateTask,
    handleTaskToggle,
    handleTaskDelete,
    handleMoveTask
  };
}
