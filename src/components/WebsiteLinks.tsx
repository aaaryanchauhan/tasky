import React, { useState, useEffect } from "react";
import { Plus, Link as LinkIcon, X, Loader2, FolderPlus, ChevronDown, ChevronRight, Folder, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Website {
  id: string;
  url: string;
  favicon: string;
  title: string;
  folderId?: string;
  customName?: string;
  position: number;
}

interface WebsiteFolder {
  id: string;
  name: string;
  isOpen: boolean;
}

interface WebsiteLinksProps {
  className?: string;
}

const WebsiteLinks: React.FC<WebsiteLinksProps> = ({ className }) => {
  const [websites, setWebsites] = useLocalStorage<Website[]>("tasky-websites", []);
  const [folders, setFolders] = useLocalStorage<WebsiteFolder[]>("tasky-website-folders", []);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [customName, setCustomName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useLocalStorage<boolean>("tasky-quicklinks-visible", true);
  const [draggedWebsite, setDraggedWebsite] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragOverWebsiteId, setDragOverWebsiteId] = useState<string | null>(null);

  const handleAddLink = () => {
    setIsAddingLink(true);
    setIsAddingFolder(false);
  };

  const handleAddFolder = () => {
    setIsAddingFolder(true);
    setIsAddingLink(false);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error("Please enter a folder name");
      return;
    }

    const newFolder: WebsiteFolder = {
      id: Date.now().toString(),
      name: newFolderName,
      isOpen: true
    };

    setFolders([...folders, newFolder]);
    setNewFolderName("");
    setIsAddingFolder(false);
    toast.success("Folder created");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUrl) return;
    
    // Basic URL validation
    let url = newUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    try {
      // Check if it's a valid URL
      new URL(url);
      
      setIsLoading(true);
      
      // Extract domain for favicon
      const domain = new URL(url).hostname;
      
      // Get max position for the target folder
      const targetFolderWebsites = websites.filter(w => w.folderId === selectedFolder);
      const newPosition = getMaxPosition(targetFolderWebsites);
      
      // Create a new website object
      const newWebsite: Website = {
        id: Date.now().toString(),
        url: url,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        title: domain.replace('www.', ''),
        customName: customName.trim() || undefined,
        folderId: selectedFolder,
        position: newPosition
      };
      
      // Add to list
      setWebsites([...websites, newWebsite]);
      setNewUrl("");
      setCustomName("");
      setIsAddingLink(false);
      toast.success("Website added successfully!");
      
    } catch (error) {
      toast.error("Please enter a valid URL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveWebsite = (id: string) => {
    setWebsites(websites.filter(website => website.id !== id));
    toast.success("Website removed");
  };

  const handleRemoveFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling folder when removing
    
    // Remove folder
    setFolders(folders.filter(folder => folder.id !== folderId));
    
    // Move websites in this folder back to root
    const updatedWebsites = websites.map(website => 
      website.folderId === folderId ? { ...website, folderId: undefined } : website
    );
    
    setWebsites(updatedWebsites);
    toast.success("Folder removed");
  };

  const toggleFolderOpen = (folderId: string) => {
    setFolders(folders.map(folder => 
      folder.id === folderId ? { ...folder, isOpen: !folder.isOpen } : folder
    ));
  };

  const handleDragStart = (e: React.DragEvent, websiteId: string) => {
    e.dataTransfer.setData("websiteId", websiteId);
    e.dataTransfer.setData("sourceType", "website");
    setDraggedWebsite(websiteId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string | null = null, websiteId: string | null = null) => {
    e.preventDefault();
    e.stopPropagation(); // Add this to prevent event bubbling
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
    setDragOverWebsiteId(websiteId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Add this to prevent event bubbling
    setDropTargetId(null);
    setDragOverWebsiteId(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null = null, targetWebsiteId: string | null = null) => {
    e.preventDefault();
    e.stopPropagation(); // Add this to prevent event bubbling
    
    const websiteId = e.dataTransfer.getData("websiteId");
    const sourceType = e.dataTransfer.getData("sourceType");
    
    if (!websiteId || sourceType !== "website") return;

    const websiteToMove = websites.find(w => w.id === websiteId);
    if (!websiteToMove) return;

    if (targetWebsiteId && targetWebsiteId !== websiteId) {
      // Reorder within same context (folder or root)
      reorderWebsites(websiteId, targetWebsiteId);
    } else {
      // Move to folder or root
      const targetFolderWebsites = websites.filter(w => w.folderId === targetFolderId);
      const newPosition = getMaxPosition(targetFolderWebsites);

      const updatedWebsites = websites.map(website => 
        website.id === websiteId 
          ? { ...website, folderId: targetFolderId, position: newPosition }
          : website
      );
      
      setWebsites(updatedWebsites);
      toast.success(targetFolderId ? "Link moved to folder" : "Link moved out of folder");
    }
    
    setDraggedWebsite(null);
    setDropTargetId(null);
    setDragOverWebsiteId(null);
  };

  const getMaxPosition = (websiteList: Website[]) => {
    return Math.max(...websiteList.map(w => w.position), -1) + 1;
  };

  const reorderWebsites = (websiteId: string, targetWebsiteId: string) => {
    const websitesCopy = [...websites];
    const sourceIndex = websitesCopy.findIndex(w => w.id === websiteId);
    const targetIndex = websitesCopy.findIndex(w => w.id === targetWebsiteId);
    
    if (sourceIndex === -1 || targetIndex === -1) return;
    
    const [movedWebsite] = websitesCopy.splice(sourceIndex, 1);
    websitesCopy.splice(targetIndex, 0, movedWebsite);
    
    // Update positions
    const updatedWebsites = websitesCopy.map((website, index) => ({
      ...website,
      position: index
    }));
    
    setWebsites(updatedWebsites);
    toast.success("Link reordered successfully");
  };

  const sortedWebsites = [...websites].sort((a, b) => a.position - b.position);
  const rootWebsites = sortedWebsites.filter(website => !website.folderId);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
    toast.info(isVisible ? "Quick links hidden" : "Quick links visible");
  };

  if (!isVisible) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" onClick={toggleVisibility} className="gap-1 w-full justify-start">
          <Eye className="w-4 h-4" />
          Show Quick Links
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium">Quick Links</h2>
        <div className="flex gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleAddLink}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Add Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddFolder}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Add Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={toggleVisibility} title="Hide Quick Links">
            <EyeOff className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isAddingFolder && (
          <Card className="inline-block w-auto">
            <CardContent className="p-2">
              <form onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }} className="flex gap-2">
                <div className="relative flex-1">
                  <Folder className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Enter folder name"
                    className="pl-8 w-48"
                    autoFocus
                  />
                </div>
                <Button type="submit" size="sm" disabled={!newFolderName}>Add</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingFolder(false)}>
                  Cancel
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {isAddingLink && (
          <Card className="w-full max-w-md">
            <CardContent className="p-2">
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="Enter website URL"
                    className="pl-8"
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
                <Input 
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Custom name (optional)"
                  disabled={isLoading}
                />
                <div className="flex items-center gap-2">
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={selectedFolder || ""}
                    onChange={(e) => setSelectedFolder(e.target.value || null)}
                  >
                    <option value="">No folder (root)</option>
                    {folders.map(folder => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" disabled={!newUrl || isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingLink(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div 
          className="flex flex-wrap gap-2" 
          onDragOver={(e) => handleDragOver(e)}
          onDragLeave={(e) => handleDragLeave(e)}
          onDrop={(e) => handleDrop(e)}
          style={{ minHeight: "40px" }}
        >
          {rootWebsites.map((website) => (
            <Card 
              key={website.id} 
              className={cn(
                "relative group inline-block",
                dragOverWebsiteId === website.id && "ring-2 ring-primary"
              )}
              draggable
              onDragStart={(e) => handleDragStart(e, website.id)}
              onDragOver={(e) => handleDragOver(e, null, website.id)}
              onDrop={(e) => handleDrop(e, null, website.id)}
            >
              <CardContent className="p-2 flex items-center gap-2">
                <a 
                  href={website.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center gap-2"
                >
                  <img 
                    src={website.favicon} 
                    alt={website.title} 
                    className="w-6 h-6" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                  <span className="text-sm pr-5">{website.customName || website.title}</span>
                </a>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-5 h-5 p-0 opacity-0 group-hover:opacity-100 absolute top-1 right-1"
                  onClick={() => handleRemoveWebsite(website.id)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
          
          {folders.map((folder) => (
            <Collapsible 
              key={folder.id} 
              open={folder.isOpen} 
              onOpenChange={() => toggleFolderOpen(folder.id)}
              className="inline-block"
            >
              <Card 
                className={cn(
                  "relative group cursor-pointer",
                  dropTargetId === folder.id && "ring-2 ring-primary"
                )}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDragLeave={(e) => handleDragLeave(e)}
                onDrop={(e) => handleDrop(e, folder.id)}
              >
                <CardContent className="p-2">
                  <CollapsibleTrigger className="flex items-center gap-2 w-full pr-6">
                    {folder.isOpen ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    )}
                    <Folder className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium truncate">{folder.name}</span>
                  </CollapsibleTrigger>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-5 h-5 p-0 opacity-0 group-hover:opacity-100 absolute top-2 right-2"
                    onClick={(e) => handleRemoveFolder(folder.id, e)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </CardContent>
              </Card>
              
              <CollapsibleContent className="mt-1 ml-4 flex flex-wrap gap-2">
                {sortedWebsites
                  .filter(website => website.folderId === folder.id)
                  .map((website) => (
                    <Card 
                      key={website.id} 
                      className={cn(
                        "relative group",
                        dragOverWebsiteId === website.id && "ring-2 ring-primary"
                      )}
                      draggable
                      onDragStart={(e) => handleDragStart(e, website.id)}
                      onDragOver={(e) => handleDragOver(e, folder.id, website.id)}
                      onDrop={(e) => handleDrop(e, folder.id, website.id)}
                    >
                      <CardContent className="p-2 flex items-center gap-2">
                        <a 
                          href={website.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex items-center gap-2"
                        >
                          <img 
                            src={website.favicon} 
                            alt={website.title} 
                            className="w-6 h-6" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/placeholder.svg";
                            }}
                          />
                          <span className="text-sm pr-5">{website.customName || website.title}</span>
                        </a>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-5 h-5 p-0 opacity-0 group-hover:opacity-100 absolute top-1 right-1"
                          onClick={() => handleRemoveWebsite(website.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WebsiteLinks;
