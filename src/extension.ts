import * as vscode from 'vscode';
import * as fs from 'fs';
import { buildHarEntry, buildHarLog } from './harBuilder';
import {
  startCapture,
  stopCapture,
  isCapturing,
  getCapturedRequests,
  clearCapturedRequests,
  onRequestCaptured,
} from './interceptor';
import {
  startWsCapture,
  stopWsCapture,
  getCapturedWsConnections,
  clearCapturedWsConnections,
  onWsRequestCaptured,
} from './wsInterceptor';
import { HarTreeDataProvider } from './treeView';
import { showEntryDetail } from './detailView';
import { CapturedRequest } from './types';

let statusBarItem: vscode.StatusBarItem;
let treeDataProvider: HarTreeDataProvider;
let requestCount = 0;

export function activate(context: vscode.ExtensionContext): void {
  treeDataProvider = new HarTreeDataProvider();
  vscode.window.registerTreeDataProvider('harCaptureEntries', treeDataProvider);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'harCapture.toggle';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const onUpdate = (req: CapturedRequest) => {
    treeDataProvider.addEntry(req);
    requestCount = getAllCapturedRequests().length;
    updateStatusBar();
  };

  context.subscriptions.push(
    onRequestCaptured(onUpdate),
    onWsRequestCaptured(onUpdate)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('harCapture.start', () => {
      startCapture();
      startWsCapture();
      updateStatusBar();
      vscode.window.showInformationMessage('HAR Capture: Started capturing network traffic');
    }),

    vscode.commands.registerCommand('harCapture.stop', () => {
      stopCapture();
      stopWsCapture();
      updateStatusBar();
      vscode.window.showInformationMessage('HAR Capture: Stopped capturing');
    }),

    vscode.commands.registerCommand('harCapture.toggle', () => {
      if (isCapturing()) {
        vscode.commands.executeCommand('harCapture.stop');
      } else {
        vscode.commands.executeCommand('harCapture.start');
      }
    }),

    vscode.commands.registerCommand('harCapture.save', async () => {
      const allRequests = getAllCapturedRequests();
      if (allRequests.length === 0) {
        vscode.window.showWarningMessage('HAR Capture: No entries to save');
        return;
      }

      const entries = allRequests.map(buildHarEntry);
      const harLog = buildHarLog(entries);
      const harJson = JSON.stringify(harLog, null, 2);

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.har`
        ),
        filters: {
          'HAR Files': ['har'],
          'JSON Files': ['json'],
        },
      });

      if (uri) {
        fs.writeFileSync(uri.fsPath, harJson, 'utf-8');
        vscode.window.showInformationMessage(
          `HAR Capture: Saved ${entries.length} entries to ${uri.fsPath}`
        );
      }
    }),

    vscode.commands.registerCommand('harCapture.clear', () => {
      clearCapturedRequests();
      clearCapturedWsConnections();
      treeDataProvider.clear();
      requestCount = 0;
      updateStatusBar();
      vscode.window.showInformationMessage('HAR Capture: Cleared all entries');
    }),

    vscode.commands.registerCommand(
      'harCapture.showDetail',
      (captured: CapturedRequest) => {
        showEntryDetail(captured, context);
      }
    )
  );
}

function getAllCapturedRequests(): CapturedRequest[] {
  return [...getCapturedRequests(), ...getCapturedWsConnections()];
}

function updateStatusBar(): void {
  const active = isCapturing();
  statusBarItem.text = active
    ? `$(radio-tower) HAR: Recording (${requestCount})`
    : `$(circle-outline) HAR: Off`;
  statusBarItem.tooltip = active
    ? `Capturing network traffic — ${requestCount} requests captured. Click to stop.`
    : 'Click to start capturing network traffic';
  statusBarItem.backgroundColor = active
    ? new vscode.ThemeColor('statusBarItem.warningBackground')
    : undefined;
}

export function deactivate(): void {
  stopCapture();
  stopWsCapture();
}
