
import React from "react";
import { MoveHorizontal, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HeaderProps {
  onCreateBoard: () => void;
}

const Header: React.FC<HeaderProps> = ({ onCreateBoard }) => {
  return (
    <header className="border-b py-3 px-4 bg-background/80 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <MoveHorizontal size={24} className="text-primary" /> TaskFlow
          </h1>
          <div className="hidden md:flex relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              className="pl-8 w-[200px] bg-white dark:bg-gray-800"
            />
          </div>
        </div>
        <div className="flex items-center gap-x-2">
          <Button onClick={onCreateBoard} variant="default">
            New Board
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
