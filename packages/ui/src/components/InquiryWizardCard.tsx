import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import type { UIInquiryStep } from '../types/ui-protocol';
import { Button } from './ui/button';
import { Input } from './ui/input';

export interface InquiryWizardCardProps {
  skillName: string;
  description?: string;
  inquiries: UIInquiryStep[];
  onComplete: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

export function InquiryWizardCard({
  skillName,
  description,
  inquiries,
  onComplete,
  onCancel
}: InquiryWizardCardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textValue, setTextValue] = useState('');

  if (!inquiries || inquiries.length === 0) {
    return null;
  }

  const step = inquiries[currentStep];

  const handleSelectEnum = (option: string) => {
    const newAnswers = { ...answers, [step.question]: option };
    setAnswers(newAnswers);
    goToNext(newAnswers);
  };

  const handleTextSubmit = () => {
    if (!textValue.trim()) return;
    const newAnswers = { ...answers, [step.question]: textValue.trim() };
    setAnswers(newAnswers);
    setTextValue('');
    goToNext(newAnswers);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTextSubmit();
    }
  };

  const goToNext = (currentAnswers: Record<string, string>) => {
    if (currentStep < inquiries.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(currentAnswers);
    }
  };

  const goToPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="bg-card border border-border/80 rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-[600px] mt-4 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#2b7fff]/10 p-1.5 rounded-lg">
              <Sparkles className="w-4 h-4 text-[#2b7fff]" />
            </div>
            <h4 className="text-sm font-bold text-foreground">{step.question}</h4>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
              <button 
                onClick={goToPrev}
                disabled={currentStep === 0}
                className="hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[40px] text-center">
                {currentStep + 1} of {inquiries.length}
              </span>
              <button 
                disabled={true}
                className="opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {description && currentStep === 0 && (
          <p className="text-xs text-muted-foreground pl-9">{description}</p>
        )}
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-3">
        {step.type === 'enum' && step.options && (
          <div className="flex flex-col gap-2">
            {step.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelectEnum(opt)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-border/60 bg-card hover:bg-muted/50 hover:border-primary/30 transition-all text-sm font-medium text-left text-foreground group"
              >
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-muted text-[10px] font-mono text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {i + 1}
                  </span>
                  {opt}
                </div>
              </button>
            ))}
          </div>
        )}

        {step.type === 'text' && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Enter your answer..."
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 rounded-xl h-11 bg-muted/20"
            />
            <Button onClick={handleTextSubmit} size="icon" className="h-11 w-11 rounded-xl">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border/50 bg-muted/20 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Skip
        </Button>
      </div>
    </div>
  );
}
