import { io } from 'socket.io-client';

const userId = 'test_user';
const socket = io('http://localhost:3000', {
  query: { userId }
});

socket.on('connect', () => {
  console.log('✓ Connected as', userId);
});

socket.on('rpc_request', (data) => {
  console.log('◁ Received Request:', data);
  socket.emit('rpc_response', {
    id: data.id,
    result: 'Mocked successful execution from test script'
  });
  console.log('▷ Sent Response');
  
  // 验证完成后退出
  setTimeout(() => process.exit(0), 1000);
});

socket.on('connect_error', (err) => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});

// 如果 10 秒内没反应也退出
setTimeout(() => {
  console.log('Timeout waiting for RPC request');
  process.exit(1);
}, 10000);
