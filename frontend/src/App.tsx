import { useLocation } from './router';
import Home from './pages/Home';
import WaitingRoom from './pages/WaitingRoom';
import GameRoom from './pages/GameRoom';
import Winner from './pages/Winner';
import TeamWaitingRoom from './pages/TeamWaitingRoom';
import TeamGame from './pages/TeamGame';
import { session } from './session';

export default function App() {
  const { path, search } = useLocation();
  const params = new URLSearchParams(search);
  switch (path) {
    case '/waiting-room':
      if (import.meta.env.DEV && params.get('fixture') === 'team') return <TeamWaitingRoom fixture />;
      if (session.roomData()?.gameType === 'teamcallbreak') return <TeamWaitingRoom />;
      return <WaitingRoom replay={params.get('replay') === 'true'} />;
    case '/team-game':
      return <TeamGame roomId={(params.get('roomId') || '').trim().toUpperCase()} fixture={import.meta.env.DEV ? params.get('fixture') : null} />;
    case '/game-room':
      return <GameRoom key={search} roomId={params.get('roomId') || ''} playerName={params.get('playerName') || ''} />;
    case '/winner':
      return <Winner roomId={(params.get('roomId') || '').trim().toUpperCase()} />;
    default:
      return <Home />;
  }
}
