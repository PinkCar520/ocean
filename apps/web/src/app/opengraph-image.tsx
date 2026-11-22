import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', background: '#fcfbf9', padding: 88, color: '#1c1b1b' }}>
      <div style={{ fontSize: 52, color: '#e9561b' }}>Ocean.</div>
      <div style={{ marginTop: 32, fontSize: 84, fontWeight: 700, letterSpacing: -4 }}>One Agent. Every Environment.</div>
      <div style={{ marginTop: 36, fontSize: 27, color: '#6f6a65' }}>Explore the open-source agent platform.</div>
    </div>,
    size,
  );
}
