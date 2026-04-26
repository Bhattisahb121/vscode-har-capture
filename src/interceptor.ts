import type * as httpType from 'http';
import type * as httpsType from 'https';
import { URL } from 'url';
import { CapturedRequest, HarHeader, ServerSentEvent } from './types';

// Use require so we get mutable module objects (ESM imports are frozen by bundlers)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const http: typeof httpType = require('http');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const https: typeof httpsType = require('https');

type RequestCallback = (res: httpType.IncomingMessage) => void;
type RequestFn = (...args: unknown[]) => httpType.ClientRequest;

let capturing = false;
let nextId = 1;

const capturedRequests: CapturedRequest[] = [];
const listeners: Array<(req: CapturedRequest) => void> = [];

// Store originals
const originalHttpRequest = http.request as unknown as RequestFn;
const originalHttpGet = http.get as unknown as RequestFn;
const originalHttpsRequest = https.request as unknown as RequestFn;
const originalHttpsGet = https.get as unknown as RequestFn;

function generateId(): string {
  return `req-${nextId++}`;
}

function extractHeaders(rawHeaders: Record<string, string | string[] | number | undefined>): HarHeader[] {
  const headers: HarHeader[] = [];
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (value === undefined) { continue; }
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.push({ name, value: String(v) });
      }
    } else {
      headers.push({ name, value: String(value) });
    }
  }
  return headers;
}

function buildUrl(options: httpType.RequestOptions | string | URL, protocol: string): string {
  if (typeof options === 'string') {
    return options;
  }
  if (options instanceof URL) {
    return options.toString();
  }
  const host = options.hostname || options.host || 'localhost';
  const port = options.port ? `:${options.port}` : '';
  const path = options.path || '/';
  return `${protocol}//${host}${port}${path}`;
}

function detectResourceType(
  reqHeaders: HarHeader[],
  url: string
): 'xhr' | 'fetch' | 'websocket' | 'eventsource' | 'other' {
  const acceptHeader = reqHeaders.find(
    (h) => h.name.toLowerCase() === 'accept'
  );
  const upgradeHeader = reqHeaders.find(
    (h) => h.name.toLowerCase() === 'upgrade'
  );

  if (upgradeHeader && upgradeHeader.value.toLowerCase() === 'websocket') {
    return 'websocket';
  }
  if (acceptHeader && acceptHeader.value.includes('text/event-stream')) {
    return 'eventsource';
  }
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return 'websocket';
  }
  return 'xhr';
}

function isSSEResponse(headers: httpType.IncomingHttpHeaders): boolean {
  const ct = headers['content-type'];
  return typeof ct === 'string' && ct.includes('text/event-stream');
}

function parseSSEChunk(chunk: string, events: ServerSentEvent[], startTime: number): void {
  const lines = chunk.split('\n');
  let eventType = 'message';
  let data = '';
  let lastEventId: string | undefined;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += (data ? '\n' : '') + line.slice(5).trim();
    } else if (line.startsWith('id:')) {
      lastEventId = line.slice(3).trim();
    } else if (line.trim() === '' && data) {
      events.push({
        time: Date.now() - startTime,
        eventType,
        data,
        lastEventId,
      });
      eventType = 'message';
      data = '';
      lastEventId = undefined;
    }
  }
}

function interceptResponse(
  captured: CapturedRequest,
  res: httpType.IncomingMessage
): void {
  captured.responseStatus = res.statusCode ?? 0;
  captured.responseStatusText = res.statusMessage ?? '';
  captured.httpVersion = `HTTP/${res.httpVersion}`;
  captured.responseHeaders = extractHeaders(
    res.headers as Record<string, string | string[] | undefined>
  );
  captured.responseBodyMimeType =
    (res.headers['content-type'] as string | undefined) ?? 'application/octet-stream';

  const isSSE = isSSEResponse(res.headers);
  if (isSSE) {
    captured.resourceType = 'eventsource';
    captured.serverSentEvents = [];
  }

  const chunks: Buffer[] = [];

  res.on('data', (chunk: Buffer) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (isSSE && captured.serverSentEvents) {
      parseSSEChunk(chunk.toString('utf-8'), captured.serverSentEvents, captured.startTime);
      notifyListeners(captured);
    }
  });

  res.on('end', () => {
    captured.endTime = Date.now();
    captured.responseBody = Buffer.concat(chunks).toString('utf-8');
    notifyListeners(captured);
  });

  res.on('error', (err: Error) => {
    captured.endTime = Date.now();
    captured.error = err.message;
    notifyListeners(captured);
  });
}

