'use client';

import { Home, Briefcase, Store } from 'lucide-react';
import { AddressType } from '@/lib/types';

interface AddressTypeIconsProps {
  selected: AddressType;
  onChange: (type: AddressType) => void;
  error?: string;
}

const types: { value: AddressType; icon: React.ReactNode; label: string }[] = [
  { value: 'home', icon: <Home className="w-6 h-6" />, label: 'Home' },
  { value: 'office', icon: <Briefcase className="w-6 h-6" />, label: 'Office' },
  { value: 'shop', icon: <Store className="w-6 h-6" />, label: 'Shop' },
];

export default function AddressTypeIcons({ selected, onChange, error }: AddressTypeIconsProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Address Type
      </label>
      <div className="flex space-x-4">
        {types.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={`flex-1 flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all ${
              selected === type.value
                ? 'border-amber-600 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-500 hover:border-amber-300'
            }`}
          >
            <div className={`mb-2 ${selected === type.value ? 'text-amber-600' : 'text-gray-400'}`}>
              {type.icon}
            </div>
            <span className="text-sm font-medium">{type.label}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}