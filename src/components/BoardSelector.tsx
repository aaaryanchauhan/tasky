
import React, { useState } from "react";
import { Plus, LayoutDashboard, Trash2 } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Board } from "@/types/task";
import { toast } from "sonner";

interface BoardSelectorProps {
  boards: Board[];
  activeBoard: string;
  onBoardChange: (boardId: string) => void;
  onCreateBoard: (boardName: string) => void;
  onDeleteBoard?: (boardId: string) => void;
  onGeneralViewSelect: () => void;
}

const BoardSelector: React.FC<BoardSelectorProps> = ({
  boards,
  activeBoard,
  onBoardChange,
  onCreateBoard,
  onDeleteBoard,
  onGeneralViewSelect,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<string | null>(null);

  const handleCreateBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBoardName.trim()) {
      onCreateBoard(newBoardName.trim());
      setNewBoardName("");
      setIsDialogOpen(false);
    }
  };

  const handleSelectChange = (value: string) => {
    if (value === "general-view") {
      onGeneralViewSelect();
    } else {
      onBoardChange(value);
    }
  };

  const handleDeleteClick = () => {
    if (onDeleteBoard && boardToDelete) {
      onDeleteBoard(boardToDelete);
      setIsDeleteDialogOpen(false);
      setBoardToDelete(null);
    }
  };

  const openDeleteDialog = (boardId: string) => {
    setBoardToDelete(boardId);
    setIsDeleteDialogOpen(true);
  };

  const getBoardName = (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    return board ? board.title : "";
  };

  return (
    <div className="flex items-center gap-2">
      <LayoutDashboard className="w-5 h-5 text-primary" />
      <div className="flex-1">
        <Select 
          value={activeBoard} 
          onValueChange={handleSelectChange}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Select a board" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general-view">General View</SelectItem>
            {boards.map(board => (
              <SelectItem key={board.id} value={board.id}>
                <div className="flex items-center justify-between w-full pr-2">
                  <span>{board.title}</span>
                  {onDeleteBoard && boards.length > 1 && (
                    <Trash2 
                      className="h-4 w-4 text-destructive ml-2 hover:text-destructive/80 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(board.id);
                      }}
                    />
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setIsDialogOpen(true)}
        className="gap-1"
      >
        <Plus className="w-4 h-4" />
        New Board
      </Button>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateBoard}>
            <DialogHeader>
              <DialogTitle>Create New Board</DialogTitle>
              <DialogDescription>
                Add a new board to organize your tasks
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Board Name</Label>
                <Input
                  id="name"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="Enter board name"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!newBoardName.trim()}>
                Create Board
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{boardToDelete ? getBoardName(boardToDelete) : ""}"? 
              This action cannot be undone and all tasks in this board will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBoardToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteClick}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BoardSelector;
