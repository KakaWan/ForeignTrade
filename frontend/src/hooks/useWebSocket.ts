/** WebSocket hook for real-time progress updates. */

import { useEffect, useRef, useCallback, useState } from 'react';

interface ProgressMessage {
  type: string;
  task_id: string;
  total: number;
  completed: number;
  current_item: string;
  status: string;
  detail: string;
}

/** Build WebSocket URL dynamically based on current page location. */
function getDefaultWebSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws/progress`;
}

export function useWebSocket(url: string = getDefaultWebSocketUrl()) {
  const wsRef = useRef<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<ProgressMessage | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      // Keepalive ping
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        } else {
          clearInterval(interval);
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const msg: ProgressMessage = JSON.parse(event.data);
        setLastMessage(msg);
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { lastMessage, connected, disconnect };
}
