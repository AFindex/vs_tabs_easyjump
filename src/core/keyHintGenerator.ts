export interface HintGenerationOptions {
  alphabet: string;
  maxDepth?: number;
}

export function generateHints(count: number, options: HintGenerationOptions): string[] {
  const { alphabet, maxDepth } = options;
  const cleanAlphabet = [...new Set(alphabet.split(''))].join('');

  if (!cleanAlphabet) {
    throw new Error('键位字母表不能为空。');
  }

  const queue: Array<{ value: string; depth: number }> = [];
  const results: string[] = [];

  for (const char of cleanAlphabet) {
    queue.push({ value: char, depth: 1 });
  }

  while (queue.length > 0 && results.length < count) {
    const current = queue.shift()!;
    results.push(current.value);

    if (maxDepth && current.depth >= maxDepth) {
      continue;
    }

    for (const char of cleanAlphabet) {
      queue.push({ value: `${current.value}${char}`, depth: current.depth + 1 });
    }
  }

  if (results.length < count) {
    throw new Error('提供的键位字母表不足以生成足够的提示。');
  }

  return results;
}

