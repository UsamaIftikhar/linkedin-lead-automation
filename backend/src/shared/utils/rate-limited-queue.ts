const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimitedQueue {
  private nextAvailableAt = 0;

  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

  add<T>(task: () => Promise<T>): Promise<T> {
    const runTask = async () => {
      const waitMs = Math.max(0, this.nextAvailableAt - Date.now());

      if (waitMs > 0) {
        await sleep(waitMs);
      }

      this.nextAvailableAt = Date.now() + this.minIntervalMs;

      return task();
    };

    const result = this.tail.then(runTask, runTask);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}
