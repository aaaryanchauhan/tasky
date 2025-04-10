
import { v4 as uuidv4 } from "uuid";
import { Board, Column } from "@/types/task";

export const generateInitialColumns = (boardId: string): Column[] => [
  {
    id: "todo",
    title: "To Do",
    tasks: [],
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

export const initialBoards: Board[] = [
  {
    id: "main",
    title: "Main Board",
    createdAt: new Date().toISOString(),
  },
];
