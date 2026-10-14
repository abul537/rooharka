// Seeds the minimum data the platform needs. Safe to run repeatedly (upserts).
// Run with:  pnpm db:seed
import 'dotenv/config'
import { db } from '../lib/db'

const SERVICES = [
  { key: 'jazzcash', name: 'JazzCash', type: 'PAYMENT' },
  { key: 'easypaisa', name: 'EasyPaisa', type: 'PAYMENT' },
  { key: 'tcs', name: 'TCS', type: 'COURIER' },
  { key: 'leopards', name: 'Leopards Courier', type: 'COURIER' },
  { key: 'postex', name: 'PostEx', type: 'COURIER' },
  { key: 'sms-otp', name: 'Phone verification via SMS', type: 'MESSAGING' },
  { key: 'whatsapp-otp', name: 'Phone verification via WhatsApp', type: 'MESSAGING' },
  { key: 'order-tracking', name: 'Customer order tracking page', type: 'FEATURE', requiresOwnCredentials: false },
] as const

// Mirrors how the current checkout form behaves (everything required except landmark).
const CHECKOUT_FIELDS = [
  { fieldKey: 'firstName', label: 'First name', required: true },
  { fieldKey: 'lastName', label: 'Last name', required: true },
  { fieldKey: 'email', label: 'Email', required: true },
  { fieldKey: 'phone', label: 'Phone number', required: true },
  { fieldKey: 'province', label: 'Province', required: true },
  { fieldKey: 'city', label: 'City', required: true },
  { fieldKey: 'locality', label: 'Locality', required: true },
  { fieldKey: 'landmark', label: 'Nearest landmark', required: false },
  { fieldKey: 'addressType', label: 'Address type', required: true },
]

async function main() {
  for (const s of SERVICES) {
    await db.serviceCatalog.upsert({
      where: { key: s.key },
      update: { name: s.name, type: s.type },
      create: { ...s },
    })
  }

  const store = await db.store.upsert({
    where: { slug: 'mppmhk' },
    update: {},
    create: {
      name: 'MPPMHK',
      slug: 'mppmhk',
      status: 'ACTIVE',
      ownerName: 'MPPMHK Owner',
      ownerEmail: 'abulkhairali7@gmail.com',
      onboardedAt: new Date(),
    },
  })

  await db.storeSettings.upsert({
    where: { storeId: store.id },
    update: {},
    create: { storeId: store.id, displayName: 'MPPMHK', currency: 'PKR' },
  })

  for (const [i, f] of CHECKOUT_FIELDS.entries()) {
    await db.checkoutField.upsert({
      where: { storeId_fieldKey: { storeId: store.id, fieldKey: f.fieldKey } },
      update: {},
      create: { storeId: store.id, sortOrder: i, enabled: true, ...f },
    })
  }

  console.log(`Seeded: ${SERVICES.length} services, store "${store.name}", ${CHECKOUT_FIELDS.length} checkout fields.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
