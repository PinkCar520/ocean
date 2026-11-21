import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderMinus, FolderPlus, Link, Pencil, Share2, Pin, PinOff, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';
import { ConversationInvites, type ShareOwner } from './ConversationInvites';
import type { ConversationSummary } from '../../lib/useConversations';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '../ui/dropdown-menu';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

type Metadata = Pick<ConversationSummary, 'pinned' | 'projectId'>;
type Project = { id: string; name: string };

interface Props {
  sessionId: string | null;
  conversation?: ConversationSummary;
  shareLeafId?: string;
  shareOwner?: ShareOwner;
  link?: (id: string) => string;
  rename?: (id: string, title: string) => Promise<void>;
  remove?: (id: string) => Promise<void>;
  update?: (id: string, metadata: Metadata) => Promise<void>;
}

export function ConversationHeader({ sessionId, conversation, shareLeafId, shareOwner, link, rename, remove, update }: Props) {
  const { t } = useTranslation();
  const title = conversation?.title || t('sidebar.new_chat', 'New Chat');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [projectError, setProjectError] = useState('');
  const projectTriggerRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const focusTitleRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Project[] | null>(null);

  const projectId = conversation?.projectId;
  const projectName = projects?.find(project => project.id === projectId)?.name;
  const visibleProjects = projects?.filter(project => project.name.toLocaleLowerCase().includes(projectQuery.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!sessionId || (!projectOpen && !projectId)) return;
    const abort = new AbortController();
    api.get<{ data: Project[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/project-choices`, { signal: abort.signal })
      .then(result => { if (!abort.signal.aborted) setProjects(result.data); })
      .catch(() => { if (!abort.signal.aborted) setProjectError(t('chat.header.failed')); });
    return () => abort.abort();
  }, [projectOpen, projectId, sessionId, t]);

  async function perform(operation: () => Promise<void>, success?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success ?? '');
      setDeleteOpen(false);
    } catch {
      setError(t('chat.header.failed'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (draftTitle !== null && document.activeElement !== titleInputRef.current) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    } else if (draftTitle === null && focusTitleRef.current) {
      focusTitleRef.current = false;
      titleRef.current?.focus();
    }
  }, [draftTitle]);

  function beginRename() {
    if (!sessionId || !rename || busy) return;
    setError('');
    setNotice('');
    setDraftTitle(title);
  }

  function finishRename() {
    focusTitleRef.current = true;
    setDraftTitle(null);
  }

  async function saveTitle() {
    const nextTitle = draftTitle?.trim();
    if (!sessionId || !rename || busy || !nextTitle) return;
    if (nextTitle === title) {
      finishRename();
      return;
    }
    await perform(async () => {
      await rename(sessionId, nextTitle);
      finishRename();
    });
  }

  function showProjectMenu(open: boolean) {
    setProjectOpen(open);
    if (open) {
      setProjectQuery('');
      setProjectError('');
    }
  }

  async function changeProject(nextProjectId: string | null) {
    if (!sessionId || !update || busy) return;
    if (nextProjectId === projectId) {
      setMenuOpen(false);
      setProjectOpen(false);
      return;
    }
    setBusy(true);
    setProjectError('');
    setError('');
    try {
      await update(sessionId, { projectId: nextProjectId });
      setMenuOpen(false);
      setProjectOpen(false);
    } catch {
      setProjectError(t('chat.header.failed'));
    } finally {
      setBusy(false);
    }
  }

  function openDelete() {
    setError('');
    setNotice('');
    setDeleteOpen(true);
  }

  const control = 'titlebar-no-drag pointer-events-auto flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
  const button = 'rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50';
  const shareLabel = t('chat.header.share');

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {projectName && (
          <>
            <span className="titlebar-no-drag max-w-[35%] shrink-0 truncate text-sm text-muted-foreground" title={projectName}>
              {projectName}
            </span>
            <span aria-hidden="true" className="shrink-0 text-muted-foreground/60">/</span>
          </>
        )}
        {draftTitle === null ? (
          <button
            ref={titleRef}
            type="button"
            disabled={!sessionId || !rename || busy}
            className={`${control} min-w-0 font-medium`}
            title={title}
            aria-label={`${t('sidebar.rename')}: ${title}`}
            onDoubleClick={beginRename}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                beginRename();
              }
            }}
          >
            <span className="truncate">{title}</span>
          </button>
        ) : (
          <input
            ref={titleInputRef}
            aria-label={t('sidebar.rename')}
            className="titlebar-no-drag pointer-events-auto w-64 min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-medium outline-none focus:border-primary"
            value={draftTitle}
            readOnly={busy}
            onChange={event => setDraftTitle(event.target.value)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Enter') void saveTitle();
                else if (!busy) {
                  setError('');
                  finishRename();
                }
              }
            }}
          />
        )}
        <DropdownMenu open={menuOpen} onOpenChange={open => {
          setMenuOpen(open);
          if (!open) {
            setProjectOpen(false);
            setProjectError('');
          }
        }}>
          <Tooltip disableHoverableContent>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <button type="button" disabled={!sessionId || draftTitle !== null} className={`${control} shrink-0`} aria-label={t('chat.header.actions')}>
                  <ChevronDown size={15} className="text-muted-foreground" />
                </button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent variant="inverse" side="bottom" className="z-[10000]">{t('chat.header.actions')}</TooltipContent>
          </Tooltip>
          {sessionId && (
            <DropdownMenuContent align="start" sideOffset={8} onCloseAutoFocus={event => {
              if (titleInputRef.current) {
                event.preventDefault();
                titleInputRef.current.focus();
              }
            }} className="titlebar-no-drag z-[9999] min-w-48 bg-card text-foreground">
              <DropdownMenuItem disabled={!update || busy} onSelect={() => update && void perform(() => update(sessionId, { pinned: !conversation?.pinned }))}>
                {conversation?.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                {t(conversation?.pinned ? 'sidebar.unpin' : 'sidebar.pin')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!rename || busy} onSelect={beginRename}><Pencil size={16} />{t('sidebar.rename')}</DropdownMenuItem>
              <DropdownMenuSub open={projectOpen} onOpenChange={showProjectMenu}>
                <DropdownMenuSubTrigger ref={projectTriggerRef} disabled={!update || busy} className="gap-2">
                  <FolderPlus size={16} />
                  {t(projectId ? 'chat.header.changeProject' : 'chat.header.project')}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    ref={projectMenuRef}
                    sideOffset={6}
                    collisionPadding={8}
                    className="titlebar-no-drag z-[9999] w-64 max-w-[calc(100vw-1rem)] rounded-xl border-border bg-card text-foreground"
                    onEscapeKeyDown={event => {
                      event.preventDefault();
                      setProjectOpen(false);
                      projectTriggerRef.current?.focus();
                    }}
                  >
                    <input
                      type="text"
                      aria-label={t('chat.header.searchProjects')}
                      placeholder={t('chat.header.searchProjects')}
                      className="w-full rounded-md px-2.5 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                      value={projectQuery}
                      onChange={event => setProjectQuery(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Escape' || event.key === 'Tab') return;
                        event.stopPropagation();
                        if (!event.nativeEvent.isComposing && event.key === 'ArrowDown') {
                          event.preventDefault();
                          projectMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus();
                        }
                      }}
                    />
                    <DropdownMenuSeparator />
                    <div className="max-h-64 overflow-y-auto">
                      {visibleProjects?.map(project => (
                        <DropdownMenuItem
                          key={project.id}
                          disabled={busy}
                          onSelect={event => {
                            event.preventDefault();
                            void changeProject(project.id);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          {project.id === projectId && <Check size={16} aria-label={t('chat.header.currentProject')} className="shrink-0 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                      {!projectError && !visibleProjects?.length && (
                        <p role="status" className="px-2.5 py-2 text-sm text-muted-foreground">
                          {t(!projects ? 'chat.header.loadingProjects' : projectQuery.trim() ? 'chat.header.noProjectMatches' : 'chat.header.noProjects')}
                        </p>
                      )}
                    </div>
                    {projectError && <p role="alert" className="px-2.5 py-2 text-xs text-destructive">{projectError}</p>}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              {projectId && (
                <DropdownMenuItem disabled={!update || busy} onSelect={event => {
                  event.preventDefault();
                  void changeProject(null);
                }}>
                  <FolderMinus size={16} />{t('chat.header.removeProject')}
                </DropdownMenuItem>
              )}
              {!projectOpen && projectError && <p role="alert" className="px-2 py-1 text-xs text-destructive">{projectError}</p>}
              <DropdownMenuItem disabled={!link || busy} onSelect={() => link && void perform(() => navigator.clipboard.writeText(link(sessionId)), t('chat.header.linkCopied'))}>
                <Link size={16} />{t('chat.header.copyLink')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!remove || busy} className="text-destructive focus:text-destructive" onSelect={openDelete}>
                <Trash2 size={16} />{t('sidebar.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          )}
        </DropdownMenu>
        <span role="status" className="titlebar-no-drag shrink-0 text-xs text-muted-foreground">{notice || (!deleteOpen && error)}</span>
      </div>
      <DropdownMenu modal={false}>
        <Tooltip disableHoverableContent>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <button type="button" disabled={!sessionId} className={control} aria-label={shareLabel}>
                <Share2 size={16} />
              </button>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <TooltipContent variant="inverse" side="bottom" className="z-[10000]">{shareLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={10} collisionPadding={12} className="titlebar-no-drag pointer-events-auto z-[9999] w-[27rem] max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto border-border bg-card p-0 text-foreground">
          <div className="space-y-1.5 px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold">{shareLabel}</p>
              <DropdownMenuItem asChild className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md p-0 text-muted-foreground hover:bg-muted [&>svg]:size-5">
                <button type="button" aria-label={t('chat.header.closeShare')} title={t('chat.header.closeShare')}>
                  <X size={20} />
                </button>
              </DropdownMenuItem>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('chat.header.inviteDescription')}</p>
          </div>
          {sessionId && link && (
            <ConversationInvites sessionId={sessionId} leafId={shareLeafId} getLink={link} owner={shareOwner} />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={deleteOpen} onOpenChange={visible => { if (!visible && !busy) setDeleteOpen(false); }}>
        <DialogContent className="titlebar-no-drag">
          <DialogHeader>
            <DialogTitle>{t('sidebar.delete_chat_title')}</DialogTitle>
            <DialogDescription>{t('sidebar.delete_chat_desc', { title })}</DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <button type="button" disabled={busy} className={button} onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</button>
            {sessionId && remove && (
              <button type="button" disabled={busy} className={`${button} text-destructive`} onClick={() => void perform(() => remove(sessionId))}>{t('common.delete')}</button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
