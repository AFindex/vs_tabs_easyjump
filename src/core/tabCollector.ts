import * as path from 'path';
import * as vscode from 'vscode';

export interface TabDescriptor {
  id: string;
  index: number;
  title: string;
  description: string;
  resourceUri?: vscode.Uri;
  tab: vscode.Tab;
}

export function collectActiveGroupTabs(): TabDescriptor[] {
  const group = vscode.window.tabGroups.activeTabGroup;

  if (!group) {
    return [];
  }

  return group.tabs.map((tab, index) => {
    const resourceUri = extractResourceUri(tab);
    const id = `${group.viewColumn ?? 'unknown'}:${index}`;

    return {
      id,
      index,
      title: tab.label,
      description: resourceUri ? formatDescription(resourceUri) : tab.label,
      resourceUri,
      tab
    } satisfies TabDescriptor;
  });
}

function extractResourceUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input;

  if (!input) {
    return undefined;
  }

  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }

  if (input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }

  if (input instanceof vscode.TabInputCustom) {
    return input.uri;
  }

  if (input instanceof vscode.TabInputWebview) {
    return undefined;
  }

  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }

  if (input instanceof vscode.TabInputNotebookDiff) {
    return input.modified;
  }

  if (input instanceof vscode.TabInputTerminal) {
    return undefined;
  }

  return undefined;
}

function formatDescription(uri: vscode.Uri): string {
  if (uri.scheme === 'untitled') {
    return '未命名文件';
  }

  if (uri.scheme === 'vscode-vfs' || uri.scheme === 'vscode-userdata') {
    return uri.toString(true);
  }

  const fsPath = uri.fsPath;
  return fsPath ? path.normalize(fsPath) : uri.toString(true);
}

