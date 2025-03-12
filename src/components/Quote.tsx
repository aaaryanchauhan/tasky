
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Edit, Check } from 'lucide-react';

const Quote: React.FC = () => {
  const [quote, setQuote] = useState("The secret of getting ahead is getting started.");
  const [isEditing, setIsEditing] = useState(false);
  const [tempQuote, setTempQuote] = useState(quote);

  const handleEditToggle = () => {
    if (isEditing) {
      setQuote(tempQuote);
    } else {
      setTempQuote(quote);
    }
    setIsEditing(!isEditing);
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Daily Quote</h3>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleEditToggle}
          className="h-8 w-8"
        >
          {isEditing ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
        </Button>
      </div>
      
      {isEditing ? (
        <Textarea
          value={tempQuote}
          onChange={(e) => setTempQuote(e.target.value)}
          className="flex-1 resize-none"
          placeholder="Enter your inspirational quote here..."
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-2">
          <blockquote className="italic text-muted-foreground">"{quote}"</blockquote>
        </div>
      )}
    </Card>
  );
};

export default Quote;
