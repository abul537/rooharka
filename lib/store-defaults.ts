/** What every new store starts with. One list, used by the seed script and by sign-up, so they can never drift apart. */
export const CHECKOUT_FIELD_DEFAULTS = [
  { fieldKey: 'firstName', label: 'First name', required: true },
  { fieldKey: 'lastName', label: 'Last name', required: true },
  { fieldKey: 'email', label: 'Email', required: true },
  { fieldKey: 'phone', label: 'Phone number', required: true },
  { fieldKey: 'province', label: 'Province', required: true },
  { fieldKey: 'city', label: 'City', required: true },
  { fieldKey: 'locality', label: 'Locality', required: true },
  { fieldKey: 'landmark', label: 'Nearest landmark', required: false },
  { fieldKey: 'addressType', label: 'Address type', required: true },
] as const
