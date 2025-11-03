import { generateHints } from './keyHintGenerator';
import type { TabDescriptor } from './tabCollector';

export interface TabHintEntry {
  id: string;
  hint: string;
  title: string;
  description: string;
  index: number;
  firstLetter: string;
  usageCount: number;
  usageHeat: number;
  lastActivatedAt: number;
}

interface TabHintInternal {
  hint: string;
  descriptor: TabDescriptor;
}

export interface RebuildOptions {
  alphabet: string;
  maxDepth?: number;
}

export class TabHintRegistry {
  private hints: TabHintInternal[] = [];

  rebuild(tabs: TabDescriptor[], options: RebuildOptions): void {
    if (tabs.length === 0) {
      this.hints = [];
      return;
    }

    const hintValues = generateHints(tabs.length, {
      alphabet: options.alphabet,
      maxDepth: options.maxDepth
    });

    this.hints = tabs.map((descriptor, index) => ({
      hint: hintValues[index],
      descriptor
    }));
  }

  clear(): void {
    this.hints = [];
  }

  getViewEntries(): TabHintEntry[] {
    return this.hints.map(({ hint, descriptor }) => ({
      id: descriptor.id,
      hint,
      title: descriptor.title,
      description: descriptor.description,
      index: descriptor.index,
      firstLetter: descriptor.title.charAt(0) ?? '',
      usageCount: 0,
      usageHeat: 0,
      lastActivatedAt: 0
    } satisfies TabHintEntry));
  }

  resolveTabByHint(hint: string): TabDescriptor | undefined {
    const normalizedHint = hint.toLowerCase();
    return this.hints.find(entry => entry.hint.toLowerCase() === normalizedHint)?.descriptor;
  }
}

