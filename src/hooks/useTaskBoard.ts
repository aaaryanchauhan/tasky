
import { useColumnManagement } from "./useColumnManagement";
import { useBoardManagement } from "./useBoardManagement";
import { useTaskManagement } from "./useTaskManagement";

export function useTaskBoard() {
  // Initialize column management hook
  const { columns, setColumns, activeBoardColumns } = useColumnManagement("main");
  
  // Initialize board management hook with setColumns from column management
  const { 
    boards, 
    activeBoard, 
    handleBoardChange, 
    handleCreateBoard, 
    handleDeleteBoard 
  } = useBoardManagement(setColumns);
  
  // Initialize task management hook with columns, setColumns and activeBoard
  const {
    isAddTaskOpen,
    setIsAddTaskOpen,
    handleAddTask,
    handleCreateTask,
    handleTaskToggle,
    handleTaskDelete,
    handleMoveTask
  } = useTaskManagement(columns, setColumns, activeBoard);

  return {
    // Return everything from all hooks
    boards,
    activeBoard,
    columns,
    activeBoardColumns,
    isAddTaskOpen,
    setIsAddTaskOpen,
    handleBoardChange,
    handleCreateBoard,
    handleDeleteBoard,
    handleAddTask,
    handleCreateTask,
    handleTaskToggle,
    handleTaskDelete,
    handleMoveTask
  };
}
