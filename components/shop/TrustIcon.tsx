import { CheckCircle2, Clock, Gift, Heart, Leaf, Phone, ShieldCheck, Star, Truck, Wallet, type LucideIcon } from 'lucide-react'
import type { Icon } from '@/lib/storefront/rules'

const MAP: Record<Icon, LucideIcon> = { truck: Truck, shield: ShieldCheck, leaf: Leaf, clock: Clock, heart: Heart, star: Star, phone: Phone, check: CheckCircle2, gift: Gift, wallet: Wallet }
export default function TrustIcon({ name, className }: { name: Icon; className?: string }) {
  const I = MAP[name] ?? CheckCircle2
  return <I className={className} aria-hidden />
}
