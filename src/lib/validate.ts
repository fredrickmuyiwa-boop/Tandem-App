// Minimal schema validation, shared by forms and the service layer.
// Every service validates its own input — the UI's validation is a convenience.

import { AppError } from './errors';

/** Field-level validation failure. Same class family as every other backend error. */
export class ValidationError extends AppError {
  constructor(fields: Record<string, string>) {
    super('validation', Object.values(fields)[0] || 'Invalid input', fields);
    this.name = 'ValidationError';
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Rule = (v: unknown) => string | null;

export const rules = {
  required: (label: string): Rule => (v) => (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) ? `${label} is required.` : null),
  email: (): Rule => (v) => (typeof v === 'string' && EMAIL_RE.test(v) ? null : 'Enter a valid email address.'),
  min: (label: string, n: number): Rule => (v) => (typeof v === 'number' && v >= n ? null : `${label} must be at least ${n}.`),
  max: (label: string, n: number): Rule => (v) => (typeof v === 'number' && v <= n ? null : `${label} must be at most ${n}.`),
  minLen: (label: string, n: number): Rule => (v) => (typeof v === 'string' && v.trim().length >= n ? null : `${label} must be at least ${n} characters.`),
  maxLen: (label: string, n: number): Rule => (v) => (typeof v !== 'string' || v.length <= n ? null : `${label} must be ${n} characters or fewer.`),
  oneOf: <T>(label: string, values: readonly T[]): Rule => (v) => (values.includes(v as T) ? null : `Choose a valid ${label.toLowerCase()}.`),
  password: (): Rule => (v) => {
    if (typeof v !== 'string' || v.length < 10) return 'Use at least 10 characters.';
    if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Use a mix of letters and numbers.';
    return null;
  },
  date: (label: string): Rule => (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? null : `${label} must be a valid date.`),
};

export function check(values: Record<string, unknown>, schema: Record<string, Rule[]>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, list] of Object.entries(schema)) {
    for (const rule of list) {
      const msg = rule(values[key]);
      if (msg) {
        errors[key] = msg;
        break;
      }
    }
  }
  return errors;
}

export function assertValid(values: Record<string, unknown>, schema: Record<string, Rule[]>): void {
  const errors = check(values, schema);
  if (Object.keys(errors).length) throw new ValidationError(errors);
}
