
import React, { useState, useEffect } from "react";
import { Plus, Link as LinkIcon, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface Website {
  id: string;
  url: string;
  favicon: string;
  title: string;
}

interface WebsiteLinksProps {
  className?: string;
}

const WebsiteLinks: React.FC<WebsiteLinksProps> = ({ className }) => {
  const [websites, setWebsites] = useLocalStorage<Website[]>("taskflow-websites", []);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAddLink = () => {
    setIsAddingLink(true);
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
      
      // Create a new website object
      const newWebsite: Website = {
        id: Date.now().toString(),
        url: url,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        title: domain.replace('www.', '')
      };
      
      // Add to list
      setWebsites([...websites, newWebsite]);
      setNewUrl("");
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

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium">Quick Links</h2>
        <Button variant="outline" size="sm" onClick={handleAddLink} className="gap-1">
          <Plus className="w-4 h-4" />
          Add Link
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {websites.length > 0 ? (
          websites.map((website) => (
            <Card key={website.id} className="relative group">
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
                  <span className="text-sm">{website.title}</span>
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
          ))
        ) : !isAddingLink ? (
          <p className="text-sm text-muted-foreground">No links added yet. Click "Add Link" to get started.</p>
        ) : null}
        
        {isAddingLink && (
          <Card className="w-full max-w-md">
            <CardContent className="p-2">
              <form onSubmit={handleSubmit} className="flex gap-2">
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
                <Button type="submit" size="sm" disabled={!newUrl || isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingLink(false)}>
                  Cancel
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default WebsiteLinks;
