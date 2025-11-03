import * as vscode from 'vscode';

import { readConfiguration, onDidChangeConfiguration } from './configuration';
import { collectActiveGroupTabs, TabDescriptor } from './core/tabCollector';
import { TabHintRegistry, TabHintEntry } from './core/tabHintRegistry';
import { TabUsageTracker } from './core/tabUsageTracker';
import { TabHintsPanel } from './webview/tabHintsPanel';

export class TabEasyMotionController implements vscode.Disposable {
  private readonly registry = new TabHintRegistry();
  private readonly disposables: vscode.Disposable[] = [];
  private configuration = readConfiguration();
  private readonly panel: TabHintsPanel;
  private readonly usageTracker: TabUsageTracker;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.panel = new TabHintsPanel(context.extensionUri);
    this.usageTracker = new TabUsageTracker(context.workspaceState);

    this.disposables.push(
      this.usageTracker,
      onDidChangeConfiguration(() => {
        this.configuration = readConfiguration();
      })
    );
  }

  async presentHints(): Promise<void> {
    const entries = this.prepareEntries();

    if (!entries) {
      return;
    }

    const selectedHint = await this.panel.captureSelection(entries, this.configuration);

    if (!selectedHint) {
      return;
    }

    await this.handleHintSelection(selectedHint);
  }

  private async revealTab(descriptor: TabDescriptor): Promise<void> {
    const input = descriptor.tab.input;

    if (input instanceof vscode.TabInputText) {
      await vscode.window.showTextDocument(input.uri, {
        viewColumn: descriptor.tab.group.viewColumn,
        preserveFocus: false,
        preview: descriptor.tab.isPreview
      });
      return;
    }

    if (input instanceof vscode.TabInputTextDiff) {
      await vscode.commands.executeCommand('vscode.diff', input.original, input.modified, descriptor.tab.label, {
        viewColumn: descriptor.tab.group.viewColumn,
        preview: descriptor.tab.isPreview
      });
      return;
    }

    if (input instanceof vscode.TabInputNotebook) {
      await vscode.commands.executeCommand('vscode.open', input.uri, {
        viewColumn: descriptor.tab.group.viewColumn,
        preserveFocus: false,
        preview: descriptor.tab.isPreview
      });
      return;
    }

    if (input instanceof vscode.TabInputNotebookDiff) {
      await vscode.commands.executeCommand('vscode.diff', input.original, input.modified, descriptor.tab.label, {
        viewColumn: descriptor.tab.group.viewColumn,
        preview: descriptor.tab.isPreview
      });
      return;
    }

    if (input instanceof vscode.TabInputCustom) {
      await vscode.commands.executeCommand('vscode.openWith', input.uri, input.viewType, {
        viewColumn: descriptor.tab.group.viewColumn,
        preview: descriptor.tab.isPreview
      });
      return;
    }

    if (input instanceof vscode.TabInputWebview) {
      void vscode.window.showWarningMessage('暂不支持通过命令面板重新聚焦 Webview 标签页。');
      return;
    }

    if (input instanceof vscode.TabInputTerminal) {
      await vscode.commands.executeCommand('workbench.action.terminal.focus');
      return;
    }

    if (descriptor.resourceUri) {
      await vscode.commands.executeCommand('vscode.open', descriptor.resourceUri, {
        viewColumn: descriptor.tab.group.viewColumn,
        preserveFocus: false,
        preview: descriptor.tab.isPreview
      });
      return;
    }

    void vscode.window.showWarningMessage('暂不支持切换到该类型的标签页。');
  }

  dispose(): void {
    this.registry.clear();
    vscode.Disposable.from(...this.disposables).dispose();
    this.panel.dispose();
  }

  private prepareEntries(): TabHintEntry[] | undefined {
    const tabs = collectActiveGroupTabs();

    if (tabs.length === 0) {
      void vscode.window.showInformationMessage('当前编辑器组没有可用的标签页。');
      return undefined;
    }

    this.registry.rebuild(tabs, {
      alphabet: this.configuration.hintAlphabet,
      maxDepth: this.configuration.maxHintLength
    });

    const usageSnapshot = this.usageTracker.computeSnapshot(tabs);

    return this.registry.getViewEntries().map(entry => {
      const usage = usageSnapshot.get(entry.id);

      if (!usage) {
        return entry;
      }

      return {
        ...entry,
        usageCount: usage.count,
        usageHeat: usage.heat,
        lastActivatedAt: usage.lastActivatedAt
      } satisfies TabHintEntry;
    });
  }

  private async handleHintSelection(hint: string): Promise<void> {
    const descriptor = this.registry.resolveTabByHint(hint);

    if (!descriptor) {
      void vscode.window.showWarningMessage('未找到对应的标签页。');
      return;
    }

    await this.revealTab(descriptor);
  }
}

