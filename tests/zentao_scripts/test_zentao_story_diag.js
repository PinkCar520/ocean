
const axios = require('axios');

const baseUrl = 'http://localhost:8080';
const token = 'pinkcar:Pinkcar123..';

async function runDiagnostic() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  try {
    console.log('1. Fetching Session Token...');
    const loginRes = await client.post('/api.php/v1/tokens', { account, password });
    const sessionToken = loginRes.data.token;

    const storyData = {
      title: 'Ocean Verify Story ' + new Date().toISOString().slice(11, 19),
      spec: 'This is a test requirement.',
      pri: 3,
      estimate: 1,
      category: 'feature',
      openedBy: account,
      source: 'customer'
    };

    console.log('\n2. Attempting to Create Story in Product 1...');
    const res = await client.post('/api.php/v1/products/1/stories', storyData, {
      headers: { 'Token': sessionToken, 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Create Story Status:', res.status);
    console.log('   Response Data:', JSON.stringify(res.data, null, 2));

    console.log('\n3. Verifying Story List again...');
    const listRes = await client.get('/api.php/v1/products/1/stories', {
      headers: { 'Token': sessionToken }
    });
    const stories = listRes.data.stories || [];
    console.log(`   Found ${stories.length} stories.`);
    stories.forEach(s => console.log(`   - ID: ${s.id}, Title: ${s.title}`));

  } catch (err) {
    console.error('❌ Failed!');
    if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
    else console.error(err.message);
  }
}

runDiagnostic();
