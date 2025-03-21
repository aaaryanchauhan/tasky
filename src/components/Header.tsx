
import React, { useState } from "react";
import { MoveHorizontal, Moon, Sun, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./ThemeProvider";
import { toast } from "sonner";

interface HeaderProps {
  onToggleDashboardTools?: () => void;
  dashboardToolsVisible?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  onToggleDashboardTools,
  dashboardToolsVisible = true
}) => {
  const { theme, toggleTheme } = useTheme();

  const handleToggleDashboardTools = () => {
    if (onToggleDashboardTools) {
      onToggleDashboardTools();
      toast.info(dashboardToolsVisible ? "Dashboard tools hidden" : "Dashboard tools visible");
    }
  };

  return (
    <header className="border-b py-3 px-4 bg-background/80 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <MoveHorizontal size={24} className="text-primary" /> TaskFlow
          </h1>
        </div>
        <div className="flex items-center gap-x-2">
          {onToggleDashboardTools && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={handleToggleDashboardTools}
              aria-label={dashboardToolsVisible ? "Hide dashboard tools" : "Show dashboard tools"}
              title={dashboardToolsVisible ? "Hide dashboard tools" : "Show dashboard tools"}
            >
              {dashboardToolsVisible ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
