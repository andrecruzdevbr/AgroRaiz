/** Brazilian phone helpers for display and input. */

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatPhoneInput(value: string): string {
  const d = digitsOnly(value)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

export function toE164BR(value: string): string {
  const d = digitsOnly(value)
  if (!d) return ''
  if (d.startsWith('55') && d.length >= 12) return `+${d}`
  if (d.length >= 10) return `+55${d}`
  return value
}

export function isValidBRPhone(value: string): boolean {
  const d = digitsOnly(toE164BR(value))
  return d.startsWith('55') && d.length >= 12
}
