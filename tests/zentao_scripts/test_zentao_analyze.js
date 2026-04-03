
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function analyzeStory1() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 获取手动创建的需求 1 详情 ---');
    // 尝试通过 ID 获取详情
    const res = await client.get('/api.php/v1/stories/1', {
      headers: { 'Token': sessionToken }
    });
    
    console.log(JSON.stringify(res.data, null, 2));

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}
analyzeStory1();
