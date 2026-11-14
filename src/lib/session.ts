import type {
  ChatMessage,
  Effort,
  Provider,
  TokenUsage,
} from "@/lib/providers";

export type SessionSettings = {
  temperature?: number;
  effort?: Effort;
  maxTokens?: number;
};

export type Turn = {
  model: string;
  usage: TokenUsage;
  /** Null when the model has no published price, so nothing is guessed. */
  dollars: number | null;
};

export type SessionCost = {
  turns: number;
  input: number;
  output: number;
  dollars: number;
  /** Model ids this session used that have no published price. */
  unpriced: string[];
};

export type SessionOptions = {
  provider: Provider;
  model?: string;
  system?: string;
  settings?: SessionSettings;
};

function pricedAt(provider: Provider, model: string) {
  return provider.models.find((entry) => entry.id === model)
    ?.pricePerMillionTokens;
}

/**
 * One conversation: the provider and model answering, the system prompt, the
 * messages so far, and what each turn cost.
 */
export class Session {
  #provider: Provider;
  #model: string;
  #system: string;
  #settings: SessionSettings;
  #messages: ChatMessage[] = [];
  #turns: Turn[] = [];

  constructor({ provider, model, system, settings }: SessionOptions) {
    this.#provider = provider;
    this.#model = model ?? provider.models[0].id;
    this.#system = system ?? "";
    this.#settings = settings ?? {};
  }

  get provider() {
    return this.#provider;
  }

  get model() {
    return this.#model;
  }

  get system() {
    return this.#system;
  }

  get history(): readonly ChatMessage[] {
    return [...this.#messages];
  }

  get turns(): readonly Turn[] {
    return [...this.#turns];
  }

  setSystem(text: string) {
    this.#system = text;
  }

  /** Switches provider or model; the conversation carries on. */
  use(provider: Provider, model?: string) {
    this.#provider = provider;
    this.#model = model ?? provider.models[0].id;
  }

  /**
   * Streams one reply. Both messages reach the history only after the reply
   * completes, so a failed turn leaves nothing behind.
   */
  async send(text: string, onText: (chunk: string) => void): Promise<Turn> {
    const provider = this.#provider;
    const model = this.#model;
    const messages = [
      ...this.#messages,
      { role: "user" as const, content: text },
    ];

    let reply = "";
    const usage = await provider.stream(
      { ...this.#settings, messages, system: this.#system, model },
      (chunk) => {
        reply += chunk;
        onText(chunk);
      },
    );

    this.#messages = [...messages, { role: "assistant", content: reply }];

    const prices = pricedAt(provider, model);
    const turn: Turn = {
      model,
      usage,
      dollars: prices
        ? (usage.input / 1_000_000) * prices.input +
          (usage.output / 1_000_000) * prices.output
        : null,
    };

    this.#turns.push(turn);
    return turn;
  }

  /** Tokens and dollars for the session, each turn at its own model's price. */
  cost(): SessionCost {
    return {
      turns: this.#turns.length,
      input: this.#turns.reduce((total, turn) => total + turn.usage.input, 0),
      output: this.#turns.reduce((total, turn) => total + turn.usage.output, 0),
      dollars: this.#turns.reduce(
        (total, turn) => total + (turn.dollars ?? 0),
        0,
      ),
      unpriced: [
        ...new Set(
          this.#turns
            .filter((turn) => turn.dollars === null)
            .map((turn) => turn.model),
        ),
      ],
    };
  }
}
