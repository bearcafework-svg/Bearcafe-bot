// src/features/cafe/stores/cafeSessionStore.js
// Base interface for CafeSessionStore (allows swapping with SupabaseCafeSessionStore later)

class CafeSessionStore {
  async createSession(session) {
    throw new Error("createSession must be implemented by subclass");
  }

  async getSession(sessionId) {
    throw new Error("getSession must be implemented by subclass");
  }

  async getSessionByUserId(userId) {
    throw new Error("getSessionByUserId must be implemented by subclass");
  }

  async getSessionByMessageId(messageId) {
    throw new Error("getSessionByMessageId must be implemented by subclass");
  }

  async updateSession(session) {
    throw new Error("updateSession must be implemented by subclass");
  }

  async deleteSession(sessionId) {
    throw new Error("deleteSession must be implemented by subclass");
  }
}

module.exports = { CafeSessionStore };
