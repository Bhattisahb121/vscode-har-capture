/** HAR 1.2 types + extensions for SSE / WebSocket */

export interface HarLog {
  log: {
    version: string;
    creator: HarCreator;
    entries: HarEntry[];
  };
}

export interface HarCreator {
  name: string;
  version: string;
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: Record<string, unknown>;
  timings: HarTimings;
  _resourceType?: string;
  _webSocketMessages?: WebSocketMessage[];
  _serverSentEvents?: ServerSentEvent[];
  comment?: string;
}

export interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  queryString: HarQueryParam[];
  postData?: HarPostData;
  headersSize: number;
  bodySize: number;
}

export interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
}

export interface HarHeader {
  name: string;
  value: string;
}

export interface HarCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
}

export interface HarQueryParam {
  name: string;
  value: string;
}

export interface HarPostData {
  mimeType: string;
  text?: string;
  params?: HarParam[];
}

export interface HarParam {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
}

export interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
  compression?: number;
}

export interface HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
}

export interface WebSocketMessage {
  type: 'send' | 'receive';
  time: number;
  opcode: number;
  data: string;
}

export interface ServerSentEvent {
  time: number;
  eventType: string;
  data: string;
  lastEventId?: string;
}

export interface CapturedRequest {
  id: string;
  method: string;
  url: string;
  startTime: number;
  endTime?: number;
  requestHeaders: HarHeader[];
  requestBody?: string;
  requestBodyMimeType?: string;
  responseStatus?: number;
  responseStatusText?: string;
  responseHeaders?: HarHeader[];
  responseBody?: string;
  responseBodyMimeType?: string;
  httpVersion: string;
  resourceType: 'xhr' | 'fetch' | 'websocket' | 'eventsource' | 'other';
  webSocketMessages?: WebSocketMessage[];
  serverSentEvents?: ServerSentEvent[];
  error?: string;
}
