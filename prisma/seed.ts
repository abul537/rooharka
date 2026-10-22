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


// ---------------------------------------------------------------------------
// Product content (moved out of the old hard-coded page).
// !! PRICES AND STOCK BELOW ARE PLACEHOLDERS. Set your real values in the
// !! dashboard (or `pnpm db:studio`) before going live.
// ---------------------------------------------------------------------------
const li = (...texts: string[]) => texts.map((text) => ({ text }))

async function seedProduct(storeId: string) {
  const product = await db.product.upsert({
    where: { storeId_slug: { storeId, slug: 'darwaish-sacred-oil' } },
    update: {},
    create: {
      storeId,
      slug: 'darwaish-sacred-oil',
      name: 'Darwaish® Sacred Oil',
      subtitle: 'Sacred Oil for Muscle Revival',
      shortDescription:
        'A deeply therapeutic oil blend crafted using an ancient formula passed down from master to disciple. Darwaish stimulates blood flow, revives stiff or inactive muscle tissue, and restores fluid motion to the body.',
      description:
        'Darwaish® is a deeply therapeutic oil blend crafted using an ancient formula passed down from master to disciple through generations of healing tradition. This sacred formula represents centuries of accumulated wisdom about natural healing and muscle revival.\n\nRooted in Sufi healing traditions, Darwaish combines precise ratios of traditional herbs and essential oils with deep spiritual intention. Each ingredient is selected not only for its physical healing properties but also for its energetic qualities that work in harmony with the body\'s natural rhythms.',
      status: 'ACTIVE',
      isFeatured: true,
      seoTitle: 'Darwaish® Sacred Oil for Muscle Revival',
      seoDescription:
        'Ancient herbal oil formula for muscle revival and joint flexibility. Order online with delivery across Pakistan.',
    },
  })

  const variants = [
    { sku: 'DW-30', label: '30ml', badge: 'Trial Size', price: 1500, compareAtPrice: null, isDefault: false, sortOrder: 0 },
    { sku: 'DW-100', label: '100ml', badge: 'Most Popular', price: 2500, compareAtPrice: 3200, isDefault: true, sortOrder: 1 },
    { sku: 'DW-200', label: '200ml', badge: 'Best Value', price: 4200, compareAtPrice: 5200, isDefault: false, sortOrder: 2 },
  ]
  for (const v of variants) {
    await db.productVariant.upsert({
      where: { productId_sku: { productId: product.id, sku: v.sku } },
      update: {}, // never overwrite prices/stock you edited later
      create: { productId: product.id, stock: 100, trackStock: true, ...v },
    })
  }

  // Starter copy is added only while the product has no sections, so running the seed again never wipes
  // what the store owner edited in the admin.
  if ((await db.productSection.count({ where: { productId: product.id } })) > 0) return
  await db.productSection.createMany({
    data: [
      { type: 'KEY_BENEFITS', tab: null, title: 'Key Benefits:', sortOrder: 0, items: li(
        'Revives dead or weak muscles', 'Stimulates blood flow', 'Restores flexibility',
        'Deep-penetrating relief', 'Non-greasy, fast absorption', 'Uplifting aromatic therapy') },
      { type: 'CHECKLIST', tab: 'description', tabLabel: 'Description', title: 'Perfect For:', sortOrder: 10, items: li(
        'Dead or weak muscles needing activation', 'Sports recovery and athletic performance',
        'Elderly joint stiffness and mobility issues', 'Post-injury therapy and rehabilitation',
        'Chronic muscle tension and discomfort', 'Daily maintenance and preventative care',
        'Massage therapy and bodywork', 'Improving nerve-muscle communication') },
      { type: 'CARDS', tab: 'ingredients', tabLabel: 'Ingredients', title: 'Sacred Ingredients', sortOrder: 20, items: [
        { title: 'Mahanarayan Oil', text: 'Anti-inflammatory base oil' },
        { title: 'Eucalyptus', text: 'Pain relief and circulation' },
        { title: 'Camphor', text: 'Cooling muscle relaxant' },
        { title: 'Olive Oil Carrier', text: 'Deep tissue penetration' },
        { title: 'Turmeric Extract', text: 'Powerful antioxidant' },
        { title: 'Clove Oil', text: 'Natural analgesic' },
        { title: 'Cinnamon Leaf', text: 'Warming circulation booster' },
        { title: 'Wintergreen', text: 'Methyl salicylate for pain relief' },
        { title: 'Menthol', text: 'Cooling sensation' },
        { title: 'Sacred Herbs Blend', text: 'Proprietary traditional herbs' }] },
      { type: 'CHECKLIST', tab: 'ingredients', title: 'Our Ingredient Promise', sortOrder: 21, items: li(
        '100% natural and plant-based', 'Sourced from ethical suppliers',
        'Harvested at optimal potency', 'Third-party tested for purity') },
      { type: 'STEPS', tab: 'usage', tabLabel: 'How to Use', title: 'Application Steps', sortOrder: 30, items: li(
        'Apply 3-5 drops to affected area', 'Massage gently for 2-3 minutes',
        'Use circular motions for absorption', 'Apply 2-3 times daily as needed',
        'Best used after warm shower', 'Can be used with warm compress') },
      { type: 'BULLETS', tab: 'usage', title: 'Pro Tips', sortOrder: 31, items: li(
        'Warm oil between palms before application for better absorption',
        'Use after warm shower when pores are open for maximum effect',
        'Combine with gentle stretching for enhanced flexibility',
        'Store in cool, dark place away from direct sunlight',
        'Patch test on small area before first full application') },
      { type: 'CHECKLIST', tab: 'benefits', tabLabel: 'Benefits', title: 'Physical Benefits', sortOrder: 40, items: li(
        'Revives dormant muscle tissue', 'Stimulates localized blood circulation',
        'Reduces inflammation and swelling', 'Improves joint flexibility and range of motion',
        'Alleviates muscle stiffness and tension', 'Accelerates recovery from physical activity',
        'Enhances nerve-muscle communication', 'Provides deep tissue penetration') },
      { type: 'CHECKLIST', tab: 'benefits', title: 'Holistic Benefits', sortOrder: 41, items: li(
        'Promotes mental relaxation and stress relief', 'Uplifting aromatic therapy for mood enhancement',
        'Enhances mind-body connection', 'Supports overall well-being and vitality',
        'Encourages regular self-care routine', 'Non-greasy formula for comfortable daily use',
        'Natural alternative to synthetic products', 'Suitable for all skin types') },
      { type: 'FAQ', tab: null, title: 'Frequently Asked Questions', sortOrder: 50, items: [
        { title: 'How soon will I see results?', text: 'Most users report feeling immediate relief, with significant improvement within 1-2 weeks of consistent use. For dormant muscles, it may take 3-4 weeks to notice revival.' },
        { title: 'Is Darwaish safe for sensitive skin?', text: "Yes, but we recommend a patch test first. Apply a small amount on your inner arm and wait 24 hours. Our formula is 100% natural but everyone's skin reacts differently." },
        { title: 'Can I use it with other medications?', text: "Darwaish is for external use only and generally safe. However, if you're on blood thinners or have sensitive medical conditions, consult your physician before use." },
        { title: 'How often should I apply?', text: '2-3 times daily for best results. Apply after showering for better absorption. For maintenance, once daily is sufficient.' },
        { title: 'What makes Darwaish different from other oils?', text: 'Our sacred formula combines traditional herbs with spiritual intention, focusing on reviving dormant muscles rather than just masking pain. We maintain ancestral preparation methods.' }] },
    ].map((section) => ({ productId: product.id, ...section })),
  })
}

async function seedProductPageSettings(storeId: string) {
  await db.contentBlock.upsert({
    where: { storeId_page_key: { storeId, page: 'product', key: 'settings' } },
    update: {}, // keep whatever the owner changed
    create: {
      storeId,
      page: 'product',
      key: 'settings',
      data: {
        showReviews: true,
        showFaq: true,
        showTrustBadges: true,
        showStickyBuyBar: true,
        showStockCount: true,
        lowStockThreshold: 10,
        maxQuantity: 10,
        buyButtonLabel: 'Order Now',
        badgeText: 'Sacred Formula • Handcrafted',
        guaranteeText: '30-Day Guarantee',
        trustBadges: [
          { icon: 'truck', text: 'Free Shipping' },
          { icon: 'shield', text: '30-Day Returns' },
          { icon: 'leaf', text: '100% Herbal' },
        ],
      },
    },
  })
}

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

  await seedProduct(store.id)
  await seedProductPageSettings(store.id)

  console.log(`Seeded: ${SERVICES.length} services, store "${store.name}", ${CHECKOUT_FIELDS.length} checkout fields, product "Darwaish Sacred Oil" (placeholder prices).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
