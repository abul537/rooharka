import { redirect } from 'next/navigation'

// /product has no page of its own: the catalog lives at /shop.
export default function ProductIndex() {
  redirect('/shop')
}
