'use client'

import { motion } from 'framer-motion'
import { Target, Zap, Heart, Shield, Brain, Clock } from 'lucide-react'

const benefits = [
  {
    icon: <Target className="w-8 h-8" />,
    title: "Muscle Revival",
    description: "Activates dormant muscle tissue and stimulates blood flow to revive weak or inactive muscles.",
    color: "from-red-500 to-orange-500"
  },
  {
    icon: <Zap className="w-8 h-8" />,
    title: "Fast Absorption",
    description: "Non-greasy formula penetrates deeply for immediate relief and long-lasting effects.",
    color: "from-amber-500 to-yellow-500"
  },
  {
    icon: <Heart className="w-8 h-8" />,
    title: "Joint Flexibility",
    description: "Restores natural range of motion and reduces stiffness in joints and muscles.",
    color: "from-emerald-500 to-green-500"
  },
  {
    icon: <Shield className="w-8 h-8" />,
    title: "Nerve Support",
    description: "Strengthens the connection between nerves and muscles for better control and coordination.",
    color: "from-blue-500 to-cyan-500"
  },
  {
    icon: <Brain className="w-8 h-8" />,
    title: "Mind Calming",
    description: "Uplifting aromatic profile promotes mental peace and reduces stress during recovery.",
    color: "from-purple-500 to-pink-500"
  },
  {
    icon: <Clock className="w-8 h-8" />,
    title: "24/7 Relief",
    description: "Suitable for daily use - morning stiffness, post-workout, bedtime relaxation, or anytime relief.",
    color: "from-indigo-500 to-violet-500"
  }
]

export default function Benefits() {
  return (
    <section id="benefits" className="py-24 bg-gradient-to-b from-amber-50 to-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 mb-6">
            <span className="text-2xl">✨</span>
          </div>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Ancient Formula, <span className="text-gradient">Modern Benefits</span>
          </h2>
          <p className="text-xl text-gray-600">
            Experience comprehensive relief that addresses both physical discomfort and mental stress.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ y: -8, transition: { duration: 0.2 } }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300" />
              <div className="relative p-8 rounded-2xl border border-gray-100 bg-white/50 backdrop-blur-sm">
                <div className={`inline-flex p-4 rounded-xl bg-gradient-to-r ${benefit.color} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <div className="text-white">{benefit.icon}</div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
                
                {/* Hover effect line */}
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-0 h-1 bg-gradient-to-r from-amber-500 to-emerald-500 group-hover:w-3/4 transition-all duration-500 rounded-full" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Usage Guide */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20 bg-gradient-to-r from-amber-50 to-emerald-50 rounded-3xl p-8 md:p-12"
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="font-playfair text-3xl font-bold text-gray-900 mb-6">
                How to Use Darwaish®
              </h3>
              <ol className="space-y-4">
                {[
                  "Warm 3-5 drops between palms",
                  "Massage gently onto affected area",
                  "Use circular motions for better absorption",
                  "Apply 2-3 times daily as needed",
                  "Best used after warm shower or bath"
                ].map((step, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <span className="w-8 h-8 rounded-full bg-amber-700 text-white flex items-center justify-center font-bold flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-gray-700 pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <h4 className="font-bold text-xl text-gray-900 mb-4">Safety First</h4>
              <ul className="space-y-3">
                {[
                  "For external use only",
                  "Avoid contact with eyes",
                  "Patch test before first use",
                  "Keep away from children",
                  "Consult physician if pregnant or nursing",
                  "Store in cool, dry place"
                ].map((item, index) => (
                  <li key={index} className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mr-3"></div>
                    <span className="text-gray-600">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 p-4 bg-amber-50 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Results may vary. Consistent use yields best results. 
                  Not intended to diagnose, treat, cure, or prevent any disease.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}