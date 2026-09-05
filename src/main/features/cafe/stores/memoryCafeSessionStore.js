// src/features/cafe/stores/memoryCafeSessionStore.js
// In-memory implementation of CafeSessionStore

const { CafeSessionStore } = require("./cafeSessionStore");

class MemoryCafeSessionStore extends CafeSessionStore {
  constructor() {
    super();
    // Primary storage: sessionId -> CafeSession
    this.sessions = new Map();
    // Index: userId -> sessionId
    this.userIndex = new Map();
    // Index: messageId -> sessionId
    this.messageIndex = new Map();

    // Auto-cleanup expired sessions every 10 minutes (TTL: 30 minutes)
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 10 * 60 * 1000);
  }

  async createSession(session) {
    if (!session || !session.sessionId) {
      throw new Error("Invalid session object");
    }
    this.sessions.set(session.sessionId, session);
    if (session.userId) {
      this.userIndex.set(session.userId, session.sessionId);
    }
    if (session.messageId) {
      this.messageIndex.set(session.messageId, session.sessionId);
    }
    return session;
  }

  async getSession(sessionId) {
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  async getSessionByUserId(userId) {
    if (!userId) return null;
    const sessionId = this.userIndex.get(userId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  async getSessionByMessageId(messageId) {
    if (!messageId) return null;
    const sessionId = this.messageIndex.get(messageId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  async updateSession(session) {
    if (!session || !session.sessionId) {
      throw new Error("Invalid session object for update");
    }
    session.updatedAt = Date.now();
    this.sessions.set(session.sessionId, session);
    if (session.userId) {
      this.userIndex.set(session.userId, session.sessionId);
    }
    if (session.messageId) {
      this.messageIndex.set(session.messageId, session.sessionId);
    }
    return session;
  }

  async deleteSession(sessionId) {
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.userId) this.userIndex.delete(session.userId);
      if (session.messageId) this.messageIndex.delete(session.messageId);
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  cleanupExpired() {
    const now = Date.now();
    const ttlMs = 30 * 60 * 1000; // 30 minutes TTL
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActive = session.updatedAt || session.createdAt || 0;
      if (now - lastActive > ttlMs) {
        this.deleteSession(sessionId);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = { MemoryCafeSessionStore };
