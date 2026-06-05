/**
 * Shared validation utilities for AutoCashier apps.
 * Used across admin, kasir, and member frontends and backend.
 */

/**
 * Validate that a value is not empty (not null, undefined, or blank string).
 */
export function isRequired(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  if (!email || !email.trim()) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate an Indonesian phone number (WhatsApp format).
 * Accepts formats: 08xx, +628xx, 628xx
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || !phone.trim()) return false;
  const cleaned = phone.replace(/[\s\-()]/g, '');
  // Indonesian phone: starts with 08, +62, or 62, followed by 8-13 digits
  const phoneRegex = /^(\+62|62|0)8[1-9]\d{6,10}$/;
  return phoneRegex.test(cleaned);
}

/**
 * Validate minimum string length.
 */
export function hasMinLength(value: string, min: number): boolean {
  return typeof value === 'string' && value.trim().length >= min;
}

/**
 * Validate maximum string length.
 */
export function hasMaxLength(value: string, max: number): boolean {
  return typeof value === 'string' && value.trim().length <= max;
}

/**
 * Validate that a number is positive (greater than 0).
 */
export function isPositiveNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

/**
 * Validate that a number is non-negative (>= 0).
 */
export function isNonNegativeNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

/**
 * Validate a username (alphanumeric, underscores, 3-30 chars).
 */
export function isValidUsername(username: string): boolean {
  if (!username || !username.trim()) return false;
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username.trim());
}

/**
 * Validate password strength (minimum 6 characters).
 */
export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6;
}

/**
 * Validate a SKU format (alphanumeric with dashes, 2-50 chars).
 */
export function isValidSku(sku: string): boolean {
  if (!sku || !sku.trim()) return false;
  const skuRegex = /^[a-zA-Z0-9\-]{2,50}$/;
  return skuRegex.test(sku.trim());
}

/**
 * Result of a field validation.
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validate multiple required fields at once.
 * Returns the first validation error found, or a success result.
 */
export function validateRequiredFields(
  fields: Record<string, unknown>
): ValidationResult {
  for (const [name, value] of Object.entries(fields)) {
    if (!isRequired(value)) {
      return { valid: false, message: `${name} wajib diisi` };
    }
  }
  return { valid: true };
}
