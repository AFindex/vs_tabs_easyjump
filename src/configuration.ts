import * as vscode from 'vscode';

export interface ExtensionConfiguration {
  hintAlphabet: string;
  maxHintLength?: number;
}

const CONFIG_SECTION = 'tabEasyMotion';

const DEFAULT_ALPHABET = 'asdfghjkl;wertyuiopxcvbnm';

export function readConfiguration(): ExtensionConfiguration {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const rawMax = config.get<number>('maxHintLength', 2);
  const maxHintLength = typeof rawMax === 'number' && rawMax > 0 ? rawMax : undefined;

  return {
    hintAlphabet: config.get<string>('hintAlphabet', DEFAULT_ALPHABET),
    maxHintLength
  };
}

export function onDidChangeConfiguration(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(CONFIG_SECTION)) {
      listener();
    }
  });
}

