
const axios = require('axios');

const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function listStories() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    console.log('Fetching Stories for Product 1...');
    const res = await client.get('/api.php/v1/products/1/stories', {
      headers: { 'Token': sessionToken }
    });
    
    const stories = res.data.stories || [];
    console.log(`Found ${stories.length} stories.`);
    stories.forEach(s => {
      console.log(`- ID: ${s.id}, Title: ${s.title}, Status: ${s.status}, OpenedBy: ${s.openedBy?.account || s.openedBy}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) console.error(err.response.data);
  }
}

listStories();
