'use client';

import { useState, useEffect } from 'react';
import { AddressFormData, PakistanProvince, PakistanCity, PakistanLocality } from '@/lib/types';
import {
  validateName,
  validateEmail,
  validatePakistaniPhone,
  validateAddressSelection,
  validateLandmark,
  validateAddressType,
} from '@/lib/validation';
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
  onNext: (data: AddressFormData) => void;
  initialData?: Partial<AddressFormData>;
}

export default function AddressStep({ onNext, initialData }: AddressStepProps) {
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

  const [errors, setErrors] = useState<Partial<Record<keyof AddressFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof AddressFormData, boolean>>>({});

  // Data fetching states
  const [provinces, setProvinces] = useState<PakistanProvince[]>([]);
  const [cities, setCities] = useState<PakistanCity[]>([]);
  const [localities, setLocalities] = useState<PakistanLocality[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch provinces on mount
  useEffect(() => {
    fetchList<PakistanProvince>('/api/pakistan/provinces')
      .then(data => {
        setProvinces(data);
        setLoadError(null);
        setLoadingProvinces(false);
      })
      .catch(err => {
        console.error('Failed to fetch provinces:', err);
        setLoadError('We could not load the list of provinces. Please refresh the page or try again shortly.');
        setLoadingProvinces(false);
      });
  }, []);

  // Fetch cities when province changes 
  useEffect(() => {
    if (formData.provinceId) {
      setLoadingCities(true);
      setCities([]);
      setFormData(prev => ({ ...prev, cityId: '', localityId: '' }));
      fetchList<PakistanCity>(`/api/pakistan/cities/${formData.provinceId}`)
        .then(data => {
          setCities(data);
          setLoadError(null);
          setLoadingCities(false);
        })
        .catch(err => {
          console.error('Failed to fetch cities:', err);
          setLoadError('We could not load the cities. Please try again.');
          setLoadingCities(false);
        });
    } else {
      setCities([]);
    }
  }, [formData.provinceId]);

  // Fetch localities when city changes
  useEffect(() => {
    if (formData.cityId) {
      setLoadingLocalities(true);
      setLocalities([]);
      setFormData(prev => ({ ...prev, localityId: '' }));
      fetchList<PakistanLocality>(`/api/pakistan/localities/${formData.cityId}`)
        .then(data => {
          setLocalities(data);
          setLoadError(null);
          setLoadingLocalities(false);
        })
        .catch(err => {
          console.error('Failed to fetch localities:', err);
          setLoadError('We could not load the localities. Please try again.');
          setLoadingLocalities(false);
        });
    } else {
      setLocalities([]);
    }
  }, [formData.cityId]);

  const handleChange = (
    field: keyof AddressFormData,
    value: string | AddressFormData['addressType']
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
    // Clear error for that field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateField = (field: keyof AddressFormData): string | undefined => {
    const value = formData[field];
    switch (field) {
      case 'firstName':
      case 'lastName':
        return validateName(value as string) || undefined;
      case 'email':
        return validateEmail(value as string) || undefined;
      case 'phone':
        return validatePakistaniPhone(value as string) || undefined;
      case 'provinceId':
      case 'cityId':
      case 'localityId':
        if (!value) return `Please select ${field.replace('Id', '')}`;
        return undefined;
      case 'landmark':
        return validateLandmark(value as string) || undefined;
      case 'addressType':
        return validateAddressType(value as string) || undefined;
      default:
        return undefined;
    }
  };

  const validateForm = (): boolean => {
    const fieldsToValidate: (keyof AddressFormData)[] = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'provinceId',
      'cityId',
      'localityId',
      'addressType',
    ];
    const newErrors: Partial<Record<keyof AddressFormData, string>> = {};
    fieldsToValidate.forEach(field => {
      const error = validateField(field);
      if (error) newErrors[field] = error;
    });
    // landmark is optional, but if present, validate length
    if (formData.landmark) {
      const landmarkError = validateField('landmark');
      if (landmarkError) newErrors.landmark = landmarkError;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mark all fields as touched to show errors
    const allFields: (keyof AddressFormData)[] = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'provinceId',
      'cityId',
      'localityId',
      'addressType',
    ];
    const touchedAll = allFields.reduce((acc, field) => ({ ...acc, [field]: true }), {});
    setTouched(touchedAll);
    if (validateForm()) {
      onNext(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="firstName"
            value={formData.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, firstName: true }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              touched.firstName && errors.firstName ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="John"
          />
          {touched.firstName && <ValidationMessage message={errors.firstName} />}
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="lastName"
            value={formData.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, lastName: true }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              touched.lastName && errors.lastName ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Doe"
          />
          {touched.lastName && <ValidationMessage message={errors.lastName} />}
        </div>
      </div>

      {/* Email and Phone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              touched.email && errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="john@example.com"
          />
          {touched.email && <ValidationMessage message={errors.email} />}
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Mobile Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="phone"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              touched.phone && errors.phone ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="03001234567"
          />
          {touched.phone && <ValidationMessage message={errors.phone} />}
        </div>
      </div>

      {loadError && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {loadError}
        </p>
      )}

      {/* Province Dropdown */}
      <div>
        <label htmlFor="province" className="block text-sm font-medium text-gray-700 mb-1">
          Province <span className="text-red-500">*</span>
        </label>
        <select
          id="province"
          value={formData.provinceId}
          onChange={(e) => handleChange('provinceId', e.target.value)}
          onBlur={() => setTouched(prev => ({ ...prev, provinceId: true }))}
          disabled={loadingProvinces}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
            touched.provinceId && errors.provinceId ? 'border-red-500' : 'border-gray-300'
          } ${loadingProvinces ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">Select Province</option>
          {provinces.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {touched.provinceId && <ValidationMessage message={errors.provinceId} />}
      </div>

      {/* City Dropdown */}
      <div>
        <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
          City <span className="text-red-500">*</span>
        </label>
        <select
          id="city"
          value={formData.cityId}
          onChange={(e) => handleChange('cityId', e.target.value)}
          onBlur={() => setTouched(prev => ({ ...prev, cityId: true }))}
          disabled={!formData.provinceId || loadingCities}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
            touched.cityId && errors.cityId ? 'border-red-500' : 'border-gray-300'
          } ${!formData.provinceId || loadingCities ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">Select City</option>
          {cities.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {touched.cityId && <ValidationMessage message={errors.cityId} />}
      </div>

      {/* Locality Dropdown */}
      <div>
        <label htmlFor="locality" className="block text-sm font-medium text-gray-700 mb-1">
          Locality <span className="text-red-500">*</span>
        </label>
        <select
          id="locality"
          value={formData.localityId}
          onChange={(e) => handleChange('localityId', e.target.value)}
          onBlur={() => setTouched(prev => ({ ...prev, localityId: true }))}
          disabled={!formData.cityId || loadingLocalities}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
            touched.localityId && errors.localityId ? 'border-red-500' : 'border-gray-300'
          } ${!formData.cityId || loadingLocalities ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">Select Locality</option>
          {localities.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {touched.localityId && <ValidationMessage message={errors.localityId} />}
      </div>

      {/* Landmark / Street / House No */}
      <div>
        <label htmlFor="landmark" className="block text-sm font-medium text-gray-700 mb-1">
          Landmark / House No, Street, Block (optional)
        </label>
        <textarea
          id="landmark"
          rows={3}
          value={formData.landmark}
          onChange={(e) => handleChange('landmark', e.target.value)}
          onBlur={() => setTouched(prev => ({ ...prev, landmark: true }))}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
            touched.landmark && errors.landmark ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="e.g., Near Johar Chowrangi, House #45, Street #8"
        />
        {touched.landmark && <ValidationMessage message={errors.landmark} />}
        <p className="mt-1 text-xs text-gray-500">
          Maximum 200 characters. This will be appended to your full address.
        </p>
      </div>

      {/* Address Type Icons */}
      <AddressTypeIcons
        selected={formData.addressType}
        onChange={(type) => handleChange('addressType', type)}
        error={touched.addressType ? errors.addressType : undefined}
      />

      {/* Full address preview */}
      <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-4 rounded-lg border border-amber-200">
        <p className="text-sm text-gray-600">Your full address will be:</p>
        <p className="font-medium text-gray-800">
          {formData.addressType.charAt(0).toUpperCase() + formData.addressType.slice(1)}:{' '}
          {provinces.find(p => p.id === formData.provinceId)?.name || '[Province]'} /{' '}
          {cities.find(c => c.id === formData.cityId)?.name || '[City]'} /{' '}
          {localities.find(l => l.id === formData.localityId)?.name || '[Locality]'} /{' '}
          {formData.landmark || '[Landmark]'}
        </p>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          className="bg-gradient-to-r from-amber-600 to-amber-800 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:shadow-xl transition-all duration-300"
        >
          Proceed to Payment
        </button>
      </div>
    </form>
  );
}