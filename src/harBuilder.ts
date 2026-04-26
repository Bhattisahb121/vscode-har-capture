import { URL } from 'url';
import {
  CapturedRequest,
  HarContent,
  HarEntry,
  HarHeader,
  HarLog,
  HarQueryParam,
  HarTimings,
} from './types';

const EXTENSION_VERSION = '0.1.0';

function parseQueryString(urlStr: string): HarQueryParam[] {
  try {
    const url = new URL(urlStr);
    const params: HarQueryParam[] = [];
    url.searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return params;
  } catch {
    return [];
  }
}

function computeHeadersSize(headers: HarHeader[]): number {
  let size = 0;
  for (const h of headers) {
    size += h.name.length + 2 + h.value.length + 2; // "name: value\r\n"
  }
  return size > 0 ? size + 2 : -1; // trailing \r\n
}

function buildTimings(req: CapturedRequest): HarTimings {
  const total = (req.endTime ?? req.startTime) - req.startTime;
  return {
    blocked: -1,
    dns: -1,
    connect: -1,
    send: 0,
    wait: total,
    receive: 0,
    ssl: -1,
  };
}

function buildContent(req: CapturedRequest): HarContent {
  const text = req.responseBody ?? '';
  const mimeType = req.responseBodyMimeType ?? 'application/octet-stream';
  return {
    size: Buffer.byteLength(text, 'utf-8'),
    mimeType,
    text,
  };
}

export function buildHarEntry(req: CapturedRequest): HarEntry {
  const timings = buildTimings(req);
  const totalTime = (req.endTime ?? req.startTime) - req.startTime;

  const entry: HarEntry = {
    startedDateTime: new Date(req.startTime).toISOString(),
    time: totalTime,
    request: {
      method: req.method,
      url: req.url,
      httpVersion: req.httpVersion,
      cookies: [],
      headers: req.requestHeaders,
      queryString: parseQueryString(req.url),
      headersSize: computeHeadersSize(req.requestHeaders),
      bodySize: req.requestBody ? Buffer.byteLength(req.requestBody, 'utf-8') : 0,
      ...(req.requestBody
        ? {
            postData: {
              mimeType: req.requestBodyMimeType ?? 'application/octet-stream',
              text: req.requestBody,
            },
          }
        : {}),
    },
    response: {
      status: req.responseStatus ?? 0,
      statusText: req.responseStatusText ?? '',
      httpVersion: req.httpVersion,
      cookies: [],
      headers: req.responseHeaders ?? [],
      content: buildContent(req),
      redirectURL: '',
      headersSize: computeHeadersSize(req.responseHeaders ?? []),
      bodySize: req.responseBody ? Buffer.byteLength(req.responseBody, 'utf-8') : -1,
    },
    cache: {},
    timings,
    _resourceType: req.resourceType,
  };

  if (req.webSocketMessages && req.webSocketMessages.length > 0) {
    entry._webSocketMessages = req.webSocketMessages;
  }
  if (req.serverSentEvents && req.serverSentEvents.length > 0) {
    entry._serverSentEvents = req.serverSentEvents;
  }
  if (req.error) {
    entry.comment = `Error: ${req.error}`;
  }

  return entry;
}

export function buildHarLog(entries: HarEntry[]): HarLog {
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'vscode-har-capture',
        version: EXTENSION_VERSION,
      },
      entries,
    },
  };
}
