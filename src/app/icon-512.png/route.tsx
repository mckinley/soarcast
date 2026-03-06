import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Image metadata
export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

// Icon generation
export async function GET() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 320,
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
