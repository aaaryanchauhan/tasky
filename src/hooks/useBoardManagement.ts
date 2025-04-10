
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Board } from "@/types/task";
import { saveBoards, loadBoards } from "@/utils/localStorage";
import { initialBoards, generateInitialColumns } from "@/utils/boardUtils";

export function useBoardManagement(setColumns: React.Dispatch<React.SetStateAction<any[]>>) {
  const [boards, setBoards] = useState<Board[]>(() => {
    const savedBoards = loadBoards();
    return savedBoards || initialBoards;
  });
  
  const [activeBoard, setActiveBoard] = useState<string>(() => {
    const savedBoards = loadBoards();
    return savedBoards && savedBoards.length > 0 ? savedBoards[0].id : initialBoards[0].id;
  });

  useEffect(() => {
    saveBoards(boards);
  }, [boards]);

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
    setColumns(prev => [...prev, ...newColumns]);
    
    setActiveBoard(newBoardId);
    
    toast.success(`Board "${boardName}" created`);
  };

  const handleDeleteBoard = (boardId: string) => {
    // Don't allow deleting the last board
    if (boards.length <= 1) {
      toast.error("Cannot delete the only board");
      return;
    }
    
    // Get the board name for the toast message
    const boardToDelete = boards.find(board => board.id === boardId);
    if (!boardToDelete) return;
    
    // Remove the board
    const updatedBoards = boards.filter(board => board.id !== boardId);
    setBoards(updatedBoards);
    
    // Remove all columns associated with this board
    setColumns(prev => prev.filter(column => column.boardId !== boardId));
    
    // If the active board is being deleted, switch to another board
    if (activeBoard === boardId) {
      setActiveBoard(updatedBoards[0].id);
    }
    
    toast.success(`Board "${boardToDelete.title}" deleted`);
  };

  return {
    boards,
    activeBoard,
    handleBoardChange,
    handleCreateBoard,
    handleDeleteBoard
  };
}
