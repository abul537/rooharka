'use client'

import { motion } from 'framer-motion'
import { Check, Droplets, Zap, Activity, Shield } from 'lucide-react'

const BENEFITS = [
  "Revives dead or weak muscles",
  "Accelerates sports recovery",
  "Relieves elderly joint stiffness",
  "Supports post-injury therapy",
  "Perfect for massage and daily care"
]

const INGREDIENTS = [
  { name: "Mahanarayan Oil", property: "Anti-inflammatory" },
  { name: "Eucalyptus", property: "Pain Relief" },
  { name: "Camphor", property: "Cooling Effect" },
  { name: "Olive Oil Base", property: "Deep Penetration" },
  { name: "Turmeric Extract", property: "Antioxidant" },
  { name: "Clove Oil", property: "Circulation Boost" },
  { name: "Cinnamon Leaf", property: "Warming" }
]

export default function ProductShowcase() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              The Sacred <span className="text-amber-700">Formula</span>
            </h2>
            
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              A deeply therapeutic oil blend crafted using an ancient formula passed 
              down from master to disciple. Stimulates blood flow, revives stiff or 
              inactive muscle tissue, and restores fluid motion to the body.
            </p>
            
            <div className="space-y-6 mb-10">
              <div className="flex items-start">
                <Droplets className="w-6 h-6 text-emerald-600 mr-4 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-lg text-gray-900 mb-2">Fast-Absorbing & Non-Greasy</h4>
                  <p className="text-gray-600">Deep-penetrating formula that strengthens nerve-muscle connection</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <Zap className="w-6 h-6 text-amber-600 mr-4 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-lg text-gray-900 mb-2">Uplifting Aromatherapy</h4>
                  <p className="text-gray-600">Calming aromatic notes promote peace of mind during application</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <Shield className="w-6 h-6 text-emerald-700 mr-4 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-lg text-gray-900 mb-2">100% Herbal & Handmade</h4>
                  <p className="text-gray-600">Small batch production ensures quality and potency</p>
                </div>
              </div>
            </div>
            
            <div className="mb-10">
              <h3 className="font-bold text-2xl text-gray-900 mb-4">Perfect For:</h3>
              <div className="space-y-3">
                {BENEFITS.map((benefit, index) => (
                  <div key={index} className="flex items-center">
                    <Check className="w-5 h-5 text-emerald-600 mr-3" />
                    <span className="text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <button className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-10 py-4 rounded-lg font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300">
              Experience Revival - Shop Now
            </button>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-amber-50 to-emerald-50 p-8 rounded-3xl shadow-2xl"
          >
            <h3 className="font-playfair text-3xl font-bold text-gray-900 mb-8 text-center">
              Sacred Ingredients
            </h3>
            
            <div className="grid grid-cols-2 gap-4 mb-10">
              {INGREDIENTS.map((ingredient, index) => (
                <div
                  key={index}
                  className="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow"
                >
                  <div className="text-amber-700 font-bold mb-1">{ingredient.name}</div>
                  <div className="text-sm text-gray-600">{ingredient.property}</div>
                </div>
              ))}
            </div>
            
            <div className="bg-gradient-to-r from-amber-100 to-emerald-100 p-6 rounded-2xl">
              <div className="flex items-center mb-4">
                <Activity className="w-8 h-8 text-amber-700 mr-3" />
                <h4 className="font-bold text-xl text-gray-900">Ancient Wisdom, Modern Results</h4>
              </div>
              <p className="text-gray-700">
                Each ingredient is carefully selected and blended according to the 
                ancestral formula, ensuring maximum potency and therapeutic effect.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}