const { readFileSync } = require('node:fs');

const databaseUrl = readFileSync('/run/secrets/database_url', 'utf8').trim();
if (!databaseUrl) {
  throw new Error('The database_url Compose secret is empty');
}
process.env.DATABASE_URL = databaseUrl;

if (process.env.OCEAN_SERVICE_ENV_FILE) {
  process.loadEnvFile(process.env.OCEAN_SERVICE_ENV_FILE);
}
