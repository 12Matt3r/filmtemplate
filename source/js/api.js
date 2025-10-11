// api.js
import { uid } from './utils.js';

export class AISession {
  async generateOutline({ title, logline, type, episodes = 8 }, { signal } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (type === "film") {
          resolve([
            `ACT I — Inciting: ${title} disrupts normalcy.`,
            `ACT II — Complication: Stakes escalate; midpoint reversal.`,
            `ACT III — Resolution: Inevitable but unexpected payoff.`,
          ]);
        } else {
          const eps = Math.max(3, Math.min(episodes, 24));
          resolve(Array.from({ length: eps }, (_, i) =>
            `Ep ${i + 1}: ${logline.slice(0, 80)} … complication ${i + 1}`
          ));
        }
      }, 60);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}