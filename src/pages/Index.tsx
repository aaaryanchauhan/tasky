import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Column, Task, ColumnId } from "@/types/task";
import BoardColumn from "@/components/BoardColumn";
import AddTaskDialog from "@/components/AddTaskDialog";
import Header from "@/components/Header";
import WaveBackground from "@/components/WaveBackground";

const initialColumns: Column[] = [
  {
    id: "todo",
    title: "To Do",
    tasks: [
      {
        id: uuidv4(),
        title: "Research competitors",
        description: "Look at similar products in the market",
        completed: false,
        columnId: "todo",
        createdAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        title: "Create project plan",
        description: "Define timeline, resources and deliverables",
        completed: false,
        columnId: "todo",
        dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    color: "bg-secondary"
  },
  {
    id: "inprogress",
    title: "In Progress",
    tasks: [
      {
        id: uuidv4(),
        title: "Design user interface",
        description: "Create wireframes and mockups",
        completed: false,
        columnId: "inprogress",
        dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    color: "bg-blue-50 dark:bg-blue-950/30"
  },
  {
    id: "done",
    title: "Done",
    tasks: [
      {
        id: uuidv4(),
        title: "Initial project setup",
        description: "Set up repository and development environment",
        completed: true,
        columnId: "done",
        createdAt: new Date().toISOString(),
      },
    ],
    color: "bg-green-50 dark:bg-green-950/30"
  },
];

const Index = () => {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
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
      };

      setColumns(columns.map(column => {
        if (column.id === activeColumn) {
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
          
          // Move task to appropriate column if needed
          if (newCompletedState && column.id !== "done") {
            // Task was completed but not in Done column - will be moved in next step
            toast.success("Task completed and moved to Done");
          } else if (!newCompletedState && column.id === "done") {
            // Task was uncompleted but in Done column - will be moved in next step
            toast.info("Task reopened and moved to To Do");
          }
          
          return { ...task, completed: newCompletedState };
        }
        return task;
      });

      return { ...column, tasks: updatedTasks };
    }));

    // Move tasks between columns based on completion status
    setTimeout(() => {
      setColumns(prevColumns => {
        let taskToMove: Task | null = null;
        let sourceColumnId: string | null = null;
        let targetColumnId: string | null = null;

        // Find the task to move
        prevColumns.forEach(column => {
          column.tasks.forEach(task => {
            if (task.id === taskId) {
              taskToMove = task;
              sourceColumnId = column.id;
              targetColumnId = task.completed ? "done" : "todo";
            }
          });
        });

        // If task is already in the right column, don't move it
        if (sourceColumnId === targetColumnId || !taskToMove) {
          return prevColumns;
        }

        // Remove task from source column and add to target column
        return prevColumns.map(column => {
          if (column.id === sourceColumnId) {
            return {
              ...column,
              tasks: column.tasks.filter(t => t.id !== taskId)
            };
          }
          if (column.id === targetColumnId && taskToMove) {
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
      // Find the task and its current column
      let taskToMove: Task | null = null;
      let sourceColumnId: string | null = null;

      // Find the task to move
      prevColumns.forEach(column => {
        const task = column.tasks.find(t => t.id === taskId);
        if (task) {
          taskToMove = { ...task };
          sourceColumnId = column.id;
        }
      });

      // If task not found or already in the target column, do nothing
      if (!taskToMove || sourceColumnId === targetColumnId) {
        return prevColumns;
      }

      // Update task's completed status based on the target column
      const newCompletedState = targetColumnId === "done";
      taskToMove.completed = newCompletedState;
      taskToMove.columnId = targetColumnId;

      // Show appropriate toast message
      if (targetColumnId === "inprogress") {
        toast.info("Task moved to In Progress");
      } else if (targetColumnId === "done") {
        toast.success("Task completed and moved to Done");
      } else if (targetColumnId === "todo") {
        toast.info("Task moved back to To Do");
      }

      // Remove task from source column and add to target column
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

  const handleCreateBoard = () => {
    toast.info("This feature will be available soon!");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <WaveBackground />
      <Header onCreateBoard={handleCreateBoard} />
      
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-semibold mb-6">Main Board</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={column.tasks}
                onAddTask={handleAddTask}
                onTaskToggle={handleTaskToggle}
                onMoveTask={handleMoveTask}
                color={column.color}
              />
            ))}
          </div>
        </div>
      </main>

      <AddTaskDialog
        open={isAddTaskOpen}
        onOpenChange={setIsAddTaskOpen}
        onAddTask={handleCreateTask}
      />
    </div>
  );
};

export default Index;
