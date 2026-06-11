
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testWithReviewer() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 尝试包含评审人的创建请求 ---');
    const p = {
      product: 1,
      module: 0,
      branch: 0,
      title: "Ocean Reviewer Test " + new Date().toISOString().slice(11, 19),
      spec: "这是一个带评审人的测试需求",
      pri: 3,
      category: "feature",
      type: "story",
      reviewer: [account], // 重点：指派你自己评审
      openedBy: account,
      source: "po"
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
testWithReviewer();
