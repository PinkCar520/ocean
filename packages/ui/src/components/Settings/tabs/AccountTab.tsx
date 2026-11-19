import { Ellipsis, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { ProfileTab } from './ProfileTab';

interface LoginDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  location: string | null;
  current: boolean;
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return '';
  const client = [
    ['Electron/', 'Ocean Desktop'],
    ['Edg', 'Edge'],
    ['Firefox/', 'Firefox'],
    ['Chrome/', 'Chrome'],
    ['Safari/', 'Safari'],
  ].find(([marker]) => userAgent.includes(marker))?.[1];
  const platform = userAgent.match(/Android|iPhone|iPad|Windows|Macintosh|Linux/)?.[0];
  return [client, platform === 'Macintosh' ? 'macOS' : platform].filter(Boolean).join(' · ');
}

export function AccountTab({ onSignOut }: { onSignOut: () => void | Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [devices, setDevices] = useState<LoginDevice[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState(false);
  const [devicesError, setDevicesError] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const text = (key: string) => t(`user_center.account.${key}`);
  const formatDate = (date: string) => new Date(date).toLocaleString(i18n.resolvedLanguage, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ devices: LoginDevice[] }>('/api/auth/login-devices', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDevices(result.devices);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDevicesError(true);
      });
    return () => controller.abort();
  }, []);

  const signOutDevice = async (device: LoginDevice) => {
    setRevokingId(device.id);
    setRevokeError(false);
    try {
      await api.delete(`/api/auth/login-devices/${encodeURIComponent(device.id)}`);
      setDevices((current) => current?.filter(({ id }) => id !== device.id) ?? null);
    } catch {
      setRevokeError(true);
      return;
    } finally {
      setRevokingId(null);
    }
    if (device.current) await onSignOut();
  };

  const deleteAccount = async () => {
    if (confirmation !== 'DELETE' || deleting) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      const result = await api.post<{ success: boolean }>('/api/privacy/delete-account', { confirm: confirmation });
      if (!result.success) throw new Error('Account deletion failed');
    } catch {
      setDeleteError(true);
      setDeleting(false);
      return;
    }
    await onSignOut();
  };

  return (
    <div className="max-w-3xl space-y-8">
      <h2 className="text-2xl font-bold">{t('user_center.tabs.account')}</h2>
      <ProfileTab />
      <section className="space-y-3 border-t border-border pt-6">
        <h3 className="text-lg font-semibold">{text('devices')}</h3>
        {devicesError ? (
          <p role="alert" className="text-sm text-muted-foreground">{text('devices_error')}</p>
        ) : devices?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] table-fixed text-left text-sm" aria-label={text('devices')}>
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th scope="col" className="w-[34%] px-3 py-2 font-medium">{text('device')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{text('location')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{text('signed_in')}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{text('last_active')}</th>
                  <th scope="col" className="w-10"><span className="sr-only">{text('device_actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.map((device) => {
                  const label = deviceLabel(device.userAgent) || text('unknown_device');
                  return (
                    <tr key={device.id} className="group transition-colors hover:bg-muted focus-within:bg-muted">
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <TooltipProvider delayDuration={250}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="min-w-0 truncate font-medium">{label}</span>
                              </TooltipTrigger>
                              <TooltipContent className="z-[110] max-w-[min(24rem,90vw)] break-words bg-black text-white shadow-md">
                                {label}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {device.current && (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              {text('current_device')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {device.location || text('unknown_location')}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <time dateTime={device.createdAt}>
                          {formatDate(device.createdAt)}
                        </time>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {device.lastActiveAt ? (
                          <time dateTime={device.lastActiveAt}>{formatDate(device.lastActiveAt)}</time>
                        ) : '—'}
                      </td>
                      <td className="px-1 py-2">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${text('device_actions')} · ${label}`}
                              disabled={revokingId !== null}
                              className="inline-flex size-8 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                            >
                              <Ellipsis className="size-4" aria-hidden="true" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[110]">
                            <DropdownMenuItem onSelect={() => void signOutDevice(device)} className="text-red-600">
                              <LogOut className="size-4" aria-hidden="true" />
                              {text('sign_out_device')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{text(devices ? 'devices_empty' : 'devices_loading')}</p>
        )}
        {revokeError && <p role="alert" className="text-sm text-red-600">{text('device_sign_out_error')}</p>}
      </section>
      <section className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{text('delete')}</h3>
          {!confirming && (
            <button type="button" className="shrink-0 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/15" onClick={() => setConfirming(true)}>
              {text('delete')}
            </button>
          )}
        </div>
        {confirming && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }}>
            <label className="block text-sm" htmlFor="account-delete-confirmation">{text('delete_confirmation')}</label>
            <input id="account-delete-confirmation" className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleting} autoComplete="off" />
            {deleteError && <p role="alert" className="text-sm text-red-600">{text('delete_error')}</p>}
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" disabled={deleting}
                onClick={() => { setConfirming(false); setConfirmation(''); setDeleteError(false); }}>
                {text('cancel')}
              </button>
              <button type="submit" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={confirmation !== 'DELETE' || deleting}>
                {text(deleting ? 'deleting' : 'delete')}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
