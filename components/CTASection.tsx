'use client'

import { motion } from 'framer-motion'
import { Leaf, Shield, Truck, Clock, CheckCircle, Gift } from 'lucide-react'

export default function CTASection() {
  return (
    <section className="relative overflow-hidden py-24 bg-gradient-to-br from-amber-900 via-amber-800 to-amber-950 text-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-white blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-emerald-500 blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm mb-8">
              <Gift className="w-10 h-10 text-amber-300" />
            </div>
            <h2 className="font-playfair text-4xl md:text-6xl font-bold mb-6">
              Begin Your <span className="text-amber-300">Healing Journey</span> Today
            </h2>
            <p className="text-xl text-amber-100 max-w-2xl mx-auto mb-10">
              Experience the ancestral wisdom that has brought relief to thousands. 
              Your body deserves this sacred revival.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column - Offer Details */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <div className="inline-block px-4 py-1 bg-amber-700 rounded-full text-sm font-bold mb-3">
                    LIMITED TIME OFFER
                  </div>
                  <h3 className="text-3xl font-bold">Sacred Revival Kit</h3>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-bold">$69</div>
                  <div className="text-amber-200 line-through">$89</div>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  "Full Size Darwaish Oil (100ml)",
                  "Free Muscle Relief Guide (PDF)",
                  "Premium Glass Dropper",
                  "Wooden Massage Tool",
                  "30-Day Money Back Guarantee"
                ].map((item, index) => (
                  <li key={index} className="flex items-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mr-3 flex-shrink-0" />
                    <span className="text-lg">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="bg-black/20 rounded-xl p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 text-amber-300 mr-2" />
                    <span className="font-bold">Offer Ends In:</span>
                  </div>
                  <div className="text-2xl font-bold">03:15:47</div>
                </div>
                <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                  <div className="w-3/4 h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full"></div>
                </div>
                <p className="text-sm text-amber-200 mt-2">Only 23 kits remaining at this price</p>
              </div>

              <button className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-5 rounded-xl text-xl shadow-2xl hover:shadow-amber-500/30 transition-all duration-300 hover:scale-[1.02]">
                Claim Your Sacred Kit →
              </button>
            </motion.div>

            {/* Right Column - Guarantees */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4">
                  <Shield className="w-12 h-12 text-amber-300 flex-shrink-0" />
                  <div>
                    <h4 className="text-xl font-bold mb-2">100% Satisfaction Guarantee</h4>
                    <p className="text-amber-100">
                      Try Darwaish risk-free for 30 days. If you don't experience relief, 
                      get a full refund. No questions asked.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4">
                  <Leaf className="w-12 h-12 text-emerald-300 flex-shrink-0" />
                  <div>
                    <h4 className="text-xl font-bold mb-2">Ancestral Purity Promise</h4>
                    <p className="text-amber-100">
                      Every bottle contains the exact sacred formula passed through generations. 
                      No shortcuts, no compromises.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="flex items-start space-x-4">
                  <Truck className="w-12 h-12 text-amber-300 flex-shrink-0" />
                  <div>
                    <h4 className="text-xl font-bold mb-2">Free Worldwide Shipping</h4>
                    <p className="text-amber-100">
                      Free delivery on all orders over $50. Discreet packaging with 
                      complimentary herbal samples.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center pt-6">
                <p className="text-amber-200 text-sm">
                  <strong>Note:</strong> This formula is based on ancestral wisdom. Results may vary. 
                  Consult your healthcare provider for medical advice.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-amber-300">
                  <span>✓ Secure Payment</span>
                  <span>✓ SSL Encrypted</span>
                  <span>✓ Privacy Protected</span>
                  <span>✓ Certified Herbal</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Trust Seals */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-20 pt-12 border-t border-white/20"
          >
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
              {[
                { icon: "🔒", text: "Secure Checkout" },
                { icon: "🌿", text: "100% Herbal" },
                { icon: "🤲", text: "Handmade" },
                { icon: "📦", text: "Discreet Shipping" },
                { icon: "💚", text: "Cruelty Free" }
              ].map((seal, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <span className="text-2xl">{seal.icon}</span>
                  <span className="font-medium">{seal.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}