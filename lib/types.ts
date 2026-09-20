export type AddressType = 'home' | 'office' | 'shop';

export interface AddressFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  provinceId: string;
  cityId: string;
  localityId: string;
  landmark: string;
  addressType: AddressType;
}

export interface PakistanProvince {
  id: string;
  name: string;
}

export interface PakistanCity {
  id: string;
  name: string;
  provinceId: string;
}

export interface PakistanLocality {
  id: string;
  name: string;
  cityId: string;
  postalCode?: string;
}