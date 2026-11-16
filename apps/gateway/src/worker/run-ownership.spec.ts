import { claimRun, verifyRun, LostRunOwnership } from './run-ownership';
const job = { id: 'j', payload: { runId: 'r', userId: 'u' }, attempts: 1 } as any;
it('rejects a competing claim when database CAS returns no owner', async () => {
 const tx = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
 expect(await claimRun(tx, job, 'second', 30000)).toBe(false);
});
it('rejects expired leases and stale tokens before transaction mutations', async () => {
 const tx = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
 await expect(verifyRun(tx, job, 'stale', 30000)).rejects.toBeInstanceOf(LostRunOwnership);
});
it('accepts the database verified current owner', async () => {
 const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'r' }]) } as any;
 expect(await claimRun(tx, job, 'owner', 30000)).toBe(true);
 await expect(verifyRun(tx, job, 'owner', 30000)).resolves.toBeUndefined();
});
