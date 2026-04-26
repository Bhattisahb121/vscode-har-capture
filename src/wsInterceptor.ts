import { WebSocketMessage, CapturedRequest, HarHeader } from './types';

let capturing = false;
let nextWsId = 1;

const capturedWsConnections: CapturedRequest[] = [];
const listeners: Array<(req: CapturedRequest) => void> = [];

interface WebSocketLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  url?: string;
  _url?: string;
}

interface WebSocketConstructor {
  new (address: string | URL, ...args: unknown[]): WebSocketLike;
  prototype: WebSocketLike;
}

let originalWsConstructor: WebSocketConstructor | null = null;
let wsModule: { WebSocket?: WebSocketConstructor; default?: WebSocketConstructor } | null = null;

function generateWsId(): string {
  return `ws-${nextWsId++}`;
}

function notifyListeners(req: CapturedRequest): void {
  for (const listener of listeners) {
    try {
      listener(req);
    } catch {
      // ignore
    }
  }
}

function tryLoadWsModule(): boolean {
  if (wsModule) {return true;}
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wsModule = require('ws');
    return true;
  } catch {
    return false;
  }
}

function interceptWebSocket(ws: WebSocketLike, url: string, captured: CapturedRequest): void {
  captured.webSocketMessages = [];
  const startTime = captured.startTime;

  ws.on('open', () => {
    captured.responseStatus = 101;
    captured.responseStatusText = 'Switching Protocols';
    notifyListeners(captured);
  });

  ws.on('message', (data: unknown) => {
    const msg: WebSocketMessage = {
      type: 'receive',
      time: Date.now() - startTime,
      opcode: typeof data === 'string' ? 1 : 2,
      data: typeof data === 'string' ? data : (data as Buffer).toString('utf-8'),
    };
    captured.webSocketMessages!.push(msg);
    notifyListeners(captured);
  });

  ws.on('close', () => {
    captured.endTime = Date.now();
    notifyListeners(captured);
  });

  ws.on('error', (err: unknown) => {
    captured.endTime = Date.now();
    captured.error = err instanceof Error ? err.message : String(err);
    notifyListeners(captured);
  });

  // Intercept send
  const originalSend = (ws as unknown as Record<string, (...args: unknown[]) => void>).send;
  if (typeof originalSend === 'function') {
    (ws as unknown as Record<string, (...args: unknown[]) => void>).send = function (
      data: unknown,
      ...args: unknown[]
    ) {
      const msg: WebSocketMessage = {
        type: 'send',
        time: Date.now() - startTime,
        opcode: typeof data === 'string' ? 1 : 2,
        data: typeof data === 'string' ? data : String(data),
      };
      captured.webSocketMessages!.push(msg);
      notifyListeners(captured);
      return originalSend.call(this, data, ...args);
    };
  }
}

export function startWsCapture(): void {
  if (capturing) {return;}
  if (!tryLoadWsModule()) {return;}
  capturing = true;

  const mod = wsModule!;
  const WsClass = mod.WebSocket || mod.default;
  if (!WsClass) {return;}

  originalWsConstructor = WsClass;

  const PatchedWebSocket = function (
    this: WebSocketLike,
    address: string | URL,
    ...args: unknown[]
  ) {
    const url = typeof address === 'string' ? address : address.toString();

    const reqHeaders: HarHeader[] = [];
    if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const opts = args[0] as Record<string, unknown>;
      if (opts.headers && typeof opts.headers === 'object') {
        for (const [name, value] of Object.entries(opts.headers as Record<string, string>)) {
          reqHeaders.push({ name, value: String(value) });
        }
      }
    }

    const captured: CapturedRequest = {
      id: generateWsId(),
      method: 'GET',
      url: url.replace(/^ws/, 'http'),
      startTime: Date.now(),
      requestHeaders: [
        { name: 'Upgrade', value: 'websocket' },
        { name: 'Connection', value: 'Upgrade' },
        ...reqHeaders,
      ],
      httpVersion: 'HTTP/1.1',
      resourceType: 'websocket',
    };

    capturedWsConnections.push(captured);

    const ws = new originalWsConstructor!(address, ...args);
    interceptWebSocket(ws, url, captured);
    return ws;
  } as unknown as WebSocketConstructor;

  PatchedWebSocket.prototype = WsClass.prototype;

  if (mod.WebSocket) {
    mod.WebSocket = PatchedWebSocket;
  }
  if (mod.default) {
    mod.default = PatchedWebSocket;
  }
}

export function stopWsCapture(): void {
  if (!capturing || !wsModule || !originalWsConstructor) {return;}
  capturing = false;

  if (wsModule.WebSocket) {
    wsModule.WebSocket = originalWsConstructor;
  }
  if (wsModule.default) {
    wsModule.default = originalWsConstructor;
  }
}

export function isWsCapturing(): boolean {
  return capturing;
}

export function getCapturedWsConnections(): CapturedRequest[] {
  return [...capturedWsConnections];
}

export function clearCapturedWsConnections(): void {
  capturedWsConnections.length = 0;
  nextWsId = 1;
}

export function onWsRequestCaptured(
  listener: (req: CapturedRequest) => void
): { dispose: () => void } {
  listeners.push(listener);
  return {
    dispose: () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) {
        listeners.splice(idx, 1);
      }
    },
  };
}
