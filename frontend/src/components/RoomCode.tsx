import { useState } from 'react';
import { CopyIcon } from './icons';

/** Room code box with a copy button, for the top bar. */
export default function RoomCode({ code, badge }: { code: string; badge?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="wr-code">
      <div>
        <div className="wr-code-label">
          Room Code{badge && <span className="wr-code-badge">{badge}</span>}
        </div>
        <div className="wr-code-value">{code}</div>
      </div>
      <button type="button" className="wr-copy" onClick={copy} aria-label="Copy room code">
        <CopyIcon /> <span className="wr-copy-text">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
