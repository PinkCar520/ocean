import { OCEAN_SESSION_COOKIE, readCookie } from './auth-cookie';

describe('readCookie', () => {
  it('reads the Ocean session from a cookie header', () => {
    expect(
      readCookie(
        `theme=dark; ${OCEAN_SESSION_COOKIE}=header.payload.signature`,
        OCEAN_SESSION_COOKIE,
      ),
    ).toBe('header.payload.signature');
  });

  it('returns undefined for a missing or malformed cookie', () => {
    expect(readCookie(undefined, OCEAN_SESSION_COOKIE)).toBeUndefined();
    expect(
      readCookie('theme=dark; malformed', OCEAN_SESSION_COOKIE),
    ).toBeUndefined();
  });
});
