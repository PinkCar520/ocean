
const axios = require('axios');

const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testMinimal() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    const payloads = [
      { title: 'Test 1 Minimal', openedBy: account },
      { title: 'Test 2 Category', openedBy: account, category: 'feature' },
      { title: 'Test 3 Source', openedBy: account, source: 'customer' },
      { title: 'Test 4 All', openedBy: account, category: 'feature', source: 'customer', spec: 'test', pri: 3 }
    ];

    for (const p of payloads) {
      console.log(`\nTesting Payload: ${JSON.stringify(p)}`);
      const res = await client.post('/api.php/v1/products/1/stories', p, {
        headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
      });
      console.log('Status:', res.status, 'Data:', JSON.stringify(res.data));
    }

    const listRes = await client.get('/api.php/v1/products/1/stories', {
      headers: { 'Token': sessionToken }
    });
    console.log(`\nFinal Count: ${(listRes.data.stories || []).length}`);

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testMinimal();
