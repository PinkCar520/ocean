
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function trace() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 获取产品 1 的需求列表 ---');
    const res = await client.get('/api.php/v1/products/1/stories', {
      headers: { 'Token': sessionToken }
    });
    
    // 如果列表为空，说明我们之前的创建其实都失败了，或者在某些奇怪的状态下（如：待评审）
    console.log('Stories:', JSON.stringify(res.data.stories, null, 2));

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

trace();
