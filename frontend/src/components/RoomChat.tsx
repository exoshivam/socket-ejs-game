import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { ChatBubble, Send } from './icons';

type ChatLine = { system: boolean; name: string; text: string; time: string };

const time = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Splits "test has joined the room" into the name (shown in gold) and the rest. */
function splitSystem(text: string): { name: string; text: string } {
  const m = text.match(/^(.+?) (has joined the room|created the room|has left the room)$/);
  return m ? { name: m[1], text: ` ${m[2]}` } : { name: '', text };
}

/** Room chat panel: listens to systemMessage/chatMessage and sends chatMessage. */
export default function RoomChat({
  roomId,
  localName,
  disabledReason,
  className = '',
}: {
  roomId: string;
  localName: string | null;
  /** When set, input is disabled and this text is shown instead. */
  disabledReason?: string;
  className?: string;
}) {
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onSystem = (text: string) => setChat(c => [...c, { system: true, ...splitSystem(text), time: time() }]);
    const onChat = ({ name, text }: { name: string; text: string }) => setChat(c => [...c, { system: false, name, text, time: time() }]);
    socket.on('systemMessage', onSystem);
    socket.on('chatMessage', onChat);
    return () => {
      socket.off('systemMessage', onSystem);
      socket.off('chatMessage', onChat);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [chat]);

  const send = () => {
    const text = message.trim();
    if (!text || disabledReason) return;
    socket.emit('chatMessage', { roomId, name: localName || 'Unknown', text });
    setMessage('');
  };

  return (
    <aside className={`wr-chat ${className}`}>
      <div className="wr-chat-head">
        <ChatBubble />
        <span>Room Chat</span>
      </div>
      <div className="wr-chat-list" ref={listRef}>
        {chat.map((m, i) => {
          const own = !m.system && m.name === localName;
          return (
            <div key={i} className={`wr-msg ${own ? 'own' : ''}`}>
              <div className="wr-bubble">
                {m.system ? (
                  <>
                    <span className="wr-msg-name">{m.name}</span>
                    {m.text}
                  </>
                ) : (
                  <>
                    {!own && <div className="wr-msg-name">{m.name}</div>}
                    {m.text}
                  </>
                )}
              </div>
              <span className="wr-msg-time">{m.time}</span>
            </div>
          );
        })}
      </div>
      <div className="wr-chat-input">
        <input
          type="text"
          value={message}
          disabled={!!disabledReason}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={disabledReason || 'Type a message...'}
          aria-label="Chat message"
        />
        <button type="button" className="wr-send" onClick={send} disabled={!!disabledReason} aria-label="Send">
          <Send />
        </button>
      </div>
    </aside>
  );
}
