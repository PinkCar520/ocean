
import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, 'apps/gateway/.env') });

const baseUrl = process.env.ZENTAO_BASE_URL || 'http://localhost:8080';
const key = process.env.ZENTAO_API_TOKEN || '';
const code = 'uclaw';
const account = 'pinkcar';

async function test() {
  const time = Math.floor(Date.now() / 1000).toString();
  const md5 = crypto.createHash('md5').update(`${code}${key}${time}`).digest('hex');
  const simpleMd5 = crypto.createHash('md5').update(`${key}${time}`).digest('hex');

  const combinations = [
    { name: 'Header: Token = Secret', headers: { 'Token': key } },
    { name: 'Header: Token = md5(code+key+time)', headers: { 'Token': md5, 'X-App-Code': code, 'X-App-Time': time } },
    { name: 'Header: X-Zentao-Token = Secret', headers: { 'X-Zentao-Token': key } },
    { name: 'Header: Authorization = Bearer Secret', headers: { 'Authorization': `Bearer ${key}` } },
    { name: 'Query: token=md5(code+key+time)', url: `${baseUrl}/api.php/v1/bugs/5?code=${code}&time=${time}&token=${md5}` },
    { name: 'Query: zentaosid=Secret', url: `${baseUrl}/api.php/v1/bugs/5?zentaosid=${key}` },
  ];

  for (const combo of combinations) {
    try {
      console.log(`Testing: ${combo.name}...`);
      const url = combo.url || `${baseUrl}/api.php/v1/bugs/5`;
      const res = await axios.get(url, { 
        headers: combo.headers,
        timeout: 3000 
      });
      console.log(`  ✅ Success! Status: ${res.status}`);
      console.log(`  Data sample: ${JSON.stringify(res.data).slice(0, 50)}`);
      process.exit(0);
    } catch (err) {
      console.log(`  ❌ Failed: ${err.response?.status || err.message}`);
    }
  }
}

test();
