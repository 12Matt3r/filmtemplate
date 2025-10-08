// api.js
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class AISession {
  #aborted = false;
  abort() { this.#aborted = true; }

  async generateOutline({ title, logline, type, episodes = 8 }) {
    await sleep(600); if (this.#aborted) throw new Error("aborted");
    if (!title?.trim()) return "Give me a title and logline.";
    if (type === "film") {
      return [
        `ACT I — Inciting: ${title} disrupts normalcy.`,
        `ACT II — Complication: Stakes escalate; midpoint reversal.`,
        `ACT III — Resolution: Inevitable but unexpected payoff.`,
      ].join("\n");
    }
    // Series outline
    const eps = Math.max(3, Math.min(episodes, 24));
    return Array.from({ length: eps }, (_, i) =>
      `Ep ${i + 1}: ${logline.slice(0, 80)} … complication ${i + 1}`
    ).join("\n");
  }
}