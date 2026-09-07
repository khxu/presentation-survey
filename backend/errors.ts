export class RequestError extends Error {
  constructor(message: string, public status: 400 | 403 | 404 | 409) {
    super(message);
  }
}
