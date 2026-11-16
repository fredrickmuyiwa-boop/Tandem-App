export const config = {
  /** Simulated network latency so loading states are realistic. 0 in tests. */
  latencyMs: typeof window === 'undefined' ? 0 : 140,
  sessionHours: 12,
  maxLoginFailures: 5,
  lockMinutes: 5,
};

export const latency = () => (config.latencyMs ? new Promise((r) => setTimeout(r, config.latencyMs)) : Promise.resolve());
