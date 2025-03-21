
import React, { useState } from "react";
import { Plus, LayoutDashboard } from "lucide-react";
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
  DialogFooter 
} from "@/components/ui/dialog";
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
  onGeneralViewSelect: () => void;
}

const BoardSelector: React.FC<BoardSelectorProps> = ({
  boards,
  activeBoard,
  onBoardChange,
  onCreateBoard,
  onGeneralViewSelect,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

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

  return (
    <div className="flex items-center gap-2 mb-6">
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
                {board.title}
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
    </div>
  );
};

export default BoardSelector;
