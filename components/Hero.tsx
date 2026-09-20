'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export default function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-amber-900/10 to-emerald-900/10" />
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-100 text-amber-800 mb-6">
              <span className="mr-2">🧭</span>
              <span className="text-sm font-medium">Ancestral Wisdom, Modern Relief</span>
            </div>
            
            <h1 className="font-playfair text-5xl md:text-7xl font-bold text-gray-900 mb-6">
              Darwaish<sup className="text-xl align-super">®</sup>
            </h1>
            
            <h2 className="text-2xl md:text-3xl font-light text-gray-700 mb-8 italic">
              Sacred Oil for Muscle Revival
            </h2>
            
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              A timeless formula gifted through generations, reviving dormant muscles 
              and restoring your body's natural rhythm.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="group bg-gradient-to-r from-amber-700 to-amber-800 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:shadow-xl hover:shadow-amber-200 transition-all duration-300 flex items-center justify-center">
                Begin Your Revival Journey
                <ArrowRight className="ml-2 group-hover:translate-x-2 transition-transform" />
              </button>
              
              <button className="border-2 border-amber-800 text-amber-800 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-amber-50 transition-colors">
                Discover the Story
              </button>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="relative h-[500px] w-full rounded-2xl overflow-hidden shadow-2xl">
              {/* Product image placeholder - replace with actual image */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-emerald-100 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-64 h-64 mx-auto mb-4 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 shadow-2xl flex items-center justify-center">
                    <span className="text-white text-4xl">🫙</span>
                  </div>
                  <p className="text-amber-900 font-medium">Handcrafted in Small Batches</p>
                </div>
              </div>
            </div>
            
            {/* Decorative elements */}
            <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-emerald-200/30 blur-xl" />
            <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-full bg-amber-200/30 blur-xl" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}