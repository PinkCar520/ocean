
const axios = require('axios');

const baseUrl = 'http://localhost:8080';
// From zentao_diag.js
const key = '5f295b35520e4088825c9b74b2cd92e6'; // Need to verify if this is the actual key or if I should use account:password

async function testCreateStory() {
  try {
    console.log('--- Step 1: Get Products ---');
    const productsRes = await axios.get(`${baseUrl}/api.php/v1/products`, {
      headers: { 'Token': key }
    });
    const products = productsRes.data.products || [];
    if (products.length === 0) {
      console.error('No products found to create story in.');
      return;
    }
    const productId = products[0].id;
    console.log(`Using Product ID: ${productId} (${products[0].name})`);

    console.log('\n--- Step 2: Create Story ---');
    const storyData = {
      title: 'UClaw Test Story ' + Date.now(),
      spec: 'This is a test story created by UClaw diagnostic script.',
      pri: 3,
      estimate: 1,
      category: 'feature',
      openedBy: 'admin', // Try adding openedBy
    };

    try {
      const res = await axios.post(`${baseUrl}/api.php/v1/products/${productId}/stories`, storyData, {
        headers: { 
          'Token': key,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Create Story Success!');
      console.log('Response:', JSON.stringify(res.data, null, 2));
    } catch (err) {
      console.error('❌ Create Story Failed!');
      if (err.response) {
        console.error('Status:', err.response.status);
        console.error('Error Data:', JSON.stringify(err.response.data, null, 2));
      } else {
        console.error('Error Message:', err.message);
      }
    }
  } catch (err) {
    console.error('Error in test setup:', err.message);
  }
}

testCreateStory();
