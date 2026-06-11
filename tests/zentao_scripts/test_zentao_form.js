
const axios = require('axios');
const qs = require('querystring');
const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function testForm() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('--- 尝试表单格式 (URLSearchParams) ---');
    const formData = {
      product: 1,
      title: "Ocean Form Test " + Date.now(),
      spec: "test description",
      pri: 1,
      category: "feature",
      openedBy: account
    };

    const res = await client.post('/api.php/v1/stories', qs.stringify(formData), {
      headers: { 
        'Token': sessionToken, 
        'Content-Type': 'application/x-www-form-urlencoded' 
      }
    });
    
    console.log('状态码:', res.status);
    console.log('响应:', JSON.stringify(res.data, null, 2));

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}
testForm();
