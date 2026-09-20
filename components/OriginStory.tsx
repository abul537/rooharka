'use client'

import { motion } from 'framer-motion'
import { HeartHandshake, Leaf, Sparkles } from 'lucide-react'

export default function OriginStory() {
  return (
    <section className="py-24 bg-gradient-to-b from-white to-amber-50">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
            <span className="text-2xl">🧬</span>
          </div>
          
          <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            A Legacy of Healing
          </h2>
          
          <div className="h-1 w-24 bg-gradient-to-r from-amber-600 to-emerald-600 mx-auto mb-12" />
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: <HeartHandshake className="w-8 h-8" />,
              title: "Master to Disciple",
              description: "Gifted by a wise healer to my father, preserving sacred knowledge"
            },
            {
              icon: <Leaf className="w-8 h-8" />,
              title: "Herbal Purity",
              description: "100% natural ingredients, ethically sourced and hand-blended"
            },
            {
              icon: <Sparkles className="w-8 h-8" />,
              title: "Spiritual Intention",
              description: "Infused with mindfulness at every step of creation"
            }
          ].map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="text-amber-700 mb-4">{item.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-gray-600">{item.description}</p>
            </motion.div>
          ))}
        </div>
        
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center"
        >
          <blockquote className="text-2xl md:text-3xl font-playfair italic text-gray-800 leading-relaxed mb-8">
            "Passed down through generations, Darwaish is not just an oil — it's a sacred formula 
            rooted in the belief that motion is divine, and stagnation is suffering."
          </blockquote>
          
          <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-8 rounded-2xl border border-amber-200">
            <p className="text-lg text-gray-700 leading-relaxed mb-4">
              Infused with traditional herbs, essential oils, and deep spiritual intention, 
              Darwaish revives dead or dormant muscles, restores flexibility, and returns 
              the body to its natural rhythm.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed font-semibold">
              Rooted in Sufi humility, made with herbal purity, and guided by ancestral wisdom — 
              Darwaish is healing for the body and peace for the soul.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}