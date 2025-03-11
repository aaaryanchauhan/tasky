
import React from "react";
import { Task, Column, ColumnId } from "@/types/task";
import { toast } from "sonner";
import Header from "@/components/Header";
import WaveBackground from "@/components/WaveBackground";
import TaskCard from "@/components/TaskCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MusicPlayer from "@/components/MusicPlayer";
import { Progress } from "@/components/ui/progress";

interface GeneralBoardProps {
  columns: Column[];
  onTaskToggle: (taskId: string) => void;
  onMoveTask: (taskId: string, targetColumnId: ColumnId) => void;
}

const GeneralBoard: React.FC<GeneralBoardProps> = ({ 
  columns, 
  onTaskToggle, 
  onMoveTask 
}) => {
  const { theme } = useTheme();
  const [isOver, setIsOver] = React.useState<{ [key: string]: boolean }>({});
  
  // Group all tasks by column type, while preserving their board info
  const organizedColumns: Column[] = ["todo", "inprogress", "done"].map(columnId => {
    const tasksForColumn: Task[] = [];
    
    columns.forEach(column => {
      if (column.id === columnId) {
        tasksForColumn.push(...column.tasks);
      }
    });
    
    return {
      id: columnId as ColumnId,
      title: columnId === "todo" ? "To Do" : columnId === "inprogress" ? "In Progress" : "Done",
      tasks: tasksForColumn,
      color: columnId === "todo" 
        ? "bg-secondary" 
        : columnId === "inprogress" 
          ? "bg-blue-50 dark:bg-blue-950/30" 
          : "bg-green-50 dark:bg-green-950/30",
      boardId: "general"
    };
  });

  // Calculate progress percentage
  const totalTasks = organizedColumns.reduce((total, column) => total + column.tasks.length, 0);
  const completedTasks = organizedColumns.find(col => col.id === "done")?.tasks.length || 0;
  const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(prev => ({ ...prev, [columnId]: true }));
  };

  const handleDragLeave = (columnId: string) => {
    setIsOver(prev => ({ ...prev, [columnId]: false }));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, columnId: ColumnId) => {
    e.preventDefault();
    setIsOver(prev => ({ ...prev, [columnId]: false }));
    
    const taskId = e.dataTransfer.getData("taskId");
    const sourceColumnId = e.dataTransfer.getData("sourceColumnId") as ColumnId;
    
    if (taskId && sourceColumnId) {
      if (sourceColumnId !== columnId) {
        onMoveTask(taskId, columnId);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <WaveBackground />
      <Header />
      
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="outline" size="sm" className="gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Boards
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">General Board Overview</h1>
            </div>
          </div>
          
          <div className="bg-background border rounded-lg p-4 mb-6">
            <MusicPlayer />
          </div>
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress: {progressPercentage}% Complete</span>
              <span className="text-sm text-muted-foreground">{completedTasks} of {totalTasks} tasks</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
          
          <p className="text-muted-foreground mb-4">
            This board shows all tasks from all your boards in one place.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {organizedColumns.map((column) => {
            // Determine the color class based on the theme
            const colorClass = theme === 'dark' && column.color === 'bg-secondary' 
              ? 'bg-gray-800/50' 
              : column.color;
            
            return (
              <Card 
                key={column.id}
                className={cn(
                  "min-h-[70vh] flex flex-col border overflow-hidden transition-colors duration-300", 
                  colorClass,
                  isOver[column.id] && "ring-2 ring-primary ring-inset"
                )}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={() => handleDragLeave(column.id)}
                onDrop={(e) => handleDrop(e, column.id as ColumnId)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-medium">{column.title}</CardTitle>
                    <span className="bg-secondary text-secondary-foreground text-xs font-medium px-2 py-1 rounded-full">
                      {column.tasks.length}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="flex flex-col gap-2">
                    {column.tasks.map((task) => (
                      <div key={task.id} className="relative">
                        <TaskCard 
                          task={task} 
                          onToggle={onTaskToggle} 
                          onMove={onMoveTask}
                          currentColumnId={column.id as ColumnId}
                        />
                        <div className="absolute top-0 right-0 bg-primary text-xs text-white px-2 py-0.5 rounded-bl-md rounded-tr-md">
                          {columns.find(col => col.boardId === task.boardId && col.id === task.columnId)?.boardId ? 
                            columns.find(c => c.boardId === task.boardId)?.boardId : "Unknown"}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default GeneralBoard;
