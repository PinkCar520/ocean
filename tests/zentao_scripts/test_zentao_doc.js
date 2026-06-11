
const axios = require('axios');

const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testDoc() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('\n--- 使用官方文档推荐的 POST /stories ---');
    const p = {
      title: 'Ocean Story DocTest ' + new Date().toISOString().slice(11, 19),
      product: 1, // ID
      pri: 3,     // 必填
      category: 'feature', // 必填
      spec: '这是根据官方文档创建的需求描述。'
    };

    try {
      const res = await client.post('/api.php/v1/stories', p, {
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

testDoc();
