import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, Globe, Link, Lock, UserMinus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, type ApiError } from '../../lib/api-client';

export type ShareOwner = { name?: string | null; email?: string | null; avatar?: string | null };

type Recipient = { id: string; name: string | null; workId: string };

type Invitation = {
  id: string;
  recipient: { name: string | null; workId: string; avatar?: string | null; email?: string | null };
};

function ShareAvatar({ avatar, email, name }: ShareOwner) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const showAvatar = avatar && avatar !== failedAvatar;
  const initial = Array.from(email?.trim() || name?.trim() || '')[0]?.toLocaleUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full ${showAvatar ? 'bg-muted' : 'border border-dashed border-muted-foreground/50 text-xs font-semibold text-muted-foreground'}`}
    >
      {showAvatar ? (
        <img src={avatar} alt="" className="size-8 rounded-full object-cover" onError={() => setFailedAvatar(avatar)} />
      ) : initial || <UserRound size={16} />}
    </span>
  );
}

export function ConversationInvites({ sessionId, leafId, getLink, owner }: {
  sessionId: string;
  leafId?: string;
  owner?: ShareOwner;
  getLink: (sessionId: string) => string;
}) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);
  const [publicShareId, setPublicShareId] = useState<string | null>(null);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/shares`;

  useEffect(() => {
    const abort = new AbortController();
    api.get<{ data: Invitation[]; publicShareId: string | null }>(endpoint, { signal: abort.signal })
      .then(result => {
        if (abort.signal.aborted) return;
        setInvitations(result.data);
        setPublicShareId(result.publicShareId);
      })
      .catch(() => { if (!abort.signal.aborted) setError(t('chat.header.inviteLoadFailed')); });
    return () => abort.abort();
  }, [endpoint, t]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !leafId || busy || !invitations) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!recipient) {
        const result = await api.post<{ data: Recipient }>(
          `/api/sessions/${encodeURIComponent(sessionId)}/share-recipient`,
          { identifier: identifier.trim() },
        );
        setRecipient(result.data);
        return;
      }
      const result = await api.post<{ data: Invitation }>(endpoint, { recipientId: recipient.id, leafId });
      setInvitations(current => [result.data, ...(current ?? [])]);
      setSelectedInviteId(result.data.id);
      setIdentifier('');
      setRecipient(null);
      setNotice(t('chat.header.invited'));
    } catch (failure) {
      const status = (failure as ApiError).status;
      setError(t(status === 409 ? 'chat.header.alreadyInvited' : status === 400 ? (recipient ? 'chat.header.invalidInvite' : 'chat.header.recipientNotFound') : 'chat.header.failed'));
    } finally {
      setBusy(false);
    }
  }

  const selectedInvite = invitations?.find(invitation => invitation.id === selectedInviteId) ?? invitations?.[0];

  async function copyConversationLink() {
    setError('');
    setNotice('');
    try {
      const conversationUrl = getLink(sessionId);
      const url = publicShareId
        ? new URL(`/shared/public/${encodeURIComponent(publicShareId)}`, conversationUrl).href
        : selectedInvite
          ? new URL(`/shared/chat/${encodeURIComponent(selectedInvite.id)}`, conversationUrl).href
          : conversationUrl;
      await navigator.clipboard.writeText(url);
      setNotice(t(!publicShareId && selectedInvite ? 'chat.header.inviteLinkCopied' : 'chat.header.linkCopied'));
    } catch {
      setError(t('chat.header.failed'));
    }
  }

  async function saveGeneralAccess(makePublic: boolean) {
    if (busy || (makePublic && !leafId)) return;
    setBusy(true);
    setError('');
    setNotice('');
    const accessEndpoint = `/api/sessions/${encodeURIComponent(sessionId)}/public-share`;
    try {
      if (makePublic) {
        const result = await api.post<{ data: { id: string } }>(accessEndpoint, { leafId });
        setPublicShareId(result.data.id);
      } else {
        await api.delete(accessEndpoint);
        setPublicShareId(null);
        setNotice(t('chat.header.publicSharingStopped'));
      }
      setConfirmPublic(false);
    } catch {
      setError(t('chat.header.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.delete(`${endpoint}/${encodeURIComponent(id)}`);
      setInvitations(current => current?.filter(invitation => invitation.id !== id) ?? []);
      setNotice(t('chat.header.inviteRevoked'));
    } catch {
      setError(t('chat.header.failed'));
    } finally {
      setBusy(false);
    }
  }

  const publicAccessSelected = Boolean(publicShareId || confirmPublic);
  const shareActionClass = 'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-normal leading-5 disabled:opacity-50';
  const iconButton = 'grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50';
  return (
    <section className="space-y-4 px-5 pb-5 pt-4" onKeyDown={event => {
      if (event.key !== 'Escape') event.stopPropagation();
    }}>
      <form onSubmit={invite} className="flex items-center gap-2">
        <input
          type="text"
          aria-label={t('chat.header.inviteIdentity')}
          placeholder={t('chat.header.inviteIdentity')}
          autoComplete="off"
          maxLength={254}
          value={identifier}
          disabled={busy}
          onChange={event => {
            setIdentifier(event.target.value);
            setRecipient(null);
            setError('');
            setNotice('');
          }}
          className="min-w-0 flex-1 rounded-md border-0 bg-foreground/5 px-2.5 py-1 text-sm leading-5 focus-visible:outline-1 focus-visible:outline-primary"
        />
        <button type="submit" disabled={!identifier.trim() || !leafId || busy || !invitations} className={`${shareActionClass} shrink-0 bg-primary text-primary-foreground transition-[filter] enabled:hover:brightness-90`}>
          {t('chat.header.invite')}
        </button>
      </form>
      {recipient && (
        <p role="status" className="rounded-md bg-muted px-2.5 py-1.5 text-sm">
          {[recipient.name, recipient.workId].filter(Boolean).join(' · ')}
        </p>
      )}
      {!leafId && <p className="text-xs text-muted-foreground">{t('chat.header.inviteWait')}</p>}
      <div className="flex items-center gap-3 py-2">
        <ShareAvatar avatar={owner?.avatar} email={owner?.email} name={owner?.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {owner?.name ? (
              <>{owner.name} <span className="font-normal text-muted-foreground">({t('chat.header.you')})</span></>
            ) : t('chat.header.you')}
          </p>
          {owner?.email && <p className="truncate text-xs text-muted-foreground" title={owner.email}>{owner.email}</p>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{t('chat.header.owner')}</span>
      </div>
      {!!invitations?.length && (
        <ul className="max-h-44 divide-y divide-border overflow-y-auto">
          {invitations.map(({ id, recipient }) => {
            const label = (
              <>
                <span className="truncate">{recipient.name || recipient.workId}</span>
                <span className="shrink-0 text-muted-foreground">({t('chat.header.invitedBadge')})</span>
              </>
            );
            return (
              <li key={id} className="flex items-center gap-3 py-2">
                <ShareAvatar avatar={recipient.avatar} email={recipient.email} name={recipient.name} />
                {!publicShareId && invitations.length > 1 ? (
                  <button
                    type="button"
                    aria-pressed={selectedInvite?.id === id}
                    title={recipient.workId}
                    onClick={() => setSelectedInviteId(id)}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted aria-pressed:bg-muted"
                  >
                    {label}
                  </button>
                ) : (
                  <span className="flex min-w-0 flex-1 gap-1 text-sm" title={recipient.workId}>{label}</span>
                )}
                <button type="button" className={iconButton} disabled={busy} aria-label={t('chat.header.revokeInvite')} title={t('chat.header.revokeInvite')} onClick={() => void revoke(id)}>
                  <UserMinus size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="space-y-2 border-t border-border/70 pt-4">
        <label htmlFor={`share-access-${sessionId}`} className="text-xs font-medium text-muted-foreground">
          {t('chat.header.generalAccess')}
        </label>
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            {publicAccessSelected ? <Globe size={15} /> : <Lock size={15} />}
          </span>
          <div className="relative min-w-0 flex-1">
            <select
              id={`share-access-${sessionId}`}
              value={publicAccessSelected ? 'public' : 'invited'}
              disabled={busy || !invitations}
              className="h-9 w-full appearance-none rounded-md border-0 bg-transparent pl-3 pr-9 text-sm outline-none hover:bg-foreground/5 focus:bg-foreground/5"
              onChange={event => {
                setError('');
                setNotice('');
                if (event.target.value === 'public') setConfirmPublic(true);
                else if (publicShareId) void saveGeneralAccess(false);
                else setConfirmPublic(false);
              }}
            >
              <option value="invited">{t('chat.header.invitedOnly')}</option>
              <option value="public" disabled={!leafId && !publicShareId}>{t('chat.header.anyoneWithLink')}</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        {confirmPublic && (
          <div className="space-y-2 rounded-xl border border-border bg-white p-2.5 text-xs text-neutral-900">
            <p>{t('chat.header.publicShareConfirmation')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => {
                setConfirmPublic(false);
                setError('');
              }} className={`${shareActionClass} bg-neutral-100 hover:bg-neutral-200`}>{t('common.cancel')}</button>
              <button type="button" disabled={busy || !leafId} onClick={() => void saveGeneralAccess(true)} className={`${shareActionClass} bg-primary text-primary-foreground transition-[filter] enabled:hover:brightness-90`}>
                {t('chat.header.enablePublicShare')}
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
        {publicShareId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveGeneralAccess(false)}
            className={`${shareActionClass} mr-auto bg-destructive/10 text-destructive enabled:hover:bg-destructive/15`}
          >
            {t('chat.header.stopSharing')}
          </button>
        )}
        <button
          type="button"
          disabled={!invitations || busy || confirmPublic}
          onClick={() => void copyConversationLink()}
          className={`${shareActionClass} bg-black text-white hover:bg-neutral-800 focus-visible:bg-neutral-800`}
        >
          <Link size={14} />{t('chat.header.copyLink')}
        </button>
      </div>
    </section>
  );
}
