import * as vscode from 'vscode';

import type { ExtensionConfiguration } from '../configuration';
import type { TabHintEntry } from '../core/tabHintRegistry';

type PanelMessage =
  | { type: 'ready' }
  | { type: 'requestUpdate' }
  | { type: 'select'; hint: string }
  | { type: 'cancel' };

interface UpdatePayload {
  entries: TabHintEntry[];
  alphabet: string;
  themeKind: vscode.ColorThemeKind;
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}

export class TabHintsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private resolver: ((hint: string | undefined) => void) | undefined;
  private latestPayload: UpdatePayload | undefined;
  private panelSubscriptions: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  async captureSelection(entries: TabHintEntry[], config: ExtensionConfiguration): Promise<string | undefined> {
    const payload: UpdatePayload = {
      entries,
      alphabet: config.hintAlphabet,
      themeKind: vscode.window.activeColorTheme.kind
    };

    this.latestPayload = payload;

    if (!this.panel) {
      this.panel = this.createPanel();
    }

    this.panel.title = 'Tab EasyMotion';
    this.panel.reveal(this.panel.viewColumn, false);

    await this.postUpdate(payload);

    return new Promise(resolve => {
      this.resolver = resolve;
    });
  }

  dispose(): void {
    this.panel?.dispose();
    this.cleanupPanel();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      'tabEasyMotion.panel',
      'Tab EasyMotion',
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false
      },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
      }
    );

    panel.webview.html = this.buildHtml(panel.webview);

    this.panelSubscriptions.push(
      panel.onDidDispose(() => {
        this.panel = undefined;
        this.resolver?.(undefined);
        this.resolver = undefined;
        this.cleanupPanel();
      })
    );

    this.panelSubscriptions.push(
      panel.webview.onDidReceiveMessage(message => {
        this.handleMessage(message as PanelMessage);
      })
    );

    return panel;
  }

  private async postUpdate(payload: UpdatePayload): Promise<void> {
    if (!this.panel) {
      return;
    }

    this.latestPayload = payload;
    await this.panel.webview.postMessage({ type: 'updateEntries', payload });
  }

  private handleMessage(message: PanelMessage): void {
    switch (message.type) {
      case 'ready':
      case 'requestUpdate':
        if (this.latestPayload && this.panel) {
          void this.panel.webview.postMessage({ type: 'updateEntries', payload: this.latestPayload });
        }
        break;
      case 'select':
        this.resolver?.(message.hint);
        this.resolver = undefined;
        this.panel?.dispose();
        break;
      case 'cancel':
        this.resolver?.(undefined);
        this.resolver = undefined;
        this.panel?.dispose();
        break;
      default:
        break;
    }
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'panel.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'panel.css'));

    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-cn">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Tab EasyMotion</title>
  </head>
  <body tabindex="0">
    <div id="app" class="app">
      <div id="hintContainer" class="hint-container"></div>
      <div id="statusBar" class="status-bar">输入提示键以跳转</div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private cleanupPanel(): void {
    if (this.panelSubscriptions.length > 0) {
      vscode.Disposable.from(...this.panelSubscriptions).dispose();
      this.panelSubscriptions = [];
    }
  }
}

