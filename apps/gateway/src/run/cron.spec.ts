import { nextCronTime } from './cron';

describe('Ocean UTC schedule calculation', () => {
  it('advances past the current minute and accepts stepped ranges', () => {
    expect(nextCronTime('5-35/10 9 * * 1-5', new Date('2026-11-20T09:15:00Z')).toISOString())
      .toBe('2026-11-20T09:25:00.000Z');
  });

  it('finds the next leap day without drifting the scheduled time', () => {
    expect(nextCronTime('0 8 29 2 *', new Date('2026-11-20T00:00:00Z')).toISOString())
      .toBe('2028-02-29T08:00:00.000Z');
  });

  it('uses day-of-month or weekday when both fields are restricted', () => {
    expect(nextCronTime('0 0 15 * 1', new Date('2026-11-15T00:00:00Z')).toISOString())
      .toBe('2026-11-16T00:00:00.000Z');
  });

  it('rejects invalid and unrealizable schedules', () => {
    expect(() => nextCronTime('*/0 * * * *', new Date())).toThrow('out of range');
    expect(() => nextCronTime('0 8 31 2 *', new Date())).toThrow('no matching date');
  });
});
