import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Send, Pen, CheckCircle2, CornerDownLeft } from 'lucide-react';
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

  useEffect(() => {
    if (inquiries && currentStep < inquiries.length) {
      const step = inquiries[currentStep];
      const answer = answers[step.question];
      if (answer && step.options && step.options.includes(answer)) {
        setTextValue('');
      } else {
        setTextValue(answer || '');
      }
    }
  }, [currentStep, inquiries, answers]);

  if (!inquiries || inquiries.length === 0) {
    return null;
  }

  const isReviewPage = currentStep === inquiries.length;
  const step = isReviewPage ? null : inquiries[currentStep];

  const handleSelectEnum = (option: string) => {
    if (!step) return;
    const newAnswers = { ...answers, [step.question]: option };
    setAnswers(newAnswers);
    goToNext(newAnswers);
  };

  const handleTextSubmit = () => {
    if (!step || !textValue.trim()) return;
    const newAnswers = { ...answers, [step.question]: textValue.trim() };
    setAnswers(newAnswers);
    goToNext(newAnswers);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTextSubmit();
    }
  };

  const goToNext = (currentAnswers: Record<string, string>) => {
    setCurrentStep(currentStep + 1);
  };

  const goToPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const submitAll = () => {
    onComplete(answers);
  };

  if (isReviewPage) {
    return (
      <div className="w-full bg-card border border-border/80 rounded-[20px] mt-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="px-5 py-3 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[15px] font-bold text-foreground">Overview & Confirm</h4>
            <div className="flex items-center gap-3">
              <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Please review your answers before submitting.</p>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {inquiries.map((inq, idx) => (
              <div key={idx} className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-muted/60 border border-border/50 relative group">
                <div className="text-[13px] font-medium text-foreground flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[11px]">{idx + 1}.</span> 
                  {inq.question}
                </div>
                <div className="text-[14px] text-muted-foreground pl-5 break-words">
                  {answers[inq.question] || <span className="italic opacity-50">Skipped</span>}
                </div>
                <button 
                  onClick={() => setCurrentStep(idx)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-xs text-primary hover:underline transition-opacity"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4">
            <Button variant="ghost" onClick={goToPrev} size="icon" className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button onClick={submitAll} size="icon" className="h-10 w-10 rounded-full bg-[#EC5B14] hover:bg-[#D44A0D] text-white shadow-sm shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  return (
    <div className="w-full bg-card border border-border/80 rounded-[20px] mt-0 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="px-5 py-3 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-[14px] font-bold text-foreground">{step.question}</h4>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 mr-4">
              <button 
                onClick={goToPrev}
                disabled={currentStep === 0}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground transition-colors",
                  currentStep === 0 ? "opacity-30 cursor-not-allowed" : "hover:text-foreground hover:bg-foreground/5"
                )}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] text-muted-foreground font-mono px-1">
                {currentStep + 1} of {inquiries.length}
              </span>
              <button 
                onClick={() => goToNext(answers)}
                disabled={!answers[step?.question || ''] || isReviewPage}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground transition-colors",
                  (!answers[step?.question || ''] || isReviewPage) ? "opacity-30 cursor-not-allowed" : "hover:text-foreground hover:bg-foreground/5"
                )}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <button onClick={onCancel} className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {description && currentStep === 0 && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        {step.type === 'enum' && step.options && (
          <div className="flex flex-col gap-1 mb-2 px-2">
            {step.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelectEnum(opt)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition-all text-[14px] font-medium text-left group",
                  answers[step.question] === opt
                    ? "bg-foreground/5 text-foreground"
                    : "hover:bg-foreground/5 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono transition-colors",
                    answers[step.question] === opt
                      ? "bg-foreground/10 text-foreground"
                      : "bg-muted/50 text-muted-foreground/70 group-hover:bg-foreground/10 group-hover:text-foreground"
                  )}>
                    {i + 1}
                  </span>
                  {opt}
                </div>
                <div className={cn(
                  "text-muted-foreground pr-1",
                  answers[step.question] === opt ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="bg-muted/70 rounded-xl p-1.5 flex items-center gap-2">
          {step.type === 'enum' ? (
            <>
              <div className="pl-3 text-muted-foreground">
                <Pen className="w-4 h-4" />
              </div>
              <Input
                placeholder="Something else"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 h-9 bg-transparent border-0 focus-visible:ring-0 px-2 text-[14px] shadow-none"
              />
              {textValue.trim() || answers[step.question] ? (
                <Button size="sm" onClick={() => textValue.trim() ? handleTextSubmit() : goToNext(answers)} disabled={!answers[step.question] && !textValue.trim()} className="h-7 px-4 rounded-full text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground ml-auto">
                  {currentStep === inquiries.length - 1 ? 'Review' : 'Next'}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => goToNext({ ...answers, [step.question]: 'Skipped' })} className="h-7 px-4 rounded-md text-xs font-semibold bg-background border border-border/80 shadow-none hover:bg-muted text-foreground ml-auto">
                  Skip
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 w-full pl-2">
              <Input
                autoFocus
                placeholder="Enter your answer..."
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 h-11 bg-transparent border-0 focus-visible:ring-0 px-2 text-[14px] shadow-none"
              />
              <Button 
                onClick={handleTextSubmit} 
                size="icon" 
                className="h-10 w-10 rounded-full bg-[#EC5B14] hover:bg-[#D44A0D] text-white shrink-0 mr-0.5"
                disabled={!textValue.trim() && !answers[step.question]}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
