import { normalizePkMobile } from '@/lib/phone';

export const validateName = (name: string): string | null => {
  if (!name || name.trim().length < 2) {
    return 'Name must be at least 2 characters';
  }
  if (name.trim().length > 50) {
    return 'Name must be less than 50 characters';
  }
  // Letters of any language (English, Urdu...), spaces, and . ' - as in "Abdul-Rehman" or "Ali Jr."
  if (!/^[\p{L}\p{M}\s.'’-]+$/u.test(name)) {
    return 'Name can only contain letters and spaces';
  }
  return null;
};

export const validateEmail = (email: string): string | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }
  return null;
};

export const validatePakistaniPhone = (phone: string): string | null => {
  // Same rule as the server: 0300 1234567, 0300-1234567, +92 300 1234567 and 923001234567 are all fine.
  if (!phone || !normalizePkMobile(phone)) {
    return 'Please enter a valid Pakistani mobile number (03XXXXXXXXX)';
  }
  return null;
};

export const validateAddressSelection = (
  provinceId: string,
  cityId: string,
  localityId: string
): string | null => {
  if (!provinceId) return 'Please select a province';
  if (!cityId) return 'Please select a city';
  if (!localityId) return 'Please select a locality';
  return null;
};

export const validateLandmark = (landmark: string): string | null => {
  if (landmark && landmark.length > 200) {
    return 'Landmark must be less than 200 characters';
  }
  return null;
};

export const validateAddressType = (type: string): string | null => {
  if (!type) return 'Please select an address type';
  return null;
};
