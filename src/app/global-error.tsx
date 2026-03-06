'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Application Error - SoarCast</title>
        <style>{`
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            max-width: 600px;
            padding: 2rem;
            text-align: center;
          }
          .icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 2rem;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3rem;
          }
          h1 {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 1rem;
            line-height: 1.2;
          }
          p {
            font-size: 1.125rem;
            margin-bottom: 2rem;
            opacity: 0.95;
            line-height: 1.6;
          }
          .error-message {
            background: rgba(0, 0, 0, 0.3);
            padding: 1rem;
            border-radius: 0.5rem;
            font-family: monospace;
            font-size: 0.875rem;
            margin-bottom: 2rem;
            word-break: break-word;
          }
          .buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
          }
          button {
            padding: 0.75rem 2rem;
            font-size: 1rem;
            font-weight: 600;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;
          }
          .primary {
            background: #fff;
            color: #667eea;
          }
          .primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
          }
          .secondary {
            background: rgba(255, 255, 255, 0.2);
            color: #fff;
            border: 2px solid rgba(255, 255, 255, 0.4);
          }
          .secondary:hover {
            background: rgba(255, 255, 255, 0.3);
          }
          .footer {
            margin-top: 2rem;
            font-size: 0.75rem;
            opacity: 0.8;
          }
          .footer a {
            color: #fff;
            text-decoration: underline;
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="icon">⚠️</div>
          <h1>Something went wrong</h1>
          <p>
            A critical error occurred. This might be due to a network issue or an unexpected problem
            with the application. Please try refreshing the page.
          </p>
          {error.message && !error.message.includes('digest') && (
            <div className="error-message">{error.message}</div>
          )}
          <div className="buttons">
            <button onClick={() => reset()} className="primary">
              🔄 Try Again
            </button>
            <button onClick={() => (window.location.href = '/')} className="secondary">
              🏠 Go Home
            </button>
          </div>
          {error.digest && (
            <div className="footer">
              Error ID: {error.digest}
              <br />
              <a
                href="https://github.com/yourusername/soarcast/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                Report this issue
              </a>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
