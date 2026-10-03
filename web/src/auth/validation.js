export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  if (!email.trim()) return 'Email is required.';
  if (!emailPattern.test(email.trim())) return 'Enter a valid email address.';
  return '';
}
