
import { Board, Column, Task } from "@/types/task";

export const STORAGE_KEYS = {
  BOARDS: "kanban-boards",
  COLUMNS: "kanban-columns",
  THEME: "theme-mode",
};

export const saveBoards = (boards: Board[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.BOARDS, JSON.stringify(boards));
  } catch (error) {
    console.error("Error saving boards to localStorage:", error);
  }
};

export const saveColumns = (columns: Column[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.COLUMNS, JSON.stringify(columns));
  } catch (error) {
    console.error("Error saving columns to localStorage:", error);
  }
};

export const loadBoards = (): Board[] | null => {
  try {
    const boards = localStorage.getItem(STORAGE_KEYS.BOARDS);
    return boards ? JSON.parse(boards) : null;
  } catch (error) {
    console.error("Error loading boards from localStorage:", error);
    return null;
  }
};

export const loadColumns = (): Column[] | null => {
  try {
    const columns = localStorage.getItem(STORAGE_KEYS.COLUMNS);
    return columns ? JSON.parse(columns) : null;
  } catch (error) {
    console.error("Error loading columns from localStorage:", error);
    return null;
  }
};
