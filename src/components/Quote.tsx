import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Note {
  id: string;
  text: string;
  completed: boolean;
}

const Notes: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>(() => {
    const savedNotes = localStorage.getItem('tasky-notes');
    return savedNotes ? JSON.parse(savedNotes) : [
      { id: uuidv4(), text: 'Add your notes here', completed: false }
    ];
  });
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [viewAll, setViewAll] = useState(false);

  useEffect(() => {
    localStorage.setItem('tasky-notes', JSON.stringify(notes));
  }, [notes]);

  const handleAddNote = () => {
    if (newNote.trim()) {
      const note = {
        id: uuidv4(),
        text: newNote.trim(),
        completed: false
      };
      setNotes([...notes, note]);
      setNewNote('');
      setIsAdding(false);
    }
  };

  const handleToggleNote = (id: string) => {
    setNotes(notes.map(note => 
      note.id === id ? { ...note, completed: !note.completed } : note
    ));
  };

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter(note => note.id !== id));
  };

  const visibleNotes = viewAll ? notes : notes.slice(0, 3);

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Notes</h3>
        <div className="flex items-center gap-1">
          {notes.length > 3 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewAll(!viewAll)}
              className="h-8 text-xs flex items-center gap-1"
            >
              {viewAll ? (
                <>Show Less <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>View All <ChevronDown className="h-3 w-3" /></>
              )}
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsAdding(true)}
            className="h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 overflow-y-auto" style={{ height: '200px' }}>
        <div className="space-y-2 pr-2">
          {visibleNotes.length === 0 && !isAdding && (
            <div className="text-center py-4 text-muted-foreground">
              No notes yet. Click the + button to add one.
            </div>
          )}
          
          {visibleNotes.map(note => (
            <div 
              key={note.id} 
              className="flex items-start gap-2 p-2 border rounded-md group hover:bg-secondary/50"
            >
              <Checkbox 
                checked={note.completed}
                onCheckedChange={() => handleToggleNote(note.id)}
                className="mt-1"
              />
              <span className={`flex-1 ${note.completed ? 'line-through text-muted-foreground' : ''}`}>
                {note.text}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteNote(note.id)}
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
          
          {isAdding && (
            <div className="flex items-center gap-2 p-2 border rounded-md bg-secondary/20">
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a new note..."
                autoFocus
                className="text-sm"
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setIsAdding(false);
                  setNewNote('');
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
};

export default Notes;
