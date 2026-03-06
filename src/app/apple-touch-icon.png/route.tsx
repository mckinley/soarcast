import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Image metadata - Apple recommends 180x180 for apple-touch-icon
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

// Icon generation
export async function GET() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 110,
        background: 'linear-gradient(to bottom, #60a5fa, #3b82f6)',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        borderRadius: '20%',
      }}
    >
      🪂
    </div>,
    {
      ...size,
    },
  );
}
