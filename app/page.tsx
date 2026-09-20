import Hero from '@/components/Hero'
import OriginStory from '@/components/OriginStory'
import ProductShowcase from '@/components/ProductShowcase'
import Benefits from '@/components/Benefits'
import Testimonials from '@/components/Testimonials'
import CTASection from '@/components/CTASection'

export default function Home() {
  return (
    <>
      <Hero />
      <OriginStory />
      <ProductShowcase />
      <Benefits />
      <Testimonials />
      <CTASection />
    </>
  )
}