import * as vscode from 'vscode';
import { CapturedRequest } from './types';

export function showEntryDetail(
  captured: CapturedRequest,
  context: vscode.ExtensionContext
): void {
  const panel = vscode.window.createWebviewPanel(
    'harCaptureDetail',
    `${captured.method} ${shortenUrl(captured.url)}`,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  panel.webview.html = buildDetailHtml(captured);
  context.subscriptions.push(panel);
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 30
      ? u.host + u.pathname.slice(0, 27) + '...'
      : u.host + u.pathname;
  } catch {
    return url.slice(0, 40);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function buildDetailHtml(req: CapturedRequest): string {
  const duration = req.endTime
    ? `${req.endTime - req.startTime}ms`
    : 'pending';

  let wsSection = '';
  if (req.resourceType === 'websocket' && req.webSocketMessages) {
    wsSection = `
      <h2>WebSocket Messages (${req.webSocketMessages.length})</h2>
      <table>
        <tr><th>Direction</th><th>Time</th><th>Opcode</th><th>Data</th></tr>
        ${req.webSocketMessages
          .map(
            (m) =>
              `<tr class="${m.type}">
                <td>${m.type === 'send' ? '⬆ Send' : '⬇ Receive'}</td>
                <td>${m.time}ms</td>
                <td>${m.opcode}</td>
                <td><pre>${escapeHtml(m.data.slice(0, 2000))}</pre></td>
              </tr>`
          )
          .join('')}
      </table>`;
  }

  let sseSection = '';
  if (req.resourceType === 'eventsource' && req.serverSentEvents) {
    sseSection = `
      <h2>Server-Sent Events (${req.serverSentEvents.length})</h2>
      <table>
        <tr><th>Time</th><th>Event</th><th>ID</th><th>Data</th></tr>
        ${req.serverSentEvents
          .map(
            (e) =>
              `<tr>
                <td>${e.time}ms</td>
                <td>${escapeHtml(e.eventType)}</td>
                <td>${e.lastEventId ? escapeHtml(e.lastEventId) : '-'}</td>
                <td><pre>${escapeHtml(e.data.slice(0, 2000))}</pre></td>
              </tr>`
          )
          .join('')}
      </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    font-size: 13px;
    line-height: 1.5;
  }
  h1 { font-size: 16px; margin-bottom: 8px; }
  h2 { font-size: 14px; margin-top: 20px; border-bottom: 1px solid var(--vscode-panel-border, #444); padding-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground, #888); margin-bottom: 12px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    margin-right: 8px;
  }
  .badge.success { background: #2e7d32; color: #fff; }
  .badge.error { background: #c62828; color: #fff; }
  .badge.info { background: #1565c0; color: #fff; }
  .badge.pending { background: #555; color: #fff; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border, #333); }
  th { font-weight: bold; background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a); }
  pre {
    background: var(--vscode-textCodeBlock-background, #2a2a2a);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 400px;
    overflow-y: auto;
  }
  .send { background: rgba(46, 125, 50, 0.1); }
  .receive { background: rgba(21, 101, 192, 0.1); }
</style>
</head>
<body>
  <h1>${escapeHtml(req.method)} ${escapeHtml(req.url)}</h1>
  <div class="meta">
    ${getStatusBadge(req)}
    <span class="badge ${req.resourceType === 'websocket' ? 'info' : req.resourceType === 'eventsource' ? 'info' : 'pending'}">${req.resourceType.toUpperCase()}</span>
    <span>${duration}</span>
    &middot; ${new Date(req.startTime).toISOString()}
  </div>

  ${req.error ? `<div style="color: #ef5350; margin-bottom: 12px;">Error: ${escapeHtml(req.error)}</div>` : ''}

  <h2>Request Headers</h2>
  <table>
    <tr><th>Name</th><th>Value</th></tr>
    ${req.requestHeaders.map((h) => `<tr><td>${escapeHtml(h.name)}</td><td>${escapeHtml(h.value)}</td></tr>`).join('')}
  </table>

  ${
    req.requestBody
      ? `<h2>Request Body</h2><pre>${escapeHtml(formatJson(req.requestBody))}</pre>`
      : ''
  }

  ${
    req.responseHeaders
      ? `<h2>Response Headers</h2>
         <table>
           <tr><th>Name</th><th>Value</th></tr>
           ${req.responseHeaders.map((h) => `<tr><td>${escapeHtml(h.name)}</td><td>${escapeHtml(h.value)}</td></tr>`).join('')}
         </table>`
      : ''
  }

  ${
    req.responseBody
      ? `<h2>Response Body</h2><pre>${escapeHtml(formatJson(req.responseBody.slice(0, 50000)))}</pre>`
      : ''
  }

  ${wsSection}
  ${sseSection}
</body>
</html>`;
}

function getStatusBadge(req: CapturedRequest): string {
  if (!req.responseStatus) {
    return '<span class="badge pending">Pending</span>';
  }
  if (req.responseStatus < 400) {
    return `<span class="badge success">${req.responseStatus} ${escapeHtml(req.responseStatusText ?? '')}</span>`;
  }
  return `<span class="badge error">${req.responseStatus} ${escapeHtml(req.responseStatusText ?? '')}</span>`;
}
