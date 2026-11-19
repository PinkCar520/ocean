import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PrivacyModule } from './privacy.module';
import { PrivacyController } from './privacy.controller';
import type { PrivacyService } from './privacy.service';

describe('PrivacyController account deletion', () => {
  it('registers the delete-account route on the privacy module', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PrivacyModule);
    expect(controllers).toContain(PrivacyController);
    expect(Reflect.getMetadata(PATH_METADATA, PrivacyController)).toBe('api/privacy');
    expect(Reflect.getMetadata(PATH_METADATA, PrivacyController.prototype.deleteAccount)).toBe('delete-account');
  });

  it('passes the authenticated account ID and confirmation to the service', async () => {
    const deleteAccount = jest.fn().mockResolvedValue({ success: true });
    const controller = new PrivacyController({ deleteAccount } as unknown as PrivacyService);

    await expect(controller.deleteAccount(
      { confirm: 'DELETE', userId: 'another-user' },
      { user: { dbId: 'signed-in-user' } },
    )).resolves.toEqual({ success: true });
    expect(deleteAccount).toHaveBeenCalledWith('signed-in-user', 'DELETE');
  });
});
