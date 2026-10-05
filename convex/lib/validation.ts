import { ConvexError } from "convex/values";

const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ConvexError("El email no es válido");
  }
  return value;
}

export const PHONE_FORMAT_ERROR =
  "El teléfono debe estar en formato internacional, por ejemplo +34600111222";

const compactPhone = (phone: string) => phone.replace(/[\s\-().]/g, "");

/** The reason a phone can't be saved, or null (an empty phone is fine). Also used by forms. */
export function phoneError(phone: string): string | null {
  const compact = compactPhone(phone);
  return compact === "" || E164.test(compact) ? null : PHONE_FORMAT_ERROR;
}

/** Returns the phone in E.164 or undefined when empty; throws when invalid. */
export function normalizePhone(phone: string | undefined): string | undefined {
  if (phone === undefined) return undefined;
  const error = phoneError(phone);
  if (error) throw new ConvexError(error);
  return compactPhone(phone) || undefined;
}

export function requireName(name: string): string {
  const value = name.trim();
  if (value.length < 1 || value.length > 80) {
    throw new ConvexError("El nombre debe tener entre 1 y 80 caracteres");
  }
  return value;
}

export function requirePassword(password: string): string {
  if (password.length < 8 || password.length > 128) {
    throw new ConvexError("La contraseña debe tener al menos 8 caracteres");
  }
  return password;
}
