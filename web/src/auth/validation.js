export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email) {
  if (!email.trim()) return 'Email is required.';
  if (!emailPattern.test(email.trim())) return 'Enter a valid email address.';
  return '';
}

/** Same rules as the server: 8+ characters with at least one letter and one number. */
export function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'Use 128 characters or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return '';
}

/** Reads the name and email from a Google ID token (display only; the server checks the token). */
export function googleProfile(credential) {
  try {
    const part = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(part).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const p = JSON.parse(json);
    return { email: p.email ?? '', name: p.name ?? '' };
  } catch { return { email: '', name: '' }; }
}
