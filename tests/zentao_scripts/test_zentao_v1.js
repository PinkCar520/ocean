
const axios = require('axios');

const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testV1() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('\n--- Testing POST /api.php/v1/stories ---');
    const p1 = {
      product: 1,
      title: 'UClaw Story V1 ' + Date.now(),
      spec: 'Detailed specification',
      openedBy: account,
      category: 'feature',
      source: 'customer'
    };

    try {
      const res = await client.post('/api.php/v1/stories', p1, {
        headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
      });
      console.log('Status:', res.status, 'Data:', JSON.stringify(res.data));
    } catch (e) {
      console.log('Failed:', e.response?.data || e.message);
    }

    console.log('\n--- Testing POST /api.php/v1/products/1/stories (Correct fields) ---');
    const p2 = {
      title: 'UClaw Story ProductV1 ' + Date.now(),
      spec: 'Detailed specification',
      openedBy: account,
      category: 'feature',
      source: 'customer'
    };
    try {
      const res = await client.post('/api.php/v1/products/1/stories', p2, {
        headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
      });
      console.log('Status:', res.status, 'Data:', JSON.stringify(res.data));
    } catch (e) {
      console.log('Failed:', e.response?.data || e.message);
    }

    const listRes = await client.get('/api.php/v1/products/1/stories', {
      headers: { 'Token': sessionToken }
    });
    console.log(`\nFinal Stories Count: ${(listRes.data.stories || []).length}`);

  } catch (err) {
    console.error('Fatal:', err.message);
  }
}

testV1();
