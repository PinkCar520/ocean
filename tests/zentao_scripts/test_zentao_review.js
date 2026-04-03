
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testReview() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 尝试绕过评审流程 ---');
    const p = {
      product: 1,
      title: "Story with Review Bypass " + Date.now(),
      spec: "test",
      pri: 1,
      category: "feature",
      status: "active",
      reviewedBy: account // 尝试自我评审
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
testReview();
