import { ApprovalMaintenanceService } from './approval-maintenance.service';

describe('Approval retention', () => {
  it('expires session grants and removes only old superseded/expired rows', async () => {
    const db = {
      runApproval: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    expect(await new ApprovalMaintenanceService(db as any).sweep()).toEqual({
      expired: 2,
      deleted: 3,
    });
    expect(db.runApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scope: 'session',
          status: 'approved',
        }),
        data: { status: 'expired' },
      }),
    );
    expect(db.runApproval.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['expired', 'superseded'] },
        updatedAt: { lt: expect.any(Date) },
      },
    });
  });
});
