
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, 'apps/gateway/.env') });

const baseUrl = process.env.ZENTAO_BASE_URL;
const token = process.env.ZENTAO_API_TOKEN;

async function runDiagnostic() {
  const [account, password] = token.split(':');
  const client = axios.create({ baseURL: baseUrl });

  console.log('1. 获取 Session Token...');
  const loginRes = await client.post('/api.php/v1/tokens', { account, password });
  const sessionToken = loginRes.data.token;
  console.log('   Success! Token:', sessionToken);

  console.log('2. 尝试解决 BUG-5...');
  try {
    const res = await client.put('/api.php/v1/bugs/5', {
      status: 'resolved',
      resolution: 'fixed',
      resolvedBuild: 'trunk' // 尝试使用 trunk
    }, {
      headers: { 'Token': sessionToken }
    });
    console.log('   ✅ 解决成功！');
  } catch (err) {
    console.log('   ❌ 失败状态码:', err.response?.status);
    console.log('   ❌ 详细错误原因:', JSON.stringify(err.response?.data, null, 2));
  }
}

runDiagnostic();
