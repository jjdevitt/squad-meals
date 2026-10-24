export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaChatOptions {
  host?: string;
  model: string;
  system: string;
  userPrompt: string;
  formatJson?: boolean;
  temperature?: number;
  onToken?: (partialText: string, tokenCount: number) => void;
}

export class OllamaClient {
  public readonly host: string;
  private selectedModel: string | null;

  constructor(host?: string, preferredModel?: string) {
    this.host = (host || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.selectedModel = preferredModel || process.env.OLLAMA_MODEL || null;
  }

  public getModel(): string | null {
    return this.selectedModel;
  }

  public setModel(model: string): void {
    this.selectedModel = model.trim();
  }

  /**
   * Lists models available on the local Ollama server.
   */
  public async listModels(): Promise<OllamaModelInfo[]> {
    const res = await fetch(`${this.host}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`Ollama API returned HTTP ${res.status} (${res.statusText})`);
    }
    const data = (await res.json()) as { models?: OllamaModelInfo[] };
    return data.models || [];
  }

  /**
   * Auto-detects the first suitable local Ollama model if none was explicitly set,
   * or verifies connectivity to the local Ollama instance.
   */
  public async resolveModel(): Promise<{ model: string; availableModels: string[]; online: boolean; error?: string }> {
    try {
      const models = await this.listModels();
      const names = models.map((m) => m.name);

      if (this.selectedModel && this.selectedModel !== 'ollama-auto') {
        return {
          model: this.selectedModel,
          availableModels: names,
          online: true,
        };
      }

      // Prefer non-embedding models first
      const chatModels = names.filter(
        (name) => !/embed|nomic-embed|bge-|all-minilm/i.test(name)
      );
      const chosen = chatModels[0] || names[0] || 'llama3.2';
      this.selectedModel = chosen;

      return {
        model: chosen,
        availableModels: names,
        online: names.length > 0,
        error:
          names.length === 0
            ? 'Ollama is running, but no models are installed. Run `ollama pull llama3.2`.'
            : undefined,
      };
    } catch (err) {
      const fallback = this.selectedModel && this.selectedModel !== 'ollama-auto' ? this.selectedModel : 'llama3.2';
      this.selectedModel = fallback;
      return {
        model: fallback,
        availableModels: [],
        online: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Streams a chat completion from the local Ollama server.
   */
  public async chat(options: OllamaChatOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.userPrompt },
      ],
      stream: true,
      options: {
        temperature: options.temperature ?? 0.4,
      },
    };

    if (options.formatJson) {
      body.format = 'json';
    }

    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama error (${res.status}): ${errBody || res.statusText}`);
    }

    if (!res.body) {
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content || '';
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let tokenCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
            error?: string;
          };
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            tokenCount += 1;
            options.onToken?.(fullContent, tokenCount);
          }
        } catch (e) {
          if (e instanceof Error && !e.message.includes('JSON')) {
            throw e;
          }
        }
      }
    }

    return fullContent;
  }
}

/**
 * Extracts and parses a JSON object from an LLM response, handling optional code fences.
 */
export function parseJsonFromLlm<T>(raw: string, fallback: T): T {
  const cleaned = raw.trim();
  const candidates: string[] = [cleaned];

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidates.unshift(fenceMatch[1].trim());
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }

  return fallback;
}
