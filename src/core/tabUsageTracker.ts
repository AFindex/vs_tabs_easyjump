import * as vscode from 'vscode';

import type { TabDescriptor } from './tabCollector';

interface StoredUsageEntry {
  count: number;
  lastActivatedAt: number;
}

export interface UsageSnapshotEntry {
  count: number;
  lastActivatedAt: number;
  heat: number;
}

export type UsageSnapshot = Map<string, UsageSnapshotEntry>;

const STORAGE_KEY = 'tabEasyMotion.tabUsage.v1';
const STORAGE_LIMIT = 250;
const RECENCY_HALF_LIFE_MS = 30 * 60 * 1000; // 30 minutes
const COUNT_WEIGHT = 0.6;
const RECENCY_WEIGHT = 0.4;

export class TabUsageTracker implements vscode.Disposable {
  private readonly usage = new Map<string, StoredUsageEntry>();
  private readonly disposables: vscode.Disposable[] = [];
  private lastRecordedKey: string | undefined;

  constructor(private readonly storage: vscode.Memento) {
    this.loadFromStorage();
    this.bootstrapCurrentActiveTabs();
    this.registerListeners();
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
    this.usage.clear();
  }

  computeSnapshot(tabs: TabDescriptor[]): UsageSnapshot {
    const now = Date.now();
    const snapshot: UsageSnapshot = new Map();

    if (tabs.length === 0) {
      return snapshot;
    }

    let maxCount = 0;

    const tabInfos = tabs.map(descriptor => {
      const key = this.toKey(descriptor.tab);
      const entry = this.usage.get(key);
      const count = entry?.count ?? 0;
      const lastActivatedAt = entry?.lastActivatedAt ?? 0;

      if (count > maxCount) {
        maxCount = count;
      }

      return {
        descriptorId: descriptor.id,
        count,
        lastActivatedAt
      };
    });

    tabInfos.forEach(info => {
      const countScore = maxCount > 0 ? info.count / maxCount : 0;
      const recencyScore = this.computeRecencyScore(info.lastActivatedAt, now);
      const heat = Math.min(1, Math.max(0, COUNT_WEIGHT * countScore + RECENCY_WEIGHT * recencyScore));

      snapshot.set(info.descriptorId, {
        count: info.count,
        lastActivatedAt: info.lastActivatedAt,
        heat
      });
    });

    return snapshot;
  }

  private computeRecencyScore(timestamp: number, now: number): number {
    if (!timestamp) {
      return 0;
    }

    const age = Math.max(0, now - timestamp);
    return Math.exp(-age / RECENCY_HALF_LIFE_MS);
  }

  private registerListeners(): void {
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(event => {
        event.changed.forEach(tab => {
          if (tab.isActive) {
            this.record(tab);
          }
        });

        event.opened.forEach(tab => {
          if (tab.isActive) {
            this.record(tab, { force: true });
          }
        });
      })
    );

    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabGroups(event => {
        event.changed.forEach(group => {
          const activeTab = group.activeTab;
          if (activeTab) {
            this.record(activeTab, { force: true });
          }
        });
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
          return;
        }

        const matchingTab = this.findTabForUri(editor.document.uri);
        if (matchingTab) {
          this.record(matchingTab);
        }
      })
    );
  }

  private bootstrapCurrentActiveTabs(): void {
    vscode.window.tabGroups.all.forEach(group => {
      const activeTab = group.activeTab;
      if (activeTab) {
        this.record(activeTab, { force: true });
      }
    });
  }

  private record(tab: vscode.Tab, options?: { force?: boolean }): void {
    const key = this.toKey(tab);

    if (!options?.force && key === this.lastRecordedKey) {
      return;
    }

    this.lastRecordedKey = key;

    const now = Date.now();
    const previous = this.usage.get(key);
    const nextEntry: StoredUsageEntry = {
      count: (previous?.count ?? 0) + 1,
      lastActivatedAt: now
    };

    this.usage.set(key, nextEntry);
    this.trimUsage();
    this.persist();
  }

  private toKey(tab: vscode.Tab): string {
    const viewColumn = tab.group?.viewColumn ?? 'unknown';
    const input = tab.input;

    if (input instanceof vscode.TabInputText) {
      return `text:${viewColumn}:${input.uri.toString(true)}`;
    }

    if (input instanceof vscode.TabInputTextDiff) {
      return `diff:${viewColumn}:${input.modified.toString(true)}`;
    }

    if (input instanceof vscode.TabInputNotebook) {
      return `notebook:${viewColumn}:${input.uri.toString(true)}`;
    }

    if (input instanceof vscode.TabInputNotebookDiff) {
      return `notebookDiff:${viewColumn}:${input.modified.toString(true)}`;
    }

    if (input instanceof vscode.TabInputCustom) {
      return `custom:${viewColumn}:${input.viewType}:${input.uri.toString(true)}`;
    }

    if (input instanceof vscode.TabInputWebview) {
      return `webview:${viewColumn}:${tab.label}`;
    }

    if (input instanceof vscode.TabInputTerminal) {
      return `terminal:${viewColumn}:${tab.label}`;
    }

    return `unknown:${viewColumn}:${tab.label}`;
  }

  private findTabForUri(uri: vscode.Uri): vscode.Tab | undefined {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;

        if (input instanceof vscode.TabInputText && input.uri.toString(true) === uri.toString(true)) {
          return tab;
        }

        if (input instanceof vscode.TabInputTextDiff && input.modified.toString(true) === uri.toString(true)) {
          return tab;
        }

        if (input instanceof vscode.TabInputNotebook && input.uri.toString(true) === uri.toString(true)) {
          return tab;
        }

        if (input instanceof vscode.TabInputNotebookDiff && input.modified.toString(true) === uri.toString(true)) {
          return tab;
        }

        if (input instanceof vscode.TabInputCustom && input.uri.toString(true) === uri.toString(true)) {
          return tab;
        }
      }
    }

    return undefined;
  }

  private trimUsage(): void {
    if (this.usage.size <= STORAGE_LIMIT) {
      return;
    }

    const entries = Array.from(this.usage.entries()).sort((a, b) => b[1].lastActivatedAt - a[1].lastActivatedAt);

    this.usage.clear();
    entries.slice(0, STORAGE_LIMIT).forEach(([key, value]) => {
      this.usage.set(key, value);
    });
  }

  private persist(): void {
    const payload: Record<string, StoredUsageEntry> = {};
    this.usage.forEach((value, key) => {
      payload[key] = value;
    });

    void this.storage.update(STORAGE_KEY, payload);
  }

  private loadFromStorage(): void {
    const stored = this.storage.get<Record<string, StoredUsageEntry>>(STORAGE_KEY);
    if (!stored) {
      return;
    }

    Object.entries(stored).forEach(([key, value]) => {
      if (typeof value.count === 'number' && typeof value.lastActivatedAt === 'number') {
        this.usage.set(key, value);
      }
    });
  }
}


