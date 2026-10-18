'use client';

import { useEffect, useState } from 'react';
import { AddressFormData, PakistanProvince, PakistanCity, PakistanLocality } from '@/lib/types';
import {
  validateName,
  validateEmail,
  validatePakistaniPhone,
  validateLandmark,
} from '@/lib/validation';
import type { CheckoutFields } from '@/lib/data/checkout';
import AddressTypeIcons from '@/components/checkout/addressTypeIcon';
import ValidationMessage from '@/components/checkout/validationMessage';

// Loads a list from our API and fails loudly (instead of crashing the form) if the
// server returned an error object, e.g. when the database connection is not configured.
async function fetchList<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error(`${url} returned unexpected data`);
  return data as T[];
}

interface AddressStepProps {
  /** Which fields to show and which are required: controlled from the store's dashboard settings. */
  fields: CheckoutFields;
  onNext: (data: AddressFormData) => void;
  initialData?: Partial<AddressFormData>;
  /** Field errors reported by the server (shown under the matching input). */
  serverErrors?: Partial<Record<string, string>>;
}

type Errors = Partial<Record<keyof AddressFormData, string>>;

const inputClass = (hasError: boolean) =>
  `w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
    hasError ? 'border-red-500' : 'border-gray-300'
  }`;

const selectClass = (hasError: boolean, disabled: boolean) =>
  `${inputClass(hasError)} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

export default function AddressStep({ fields, onNext, initialData, serverErrors }: AddressStepProps) {
  const [formData, setFormData] = useState<AddressFormData>({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    provinceId: initialData?.provinceId || '',
    cityId: initialData?.cityId || '',
    localityId: initialData?.localityId || '',
    landmark: initialData?.landmark || '',
    addressType: initialData?.addressType || 'home',
  });

  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof AddressFormData, boolean>>>({});

  const [provinces, setProvinces] = useState<PakistanProvince[]>([]);
  const [cities, setCities] = useState<PakistanCity[]>([]);
  const [localities, setLocalities] = useState<PakistanLocality[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Provinces on mount
  useEffect(() => {
    fetchList<PakistanProvince>('/api/pakistan/provinces')
      .then((data) => {
        setProvinces(data);
        setLoadError(null);
      })
      .catch((err) => {
        console.error('Failed to fetch provinces:', err);
        setLoadError('We could not load the list of provinces. Please refresh the page or try again shortly.');
      })
      .finally(() => setLoadingProvinces(false));
  }, []);

  // Cities when the province changes
  useEffect(() => {
    if (!formData.provinceId) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    setCities([]);
    fetchList<PakistanCity>(`/api/pakistan/cities/${formData.provinceId}`)
      .then((data) => {
        setCities(data);
        setLoadError(null);
      })
      .catch((err) => {
        console.error('Failed to fetch cities:', err);
        setLoadError('We could not load the cities. Please try again.');
      })
      .finally(() => setLoadingCities(false));
  }, [formData.provinceId]);

  // Localities when the city changes
  useEffect(() => {
    if (!formData.cityId) {
      setLocalities([]);
      return;
    }
    setLoadingLocalities(true);
    setLocalities([]);
    fetchList<PakistanLocality>(`/api/pakistan/localities/${formData.cityId}`)
      .then((data) => {
        setLocalities(data);
        setLoadError(null);
      })
      .catch((err) => {
        console.error('Failed to fetch localities:', err);
        setLoadError('We could not load the localities. Please try again.');
      })
      .finally(() => setLoadingLocalities(false));
  }, [formData.cityId]);

  const handleChange = <K extends keyof AddressFormData>(field: K, value: AddressFormData[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Choosing a new province/city clears everything below it.
      if (field === 'provinceId') {
        next.cityId = '';
        next.localityId = '';
      }
      if (field === 'cityId') next.localityId = '';
      return next;
    });
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const markTouched = (field: keyof AddressFormData) => setTouched((prev) => ({ ...prev, [field]: true }));

  // Same rules the server applies: required/optional comes from the store's settings.
  const validateField = (field: keyof AddressFormData): string | undefined => {
    const value = formData[field] as string;
    switch (field) {
      case 'firstName':
        return validateName(value) || undefined;
      case 'lastName':
        if (!fields.lastName.enabled || (!fields.lastName.required && !value)) return undefined;
        return validateName(value) || undefined;
      case 'email':
        if (!fields.email.enabled || (!fields.email.required && !value)) return undefined;
        return validateEmail(value) || undefined;
      case 'phone':
        return validatePakistaniPhone(value) || undefined;
      case 'provinceId':
        return value ? undefined : 'Please select a province';
      case 'cityId':
        return value ? undefined : 'Please select a city';
      case 'localityId':
        return value ? undefined : 'Please select a locality';
      case 'landmark':
        if (!fields.landmark.enabled) return undefined;
        if (fields.landmark.required && !value.trim()) return 'Please enter your street / landmark';
        return validateLandmark(value) || undefined;
      default:
        return undefined;
    }
  };

  const allFields: (keyof AddressFormData)[] = [
    'firstName', 'lastName', 'email', 'phone', 'provinceId', 'cityId', 'localityId', 'landmark',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Errors = {};
    for (const f of allFields) {
      const error = validateField(f);
      if (error) newErrors[f] = error;
    }
    setErrors(newErrors);
    setTouched(allFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));
    if (Object.keys(newErrors).length === 0) onNext(formData);
  };

  // Errors from the server (e.g. a rule changed while the customer was typing) appear too.
  const errorFor = (field: keyof AddressFormData, serverKey: string) =>
    (touched[field] ? errors[field] : undefined) ?? serverErrors?.[serverKey];

  const Label = ({ htmlFor, text, required }: { htmlFor: string; text: string; required: boolean }) => (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {text} {required ? <span className="text-red-500" aria-hidden>*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
    </label>
  );

  const showName2 = fields.lastName.enabled;
  const showEmail = fields.email.enabled;
  const provinceName = provinces.find((p) => p.id === formData.provinceId)?.name || '[Province]';
  const cityName = cities.find((c) => c.id === formData.cityId)?.name || '[City]';
  const localityName = localities.find((l) => l.id === formData.localityId)?.name || '[Locality]';

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Name */}
      <div className={`grid grid-cols-1 gap-4 ${showName2 ? 'md:grid-cols-2' : ''}`}>
        <div>
          <Label htmlFor="firstName" text={fields.firstName.label} required />
          <input id="firstName" type="text" autoComplete="given-name" value={formData.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)} onBlur={() => markTouched('firstName')}
            className={inputClass(!!errorFor('firstName', 'firstName'))} placeholder="Ali" />
          <ValidationMessage message={errorFor('firstName', 'firstName')} />
        </div>
        {showName2 && (
          <div>
            <Label htmlFor="lastName" text={fields.lastName.label} required={fields.lastName.required} />
            <input id="lastName" type="text" autoComplete="family-name" value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)} onBlur={() => markTouched('lastName')}
              className={inputClass(!!errorFor('lastName', 'lastName'))} placeholder="Raza" />
            <ValidationMessage message={errorFor('lastName', 'lastName')} />
          </div>
        )}
      </div>

      {/* Phone + email */}
      <div className={`grid grid-cols-1 gap-4 ${showEmail ? 'md:grid-cols-2' : ''}`}>
        {showEmail && (
          <div>
            <Label htmlFor="email" text={fields.email.label} required={fields.email.required} />
            <input id="email" type="email" autoComplete="email" value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)} onBlur={() => markTouched('email')}
              className={inputClass(!!errorFor('email', 'email'))} placeholder="ali@example.com" />
            <ValidationMessage message={errorFor('email', 'email')} />
          </div>
        )}
        <div>
          <Label htmlFor="phone" text={fields.phone.label} required />
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)} onBlur={() => markTouched('phone')}
            className={inputClass(!!errorFor('phone', 'phone'))} placeholder="03001234567" />
          <ValidationMessage message={errorFor('phone', 'phone')} />
        </div>
      </div>

      {loadError && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{loadError}</p>
      )}

      {/* Province */}
      <div>
        <Label htmlFor="province" text={fields.province.label} required />
        <select id="province" value={formData.provinceId} disabled={loadingProvinces}
          onChange={(e) => handleChange('provinceId', e.target.value)} onBlur={() => markTouched('provinceId')}
          className={selectClass(!!errorFor('provinceId', 'province'), loadingProvinces)}>
          <option value="">{loadingProvinces ? 'Loading…' : 'Select Province'}</option>
          {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ValidationMessage message={errorFor('provinceId', 'province')} />
      </div>

      {/* City */}
      <div>
        <Label htmlFor="city" text={fields.city.label} required />
        <select id="city" value={formData.cityId} disabled={!formData.provinceId || loadingCities}
          onChange={(e) => handleChange('cityId', e.target.value)} onBlur={() => markTouched('cityId')}
          className={selectClass(!!errorFor('cityId', 'city'), !formData.provinceId || loadingCities)}>
          <option value="">{loadingCities ? 'Loading…' : 'Select City'}</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <ValidationMessage message={errorFor('cityId', 'city')} />
      </div>

      {/* Locality */}
      <div>
        <Label htmlFor="locality" text={fields.locality.label} required />
        <select id="locality" value={formData.localityId} disabled={!formData.cityId || loadingLocalities}
          onChange={(e) => handleChange('localityId', e.target.value)} onBlur={() => markTouched('localityId')}
          className={selectClass(!!errorFor('localityId', 'locality'), !formData.cityId || loadingLocalities)}>
          <option value="">{loadingLocalities ? 'Loading…' : 'Select Locality'}</option>
          {localities.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <ValidationMessage message={errorFor('localityId', 'locality')} />
      </div>

      {/* Landmark */}
      {fields.landmark.enabled && (
        <div>
          <Label htmlFor="landmark" text={fields.landmark.label} required={fields.landmark.required} />
          <textarea id="landmark" rows={3} value={formData.landmark}
            onChange={(e) => handleChange('landmark', e.target.value)} onBlur={() => markTouched('landmark')}
            className={inputClass(!!errorFor('landmark', 'landmark'))}
            placeholder="e.g., Near Johar Chowrangi, House #45, Street #8" />
          <ValidationMessage message={errorFor('landmark', 'landmark')} />
          <p className="mt-1 text-xs text-gray-500">Maximum 200 characters. This will be added to your full address.</p>
        </div>
      )}

      {fields.addressType.enabled && (
        <AddressTypeIcons selected={formData.addressType} onChange={(t) => handleChange('addressType', t)} error={serverErrors?.addressType} />
      )}

      {/* Address preview */}
      <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-4 rounded-lg border border-amber-200">
        <p className="text-sm text-gray-600">Your full address will be:</p>
        <p className="font-medium text-gray-800">
          {fields.addressType.enabled && <>{formData.addressType.charAt(0).toUpperCase() + formData.addressType.slice(1)}: </>}
          {provinceName} / {cityName} / {localityName}
          {fields.landmark.enabled && <> / {formData.landmark || '[Landmark]'}</>}
        </p>
      </div>

      <div className="flex justify-end">
        <button type="submit"
          className="bg-gradient-to-r from-amber-600 to-amber-800 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:shadow-xl transition-all duration-300">
          Proceed to Payment
        </button>
      </div>
    </form>
  );
}
