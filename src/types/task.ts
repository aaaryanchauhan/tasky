
export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  columnId: string;
  dueDate?: string;
  createdAt: string;
  boardId: string;
}

export interface Column {
  id: string;
  title: string;
  tasks: Task[];
  color?: string;
  boardId: string;
}

export interface Board {
  id: string;
  title: string;
  createdAt: string;
}

export type ColumnId = "todo" | "inprogress" | "done";

export interface DragItem {
  type: string;
  id: string;
  columnId: string;
}
