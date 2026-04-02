// Prisma 7 CLI 配置文件
module.exports = {
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/uclaw?schema=public',
  },
}
