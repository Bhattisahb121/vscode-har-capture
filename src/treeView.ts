import * as vscode from 'vscode';
import { CapturedRequest } from './types';

export class HarEntryItem extends vscode.TreeItem {
  constructor(public readonly captured: CapturedRequest) {
    const statusIcon = captured.error
      ? '$(error)'
      : captured.resourceType === 'websocket'
        ? '$(plug)'
        : captured.resourceType === 'eventsource'
          ? '$(broadcast)'
          : captured.responseStatus
            ? captured.responseStatus < 400
              ? '$(check)'
              : '$(warning)'
            : '$(loading~spin)';

    const statusCode = captured.responseStatus ? ` [${captured.responseStatus}]` : '';
    const label = `${statusIcon} ${captured.method} ${shortenUrl(captured.url)}${statusCode}`;

    super(label, vscode.TreeItemCollapsibleState.None);

    this.tooltip = buildTooltip(captured);
    this.description = getTimingDescription(captured);
    this.contextValue = captured.resourceType;
    this.command = {
      command: 'harCapture.showDetail',
      title: 'Show Detail',
      arguments: [captured],
    };
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40
      ? '...' + u.pathname.slice(-37)
      : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  }
}

function getTimingDescription(req: CapturedRequest): string {
  if (!req.endTime) {
    if (req.resourceType === 'websocket') {
      const msgCount = req.webSocketMessages?.length ?? 0;
      return `${msgCount} msgs`;
    }
    if (req.resourceType === 'eventsource') {
      const eventCount = req.serverSentEvents?.length ?? 0;
      return `${eventCount} events`;
    }
    return 'pending...';
  }
  const duration = req.endTime - req.startTime;
  return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
}

function buildTooltip(req: CapturedRequest): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${req.method}** \`${req.url}\`\n\n`);

  if (req.responseStatus) {
    md.appendMarkdown(`**Status:** ${req.responseStatus} ${req.responseStatusText}\n\n`);
  }

  if (req.resourceType === 'websocket' && req.webSocketMessages) {
    md.appendMarkdown(`**WebSocket Messages:** ${req.webSocketMessages.length}\n\n`);
  }

  if (req.resourceType === 'eventsource' && req.serverSentEvents) {
    md.appendMarkdown(`**SSE Events:** ${req.serverSentEvents.length}\n\n`);
  }

  if (req.error) {
    md.appendMarkdown(`**Error:** ${req.error}\n\n`);
  }

  md.appendMarkdown(`**Time:** ${new Date(req.startTime).toISOString()}\n`);
  return md;
}

export class HarTreeDataProvider implements vscode.TreeDataProvider<HarEntryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HarEntryItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private entries: CapturedRequest[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateEntries(entries: CapturedRequest[]): void {
    this.entries = entries;
    this.refresh();
  }

  addEntry(entry: CapturedRequest): void {
    const existingIdx = this.entries.findIndex((e) => e.id === entry.id);
    if (existingIdx >= 0) {
      this.entries[existingIdx] = entry;
    } else {
      this.entries.push(entry);
    }
    this.refresh();
  }

  clear(): void {
    this.entries = [];
    this.refresh();
  }

  getTreeItem(element: HarEntryItem): vscode.TreeItem {
    return element;
  }

  getChildren(): HarEntryItem[] {
    return this.entries.map((entry) => new HarEntryItem(entry));
  }
}
