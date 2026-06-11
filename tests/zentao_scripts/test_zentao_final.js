
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testFinal() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('\n--- 尝试最简且完全一致的 Payload ---');
    // 完全对应文档的示例格式
    const payload = {
      title: "Ocean Final Test " + new Date().toISOString().slice(11, 19),
      spec: "这是测试需求的描述",
      product: 1,
      pri: 1,
      category: "feature"
    };

    try {
      const res = await client.post('/api.php/v1/stories', payload, {
        headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
      });
      console.log('✅ 状态码:', res.status);
      console.log('✅ 响应数据:', JSON.stringify(res.data, null, 2));
    } catch (e) {
      console.log('❌ 失败:', e.response?.data || e.message);
    }

  } catch (err) {
    console.error('Fatal:', err.message);
  }
}

testFinal();
