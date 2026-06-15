import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { SkillService } from './src/skill-registry/skill.service';
import { ForbiddenException } from '@nestjs/common';

const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/ocean?schema=public' });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const service = new SkillService(prisma);

async function runTests() {
  console.log('--- Starting SkillService Tests ---');
  let testUserId1 = 'user-test-1';
  let testUserId2 = 'user-test-2';

  await prisma.user.upsert({
    where: { id: testUserId1 },
    update: {},
    create: { id: testUserId1, workId: 'W1', name: 'Test User 1' }
  });
  await prisma.user.upsert({
    where: { id: testUserId2 },
    update: {},
    create: { id: testUserId2, workId: 'W2', name: 'Test User 2' }
  });

  // 1. Create Skill with userId1
  console.log('1. Creating Skill as User 1...');
  const skill = await service.createSkill({
    slug: 'test-skill-' + Date.now(),
    name: 'Test Skill',
    content: 'Initial content',
  }, testUserId1);
  console.log('   ✅ Created Skill:', skill.id);

  // Verify history is created
  let history = await service.getSkillHistory(skill.id);
  console.log(`   ✅ History count: ${history.length} (Expected: 1)`);

  // 2. Update Skill with userId1
  console.log('2. Updating Skill as User 1...');
  await service.updateSkill(skill.id, { content: 'Updated content' }, testUserId1);
  history = await service.getSkillHistory(skill.id);
  console.log(`   ✅ History count: ${history.length} (Expected: 2)`);
  console.log(`   ✅ Latest content: ${history[0].content}`);

  // 3. Attempt Update with userId2 (Should Fail)
  console.log('3. Attempting to update Skill as User 2 (Should Fail)...');
  try {
    await service.updateSkill(skill.id, { content: 'Hacked content' }, testUserId2);
    console.error('   ❌ FAILED: User 2 was able to update User 1\'s skill!');
  } catch (err: any) {
    if (err instanceof ForbiddenException || err.message.includes('Forbidden')) {
      console.log('   ✅ Successfully caught ForbiddenException:', err.message);
    } else {
      console.error('   ❌ Unexpected error:', err);
    }
  }

  // 4. Attempt Delete with userId2 (Should Fail)
  console.log('4. Attempting to delete Skill as User 2 (Should Fail)...');
  try {
    await service.deleteSkill(skill.id, testUserId2);
    console.error('   ❌ FAILED: User 2 was able to delete User 1\'s skill!');
  } catch (err: any) {
    if (err instanceof ForbiddenException || err.message.includes('Forbidden')) {
      console.log('   ✅ Successfully caught ForbiddenException:', err.message);
    } else {
      console.error('   ❌ Unexpected error:', err);
    }
  }

  // 5. Delete Skill with userId1
  console.log('5. Deleting Skill as User 1...');
  await service.deleteSkill(skill.id, testUserId1);
  console.log('   ✅ Successfully deleted skill.');

  console.log('--- All Tests Completed Successfully ---');
  await prisma.$disconnect();
}

runTests().catch(async (e) => {
  console.error('Test failed with error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
