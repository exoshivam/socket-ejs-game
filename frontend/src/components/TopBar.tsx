import { useEffect, useRef, useState, type ReactNode } from 'react';
import { socket } from '../socket';
import { CHARACTER_ICON, CHARACTER_LABEL, Chevron, Gear, Spade, Wifi } from './icons';

function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }, []);
  return connected;
}

interface Props {
  name: string;
  avatar?: string | null;
  /** Show the class (Mage / Warrior / Rogue) under the name. */
  showClass?: boolean;
  showWifi?: boolean;
  /** Rendered next to the logo, e.g. the room code box. */
  left?: ReactNode;
  /** Items for the avatar dropdown; without them the pill is display only. */
  menu?: { label: string; onClick: () => void }[];
}

export default function TopBar({ name, avatar, showClass, showWifi, left, menu }: Props) {
  const connected = useConnected();
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const Icon = avatar ? CHARACTER_ICON[avatar] : undefined;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!pillRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <header className="lobby-bar">
      <div className="lobby-bar-left">
        <div className="lobby-brand">
          <Spade size={42} />
          <span>LAKADIA</span>
        </div>
        {left}
      </div>
      <div className="lobby-bar-right">
        <div className={`lobby-pill lobby-status ${connected ? 'is-up' : 'is-down'}`} role="status">
          <span className="lobby-dot" />
          <span className="lobby-status-text">{connected ? 'Connected' : 'Disconnected'}</span>
          {showWifi && <Wifi />}
        </div>
        <button type="button" className="lobby-gear" title="Settings" onClick={() => alert('Settings - Coming soon!')}>
          <Gear />
        </button>
        <span className="lobby-divider" />
        <div className="lobby-user-wrap" ref={pillRef}>
          <button
            type="button"
            className="lobby-pill lobby-user"
            aria-haspopup={menu ? 'menu' : undefined}
            aria-expanded={menu ? open : undefined}
            onClick={() => menu && setOpen(o => !o)}
          >
            <span className="lobby-user-avatar">{Icon ? <Icon size={36} /> : <Spade size={22} />}</span>
            <span className="lobby-user-text">
              <span className="lobby-user-name">{name || 'Guest'}</span>
              {showClass && avatar && <span className="lobby-user-class">{CHARACTER_LABEL[avatar] ?? avatar}</span>}
            </span>
            <Chevron />
          </button>
          {open && menu && (
            <div className="lobby-menu" role="menu">
              {menu.map(item => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
