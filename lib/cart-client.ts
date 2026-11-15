'use client'

import { useEffect, useState } from 'react'
import { CART_EVENT, CART_KEY, addToCart, parseCart, type CartItem } from '@/lib/cart'

/** The cart in this browser. Reading never fails: a blocked or broken storage is simply an empty cart. */
export function readCart(): CartItem[] {
  try { return parseCart(window.localStorage.getItem(CART_KEY)) } catch { return [] }
}
export function writeCart(cart: CartItem[]): void {
  try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* private window: the cart lasts for this page only */ }
  try { window.dispatchEvent(new Event(CART_EVENT)) } catch { /* nothing listens */ }
}
/** Adds one size to the cart. false = the cart is full. */
export function addItem(variantId: string, quantity: number): boolean {
  const { cart, added } = addToCart(readCart(), variantId, quantity)
  if (added) writeCart(cart)
  return added
}
/** How many lines are in the cart, kept up to date across the page and other tabs. 0 until the page has loaded. */
export function useCartCount(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const sync = () => setN(readCart().length)
    sync()
    window.addEventListener(CART_EVENT, sync); window.addEventListener('storage', sync)
    return () => { window.removeEventListener(CART_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return n
}
