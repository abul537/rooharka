import Link from 'next/link'
import { headers } from 'next/headers'
import { requireAdmin } from '@/lib/auth/guard'
import { listCategories } from '@/lib/admin/categories'
import { listOrganisation } from '@/lib/admin/products'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import ProductTypeFields from '@/components/admin/ProductTypeFields'
import SeoFields from '@/components/admin/SeoFields'
import RichTextEditor from '@/components/admin/RichTextEditor'
import ShippingFields from '@/components/admin/ShippingFields'
import TaxonomyPicker from '@/components/admin/TaxonomyPicker'
import { COUNTRY_CODES, countryName } from '@/lib/admin/product-mvp'
import { createProductAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function NewProduct() {
  const admin = await requireAdmin('products.edit')
  const [cats, org, host] = await Promise.all([listCategories(admin.storeId), listOrganisation(admin.storeId), headers().then((h) => h.get('host') ?? '')])
  const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) }))
  return (
    <div className="max-w-6xl">
      <Link href="/admin/products" className="text-sm text-slate-600 underline">← All products</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Add product</h1>
      <p className="text-sm text-slate-600 mb-6">Fill in what you know; only the title and price are required. Photos, videos and page sections are added on the next screen, right after saving.</p>
      <ActionForm action={createProductAction}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
          <div className="space-y-6 min-w-0">
            <Card title="Details">
              <div className="grid gap-4">
                <Field label="Title"><input name="name" required maxLength={120} placeholder="Short sleeve t-shirt" className={inputCls} /></Field>
                <Field label="Subtitle (optional)"><input name="subtitle" maxLength={160} className={inputCls} /></Field>
                <Field label="Short description (optional)" hint="One or two lines shown near the price."><textarea name="shortDescription" rows={3} maxLength={500} className={inputCls} /></Field>
                <div><span className="block text-sm font-medium mb-1">Description (optional)</span><RichTextEditor name="description" initialHtml="" /></div>
              </div>
            </Card>
            <Card title="How it is sold, pricing and inventory" hint="Choose the type first: it decides which fields you need. The type cannot be changed later.">
              <ProductTypeFields />
            </Card>
            <Card title="Search engine listing" hint="Optional. How this product may appear on Google, and its page address.">
              <SeoFields name="Your product title" shortDescription="" seoTitle="" seoDescription="" slug="" host={host} editableSlug={false} />
            </Card>
            <button className={primaryBtn}>Save and add photos</button>
          </div>
          <div className="space-y-6 lg:sticky lg:top-4">
            <Card title="Status">
              <div className="grid gap-3">
                <select name="status" className={inputCls} defaultValue="DRAFT" aria-label="Status"><option value="DRAFT">Draft (hidden until you are ready)</option><option value="ACTIVE">Active (live in the shop)</option></select>
                <Check name="isFeatured" label="Feature this product" hint="Shown first on the shop page." />
                <button className={primaryBtn}>Save and add photos</button>
              </div>
            </Card>
            <Card title="Shipping and tax">
              <div className="grid gap-4">
                <input type="hidden" name="optionsSent" value="1" />
                <ShippingFields requiresShipping weightUnit="g" originCountry="" hsCode="" countries={countries} />
                <Check name="allowBackorder" label="Continue selling when out of stock" hint="Customers can still order at zero stock." />
                <Check name="taxable" label="Charge tax on this product" defaultChecked />
              </div>
            </Card>
            <Card title="Organisation">
              <div className="grid gap-4">
                <TaxonomyPicker id={null} path="" />
                <Field label="Product type" hint="Your own words, e.g. T-shirt."><input name="productType" maxLength={80} className={inputCls} /></Field>
                <Field label="Shop category" hint="Your own grouping, shown as a filter in your shop.">
                  <select name="categoryId" className={inputCls} defaultValue=""><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </Field>
                <Field label="Vendor" hint="The brand or supplier."><input name="vendor" maxLength={80} list="vendors" className={inputCls} /></Field>
                <datalist id="vendors">{org.vendors.map((v) => <option key={v} value={v} />)}</datalist>
                <Field label="Tags" hint={`Separate with commas, e.g. summer, gift.${org.tags.length ? ` Already used: ${org.tags.slice(0, 12).join(', ')}` : ''}`}><input name="tags" maxLength={700} className={inputCls} /></Field>
              </div>
            </Card>
          </div>
        </div>
      </ActionForm>
    </div>
  )
}
