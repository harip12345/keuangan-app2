export const ADMIN_GOOGLE_EMAIL = 'haripamungkas519@gmail.com';

export function isAdminUser(claims) {
  return claims?.email?.toLowerCase() === ADMIN_GOOGLE_EMAIL
    && claims.email_verified === true
    && claims.firebase?.sign_in_provider === 'google.com';
}
