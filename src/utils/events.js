// src/utils/events.js
/**
 * Simple event system to communicate between different parts of the app
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return () => this.remove(event, listener);
  }

  emit(event, ...args) {
    if (!this.events[event]) {
      return;
    }
    this.events[event].forEach(listener => {
      listener(...args);
    });
  }

  remove(event, listenerToRemove) {
    if (!this.events[event]) {
      return;
    }
    this.events[event] = this.events[event].filter(listener => listener !== listenerToRemove);
  }
}

export const appEvents = new EventEmitter();

// Define constants for event types
export const APP_EVENTS = {
  SIGN_OUT: 'signOut',
};

export default appEvents;