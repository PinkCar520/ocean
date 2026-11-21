import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle, DialogDescription } from './ui/dialog';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ApprovalModalProps {
  request: {
    id: string;
    toolName: string;
    args: any;
  } | null;
  onRespond: (status: 'approved' | 'denied') => void;
  submitting?: boolean;
  responseError?: boolean;
}

export function ApprovalModal({ request, onRespond, submitting, responseError }: ApprovalModalProps) {
  const { t } = useTranslation();
  if (!request) return null;

  return (
    <Dialog open>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onEscapeKeyDown={event => event.preventDefault()}
          onPointerDownOutside={event => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-border bg-card shadow-xl"
        >
          {/* Header */}
          <div className="bg-orange-50 p-6 border-b border-orange-100 flex items-center gap-4">
            <div className="p-3 bg-card rounded-xl shadow-sm">
              <ShieldAlert className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display text-base font-semibold leading-6 text-foreground">{t('chat.run_approval.title')}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">{t('chat.run_approval.description')}</DialogDescription>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div className="bg-muted p-4 rounded-xl border border-border">
              <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">{t('chat.run_approval.tool')}</p>
              <p className="font-mono text-sm text-foreground font-medium">{request.toolName}</p>
            </div>
            
            <div className="bg-muted p-4 rounded-xl border border-border">
              <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider mb-1">{t('chat.run_approval.arguments')}</p>
              <pre className="font-mono text-xs text-foreground whitespace-pre-wrap max-h-32 overflow-auto">
                {JSON.stringify(request.args, null, 2)}
              </pre>
            </div>
          </div>

          {responseError && <p role="alert" className="px-6 pb-3 text-xs text-destructive">{t('chat.run_approval.error')}</p>}

          {/* Footer */}
          <div className="p-6 border-t border-border flex gap-3 bg-background">
            <button
              type="button" disabled={submitting}
              onClick={() => onRespond('denied')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors"
            >
              <ShieldX className="w-4 h-4" />
              {t('chat.run_approval.deny')}
            </button>
            <button
              type="button" disabled={submitting}
              onClick={() => onRespond('approved')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-[#d44f0e] transition-all shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              {t('chat.run_approval.approve')}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
