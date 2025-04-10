
import { useState, useEffect } from "react";
import { Column } from "@/types/task";
import { saveColumns, loadColumns } from "@/utils/localStorage";
import { generateInitialColumns } from "@/utils/boardUtils";

export function useColumnManagement(activeBoard: string) {
  const [columns, setColumns] = useState<Column[]>(() => {
    const savedColumns = loadColumns();
    return savedColumns || generateInitialColumns(activeBoard);
  });
  
  useEffect(() => {
    saveColumns(columns);
  }, [columns]);

  useEffect(() => {
    const boardColumns = columns.filter(col => col.boardId === activeBoard);
    if (boardColumns.length === 0) {
      setColumns(prev => [...prev, ...generateInitialColumns(activeBoard)]);
    }
  }, [activeBoard, columns]);

  const activeBoardColumns = columns.filter(column => column.boardId === activeBoard);

  return {
    columns,
    setColumns,
    activeBoardColumns
  };
}
