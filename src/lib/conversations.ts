import type { UIMessage } from "ai";

export type Conversation = {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
};

const STORAGE_KEY = "workbot.conversations";
const TITLE_LIMIT = 60;

// The server render and the browser's first render must agree, so both start
// from this same constant empty list. The stored list arrives after hydration.
const SERVER_CONVERSATIONS: Conversation[] = [];

const listeners = new Set<() => void>();

// Cached by the raw storage string: unchanged data keeps the same array
// reference, so useSyncExternalStore does not re-render.
let cachedRaw: string | null = null;
let cached: Conversation[] = SERVER_CONVERSATIONS;

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.messages) &&
    typeof candidate.updatedAt === "number"
  );
}

function parse(raw: string | null): Conversation[] {
  if (!raw) return SERVER_CONVERSATIONS;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SERVER_CONVERSATIONS;
    return parsed.filter(isConversation);
  } catch {
    return SERVER_CONVERSATIONS;
  }
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

/** A conversation is named after the first question asked in it. */
export function titleFrom(messages: UIMessage[]) {
  const question = messages.find((message) => message.role === "user");
  const text = question ? messageText(question) : "";
  if (!text) return "New chat";
  return text.length > TITLE_LIMIT
    ? `${text.slice(0, TITLE_LIMIT - 1)}…`
    : text;
}

/** Reads the list, re-parsing only when localStorage has changed. */
export function getConversations(): Conversation[] {
  if (typeof window === "undefined") return SERVER_CONVERSATIONS;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    cachedRaw = null;
    cached = SERVER_CONVERSATIONS;
    return SERVER_CONVERSATIONS;
  }

  if (raw === cachedRaw) return cached;

  cachedRaw = raw;
  cached = parse(raw);
  return cached;
}

/** The server snapshot is always empty, so hydration starts in agreement. */
export function getServerConversations(): Conversation[] {
  return SERVER_CONVERSATIONS;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function saveConversations(conversations: Conversation[]) {
  if (typeof window === "undefined") return;

  const raw = JSON.stringify(conversations);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cached = conversations;

  for (const listener of listeners) listener();
}

/**
 * Saves a conversation and moves it to the front. An existing conversation
 * keeps the title it was given by its first question.
 */
export function upsert(id: string, messages: UIMessage[]) {
  const conversations = getConversations();
  const existing = conversations.find((conversation) => conversation.id === id);

  const conversation: Conversation = {
    id,
    title: existing?.title || titleFrom(messages),
    messages,
    updatedAt: Date.now(),
  };

  saveConversations([
    conversation,
    ...conversations.filter((entry) => entry.id !== id),
  ]);
}
