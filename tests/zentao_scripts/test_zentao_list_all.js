
const axios = require('axios');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function listAll() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 拉取产品 1 的所有状态需求 ---');
    const res = await client.get('/api.php/v1/products/1/stories?status=all', {
      headers: { 'Token': sessionToken }
    });
    
    const stories = res.data.stories || [];
    console.log(`总数: ${stories.length}`);
    stories.forEach(s => console.log(`- ID: ${s.id}, Title: ${s.title}, Status: ${s.status}`));

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}
listAll();
