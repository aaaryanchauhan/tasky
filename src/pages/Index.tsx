
import React, { useState } from "react";
import { useTaskBoard } from "@/hooks/useTaskBoard";
import BoardLayout from "@/components/BoardLayout";
import BoardContent from "@/components/BoardContent";
import AddTaskDialog from "@/components/AddTaskDialog";
import { Task } from "@/types/task";

const Index = () => {
  const {
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
  } = useTaskBoard();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditMode(true);
    setIsAddTaskOpen(true);
  };

  const handleSaveEditedTask = (taskData: { title: string; description: string; dueDate: Date | undefined }) => {
    if (selectedTask) {
      const updatedTask = {
        ...selectedTask,
        title: taskData.title,
        description: taskData.description,
        dueDate: taskData.dueDate?.toISOString()
      };
      
      // Find and update the task in the correct column
      const newColumns = columns.map(column => {
        if (column.boardId === selectedTask.boardId) {
          return {
            ...column,
            tasks: column.tasks.map(task => 
              task.id === selectedTask.id ? updatedTask : task
            )
          };
        }
        return column;
      });
      
      // Update the tasks in localStorage
      localStorage.setItem('taskflow-columns', JSON.stringify(newColumns));
      
      // Reload the page to refresh the data
      window.location.reload();
    }
  };

  return (
    <BoardLayout
      boards={boards}
      activeBoard={activeBoard}
      onBoardChange={handleBoardChange}
      onCreateBoard={handleCreateBoard}
    >
      <BoardContent
        columns={activeBoardColumns}
        allColumns={columns}
        onAddTask={handleAddTask}
        onTaskToggle={handleTaskToggle}
        onTaskDelete={handleTaskDelete}
        onMoveTask={handleMoveTask}
        onEditTask={handleEditTask}
        boards={boards}
        activeBoard={activeBoard}
        onBoardChange={handleBoardChange}
        onCreateBoard={handleCreateBoard}
      />

      <AddTaskDialog
        open={isAddTaskOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditMode(false);
            setSelectedTask(null);
          }
          setIsAddTaskOpen(open);
        }}
        onAddTask={isEditMode && selectedTask ? handleSaveEditedTask : handleCreateTask}
        initialData={isEditMode && selectedTask ? {
          title: selectedTask.title,
          description: selectedTask.description || "",
          dueDate: selectedTask.dueDate ? new Date(selectedTask.dueDate) : undefined
        } : undefined}
        mode={isEditMode ? "edit" : "add"}
      />
    </BoardLayout>
  );
};

export default Index;
