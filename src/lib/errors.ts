export type ErrorCode = 'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'rate_limited' | 'plan_limit' | 'suspended' | 'network';

export class AppError extends Error {
  code: ErrorCode;
  fields?: Record<string, string>;
  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}

export const forbidden = (msg = 'You do not have permission to do that.') => new AppError('forbidden', msg);
export const notFound = (what = 'Item') => new AppError('not_found', `${what} not found.`);
export const conflict = (msg: string) => new AppError('conflict', msg);
