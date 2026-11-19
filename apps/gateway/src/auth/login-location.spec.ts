import { resolveLoginLocation } from './login-location';

describe('resolveLoginLocation', () => {
  const originalEndpoint = process.env.LOGIN_GEOIP_URL;

  beforeEach(() => {
    process.env.LOGIN_GEOIP_URL = 'https://geo.example.test/lookup';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEndpoint === undefined) delete process.env.LOGIN_GEOIP_URL;
    else process.env.LOGIN_GEOIP_URL = originalEndpoint;
  });

  it('uses the resolved public IP and returns a coarse location label', async () => {
    const lookup = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ city: 'Tokyo', region: 'Tokyo', country: 'Japan' })),
    );

    await expect(resolveLoginLocation('::ffff:8.8.8.8')).resolves.toBe('Tokyo, Japan');
    expect(lookup).toHaveBeenCalledWith(
      new URL('https://geo.example.test/lookup/8.8.8.8'),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('skips private IPs and keeps login possible when the lookup fails', async () => {
    const lookup = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unavailable'));
    await expect(resolveLoginLocation('192.168.1.2')).resolves.toBeUndefined();
    await expect(resolveLoginLocation('fd00::1')).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
    await expect(resolveLoginLocation('8.8.8.8')).resolves.toBeUndefined();
  });
});
