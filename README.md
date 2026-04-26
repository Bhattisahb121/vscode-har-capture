# HAR Capture — VSCode Extension

Capture HTTP/HTTPS requests, Server-Sent Events (SSE), and WebSocket traffic originating from VSCode extensions and save them as [HAR 1.2](http://www.softwareishard.com/blog/har-12-spec/) files.

## Features

- **HTTP/HTTPS Interception** — Monkey-patches Node.js `http` and `https` modules to capture all outgoing requests and their responses made by any VSCode extension running in the same process.
- **SSE (Server-Sent Events)** — Automatically detects `text/event-stream` responses and records individual SSE events with timestamps.
- **WebSocket** — Intercepts `ws` (WebSocket) connections to capture sent and received messages, stored as `_webSocketMessages` in the HAR entry.
- **HAR 1.2 Export** — Saves captured traffic as standard HAR files that can be opened in Chrome DevTools, [HAR Viewer](http://www.softwareishard.com/har/viewer/), or any HAR-compatible tool.
- **Tree View** — A dedicated Activity Bar panel shows captured requests in real time with status icons, timing, and tooltips.
- **Detail View** — Click any captured entry to see full request/response headers, bodies, WebSocket messages, and SSE events in a formatted webview panel.
- **Status Bar** — Shows recording status and request count; click to toggle capture on/off.

## Commands

| Command | Description |
|---|---|
| `HAR Capture: Start Capturing` | Begin intercepting network traffic |
| `HAR Capture: Stop Capturing` | Stop intercepting |
| `HAR Capture: Toggle Capture` | Toggle capture on/off |
| `HAR Capture: Save HAR File` | Export captured entries to a `.har` file |
| `HAR Capture: Clear Captured Entries` | Clear all captured data |
| `HAR Capture: Show Entry Detail` | View full details of a captured request |

## How It Works

The extension monkey-patches Node.js `http.request`, `http.get`, `https.request`, and `https.get` at runtime to intercept all HTTP/HTTPS traffic from the VSCode extension host process. For WebSocket support, it patches the `ws` module if available.

### HAR Extensions

Standard HAR 1.2 fields are used for HTTP traffic. Two custom fields are added for real-time protocols:

- `_webSocketMessages` — Array of `{ type, time, opcode, data }` for WebSocket entries
- `_serverSentEvents` — Array of `{ time, eventType, data, lastEventId }` for SSE entries

## Installation

### From Source

```bash
git clone https://github.com/YOUR_USER/vscode-har-capture.git
cd vscode-har-capture
npm install
npm run build
```

Then press `F5` in VSCode to launch the Extension Development Host, or package with:

```bash
npx vsce package
```

## Requirements

- VSCode ≥ 1.80.0
- Node.js ≥ 16

## License

ISC
