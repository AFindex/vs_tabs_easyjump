import * as vscode from 'vscode';

import { TabEasyMotionController } from './tabEasyMotionController';

let controller: TabEasyMotionController | undefined;

export function activate(context: vscode.ExtensionContext) {
  controller = new TabEasyMotionController(context);

  const disposable = vscode.commands.registerCommand('tabEasyMotion.activate', async () => {
    await controller?.presentHints();
  });
  context.subscriptions.push(disposable, controller);
}

export function deactivate() {
  controller?.dispose();
  controller = undefined;
}