function createInterceptedRequest(
  original: RequestFn,
  protocol: string,
  args: unknown[]
): httpType.ClientRequest {
  let options: httpType.RequestOptions | string | URL;
  let callback: RequestCallback | undefined;

  if (typeof args[0] === 'string' || args[0] instanceof URL) {
    options = args[0];
    if (typeof args[1] === 'function') {
      callback = args[1] as RequestCallback;
    } else if (typeof args[1] === 'object' && args[1] !== null) {
      options = { ...parseUrlToOptions(args[0]), ...(args[1] as httpType.RequestOptions) };
      if (typeof args[2] === 'function') {
        callback = args[2] as RequestCallback;
      }
    }
  } else {
    options = args[0] as httpType.RequestOptions;
    if (typeof args[1] === 'function') {
      callback = args[1] as RequestCallback;
    }
  }

  const url = buildUrl(options, protocol);
  const method =
    (typeof options === 'object' && !(options instanceof URL)
      ? (options as httpType.RequestOptions).method
      : undefined) ?? 'GET';

  const headersObj =
    typeof options === 'object' && !(options instanceof URL)
      ? ((options as httpType.RequestOptions).headers as Record<string, string | string[] | number | undefined> | undefined) ?? {}
      : {};
  const reqHeaders = extractHeaders(headersObj);

  const captured: CapturedRequest = {
    id: generateId(),
    method: method.toUpperCase(),
    url,
    startTime: Date.now(),
    requestHeaders: reqHeaders,
    httpVersion: 'HTTP/1.1',
    resourceType: detectResourceType(reqHeaders, url),
  };

  capturedRequests.push(captured);

  const wrappedCallback: RequestCallback = (res: httpType.IncomingMessage) => {
    interceptResponse(captured, res);
    if (callback) {
      callback(res);
    }
  };

  // Replace callback in args and pass through to original
  const newArgs = [...args];
  if (typeof args[0] === 'string' || args[0] instanceof URL) {
    if (typeof args[1] === 'function') {
      newArgs[1] = wrappedCallback;
    } else if (typeof args[1] === 'object' && args[1] !== null) {
      if (typeof args[2] === 'function') {
        newArgs[2] = wrappedCallback;
      } else {
        newArgs.push(wrappedCallback);
      }
    } else {
      newArgs.push(wrappedCallback);
    }
  } else {
    if (typeof args[1] === 'function') {
      newArgs[1] = wrappedCallback;
    } else {
      newArgs.push(wrappedCallback);
    }
  }

  const req: httpType.ClientRequest = original(...newArgs);

  // Intercept request body
  const originalWrite = req.write.bind(req) as (
    chunk: unknown,
    encodingOrCb?: BufferEncoding | ((err: Error | null | undefined) => void),
    cb?: (err: Error | null | undefined) => void
  ) => boolean;
  const bodyChunks: Buffer[] = [];

  req.write = function (
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
    cb?: (error: Error | null | undefined) => void
  ): boolean {
    if (chunk) {
      bodyChunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      );
    }
    if (typeof encodingOrCallback === 'function') {
      return originalWrite(chunk, encodingOrCallback);
    }
    return originalWrite(chunk, encodingOrCallback, cb);
  } as typeof req.write;

  const originalEnd = req.end.bind(req) as (
    chunkOrCb?: unknown,
    encodingOrCb?: BufferEncoding | (() => void),
    cb?: () => void
  ) => httpType.ClientRequest;

  req.end = function (
    chunkOrCb?: unknown,
    encodingOrCallback?: BufferEncoding | (() => void),
    cb?: () => void
  ): httpType.ClientRequest {
    if (chunkOrCb && typeof chunkOrCb !== 'function') {
      bodyChunks.push(
        Buffer.isBuffer(chunkOrCb)
          ? chunkOrCb
          : Buffer.from(String(chunkOrCb))
      );
    }
    if (bodyChunks.length > 0) {
      captured.requestBody = Buffer.concat(bodyChunks).toString('utf-8');
      const contentType = captured.requestHeaders.find(
        (h) => h.name.toLowerCase() === 'content-type'
      );
      captured.requestBodyMimeType =
        contentType?.value ?? 'application/octet-stream';
    }
    notifyListeners(captured);

    if (typeof chunkOrCb === 'function') {
      return originalEnd(chunkOrCb);
    }
    if (typeof encodingOrCallback === 'function') {
      return originalEnd(chunkOrCb, encodingOrCallback);
    }
    return originalEnd(chunkOrCb, encodingOrCallback, cb);
  } as typeof req.end;

  // Handle request-level errors
  req.on('error', (err: Error) => {
    captured.endTime = Date.now();
    captured.error = err.message;
    notifyListeners(captured);
  });

  // If no callback was provided, listen for 'response' event
  if (!callback) {
    req.on('response', (res: httpType.IncomingMessage) => {
      interceptResponse(captured, res);
    });
  }

  return req;
}

function parseUrlToOptions(input: string | URL): httpType.RequestOptions {
  const url = typeof input === 'string' ? new URL(input) : input;
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || undefined,
    path: url.pathname + url.search,
  };
}

function notifyListeners(req: CapturedRequest): void {
  for (const listener of listeners) {
    try {
      listener(req);
    } catch {
      // ignore listener errors
    }
  }
}

export function startCapture(): void {
  if (capturing) { return; }
  capturing = true;

  (http as unknown as Record<string, unknown>).request = function (...args: unknown[]) {
    return createInterceptedRequest(originalHttpRequest, 'http:', args);
  };
  (http as unknown as Record<string, unknown>).get = function (...args: unknown[]) {
    const req = createInterceptedRequest(originalHttpGet, 'http:', args);
    req.end();
    return req;
  };

  (https as unknown as Record<string, unknown>).request = function (...args: unknown[]) {
    return createInterceptedRequest(originalHttpsRequest, 'https:', args);
  };
  (https as unknown as Record<string, unknown>).get = function (...args: unknown[]) {
    const req = createInterceptedRequest(originalHttpsGet, 'https:', args);
    req.end();
    return req;
  };
}

export function stopCapture(): void {
  if (!capturing) { return; }
  capturing = false;

  (http as unknown as Record<string, unknown>).request = originalHttpRequest;
  (http as unknown as Record<string, unknown>).get = originalHttpGet;
  (https as unknown as Record<string, unknown>).request = originalHttpsRequest;
  (https as unknown as Record<string, unknown>).get = originalHttpsGet;
}

export function isCapturing(): boolean {
  return capturing;
}

export function getCapturedRequests(): CapturedRequest[] {
  return [...capturedRequests];
}

export function clearCapturedRequests(): void {
  capturedRequests.length = 0;
  nextId = 1;
}

export function onRequestCaptured(
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
