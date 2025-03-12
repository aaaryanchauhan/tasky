
import React from "react";
import { useTaskBoard } from "@/hooks/useTaskBoard";
import BoardLayout from "@/components/BoardLayout";
import BoardContent from "@/components/BoardContent";
import AddTaskDialog from "@/components/AddTaskDialog";

const Index = () => {
  const {
    boards,
    activeBoard,
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

  // Create a board content instance to pass as children
  const boardContent = (
    <BoardContent
      columns={activeBoardColumns}
      onAddTask={handleAddTask}
      onTaskToggle={handleTaskToggle}
      onTaskDelete={handleTaskDelete}
      onMoveTask={handleMoveTask}
    />
  );

  return (
    <BoardLayout
      boards={boards}
      activeBoard={activeBoard}
      onBoardChange={handleBoardChange}
      onCreateBoard={handleCreateBoard}
    >
      {boardContent}

      <AddTaskDialog
        open={isAddTaskOpen}
        onOpenChange={setIsAddTaskOpen}
        onAddTask={handleCreateTask}
      />
    </BoardLayout>
  );
};

export default Index;
