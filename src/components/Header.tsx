import React from "react";
import { Check, Moon, Sun, Eye, EyeOff } from "lucide-react";
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
      toast.info(dashboardToolsVisible ? "Tools section hidden" : "Tools section visible");
    }
  };

  return (
    <header className="border-b py-3 px-4 bg-background/80 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-x-4">
          <h1 className="text-xl font-medium flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Check size={20} className="text-primary-foreground" />
            </div>
            Tasky
          </h1>
        </div>
        <div className="flex items-center gap-x-2">
          {onToggleDashboardTools && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={handleToggleDashboardTools}
              aria-label={dashboardToolsVisible ? "Hide tools section" : "Show tools section"}
              title={dashboardToolsVisible ? "Hide tools section" : "Show tools section"}
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
