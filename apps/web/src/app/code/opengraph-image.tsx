import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', background: '#1c1b1b', padding: 88, color: '#fff' }}>
      <div style={{ fontSize: 42, color: '#ff8852' }}>Ocean Code</div>
      <div style={{ marginTop: 32, fontSize: 76, fontWeight: 700, letterSpacing: -3 }}>Bring an agent into your codebase.</div>
      <div style={{ marginTop: 40, fontSize: 28, color: '#bcb7b2' }}>One Agent Core · Multiple Hosts · Persistent Sessions</div>
    </div>,
    size,
  );
}
