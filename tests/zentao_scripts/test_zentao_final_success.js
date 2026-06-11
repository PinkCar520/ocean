
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testFinalSuccess() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 尝试最终修正版 Story Payload ---');
    const p = {
      product: 1,
      module: 0,
      branch: 0,
      title: "Ocean Final Success " + Date.now(),
      spec: "<p>This is a test story.</p>",
      pri: 1,
      category: "feature",
      source: "po",
      openedBy: account
    };

    const res = await client.post('/api.php/v1/stories', p, {
      headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
    });
    
    console.log('状态码:', res.status);
    console.log('响应:', JSON.stringify(res.data, null, 2));

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}
testFinalSuccess();
