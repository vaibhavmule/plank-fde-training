import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  getConversations,
  getServerConversations,
  saveConversations,
  subscribe,
  titleFrom,
  upsert,
} from "./conversations";

const store = new Map<string, string>();

const localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ask(text: string): UIMessage {
  return {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function reply(text: string): UIMessage {
  return {
    id: "message-2",
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

describe("conversations", () => {
  test("returns nothing before anything is stored, on the server and the client", () => {
    expect(getServerConversations()).toEqual([]);
    expect(getConversations()).toEqual([]);
  });

  test("names a conversation after its first question", () => {
    expect(titleFrom([ask("  How do refunds work?  "), reply("Here…")])).toBe(
      "How do refunds work?",
    );
    expect(titleFrom([reply("No question yet")])).toBe("New chat");
  });

  test("truncates a long title", () => {
    const title = titleFrom([ask("x".repeat(90))]);
    expect(title).toHaveLength(60);
    expect(title.endsWith("…")).toBe(true);
  });

  test("upsert keeps the first title and moves the conversation to the front", () => {
    upsert("first", [ask("How do refunds work?"), reply("Here is how…")]);
    upsert("second", [ask("Where is my laptop?")]);

    expect(getConversations().map((entry) => entry.id)).toEqual([
      "second",
      "first",
    ]);

    upsert("first", [
      ask("How do refunds work?"),
      reply("Here is how…"),
      ask("And for damaged goods?"),
    ]);

    const conversations = getConversations();
    expect(conversations.map((entry) => entry.id)).toEqual(["first", "second"]);
    expect(conversations[0].title).toBe("How do refunds work?");
    expect(conversations[0].messages).toHaveLength(3);
  });

  test("keeps the same array reference while storage is unchanged", () => {
    saveConversations([
      {
        id: "one",
        title: "One",
        messages: [ask("One")],
        updatedAt: 1,
      },
    ]);

    const first = getConversations();
    expect(getConversations()).toBe(first);
  });

  test("subscribe notifies on save until it is unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    saveConversations([
      {
        id: "one",
        title: "One",
        messages: [ask("One")],
        updatedAt: 1,
      },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    saveConversations([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("ignores malformed or unexpected stored data", () => {
    store.set("workbot.conversations", "{");
    expect(getConversations()).toEqual([]);

    store.set("workbot.conversations", JSON.stringify([{ id: 1 }, "nope"]));
    expect(getConversations()).toEqual([]);
  });
});
