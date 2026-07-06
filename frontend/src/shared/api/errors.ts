export class FetchError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`HTTP ${status}`);
    this.name = "FetchError";
    this.status = status;
    this.data = data;
  }
}
