
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testBug() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 测试创建 Bug 以验证权限 ---');
    const bugPayload = {
      product: 1,
      title: "UClaw Write Test Bug " + Date.now(),
      steps: "1. test",
      openedBy: account,
      pri: 3,
      severity: 3,
      type: "codeerror"
    };

    const res = await client.post('/api.php/v1/bugs', bugPayload, {
      headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
    });
    
    console.log('状态码:', res.status);
    console.log('响应数据:', JSON.stringify(res.data, null, 2));

  } catch (err) {
    console.error('❌ Bug 创建报错:', err.response?.data || err.message);
  }
}
testBug();
