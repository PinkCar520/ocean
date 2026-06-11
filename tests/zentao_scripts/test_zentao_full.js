
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testFull() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 尝试全字段 Payload ---');
    const fullPayload = {
      product: 1,
      branch: 0,
      module: 0,
      plan: "0",
      source: "customer",
      sourceNote: "",
      title: "Ocean Full Test " + new Date().toISOString().slice(11, 19),
      spec: "全字段测试描述",
      verify: "验收标准测试",
      pri: 3,
      estimate: 1.0,
      category: "feature",
      keywords: "test"
    };

    const res = await client.post('/api.php/v1/stories', fullPayload, {
      headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
    });
    
    console.log('状态码:', res.status);
    console.log('响应数据:', JSON.stringify(res.data, null, 2));

    if (res.data && res.data.id) {
      console.log('✅ 成功创建需求，ID:', res.data.id);
    } else {
      console.log('❌ 虽然返回 200，但依然没有 ID');
    }
  } catch (err) {
    console.error('❌ 接口报错:', err.response?.data || err.message);
  }
}
testFull();
