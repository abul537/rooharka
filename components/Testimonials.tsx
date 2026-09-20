'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react'

const testimonials = [
  {
    name: "Marcus R.",
    role: "Former Athlete",
    image: "MR",
    rating: 5,
    content: "After a knee surgery left my quad muscles dormant for months, Darwaish brought them back to life. I've tried everything - this oil actually works.",
    duration: "Using for 3 months"
  },
  {
    name: "Sarah L.",
    role: "Yoga Instructor",
    image: "SL",
    rating: 5,
    content: "The spiritual intention behind this formula is palpable. It's not just physical relief - there's a calming, grounding effect that enhances my practice.",
    duration: "Using for 6 months"
  },
  {
    name: "David K.",
    role: "Construction Worker",
    image: "DK",
    rating: 5,
    content: "20 years of hard labor destroyed my shoulders. Darwaish is the only thing that lets me sleep through the night. My wife uses it for her arthritis too.",
    duration: "Using for 8 months"
  },
  {
    name: "Priya M.",
    role: "Elderly Care Specialist",
    image: "PM",
    rating: 5,
    content: "I recommend Darwaish to all my elderly clients. The difference in their mobility and pain levels is remarkable. Truly a gift from ancestral wisdom.",
    duration: "Using for 1 year"
  },
  {
    name: "Alex T.",
    role: "Marathon Runner",
    image: "AT",
    rating: 5,
    content: "Post-marathon recovery used to take weeks. With Darwaish, I'm back training in days. The muscle revival is real - I've cut my recovery time in half.",
    duration: "Using for 4 months"
  },
  {
    name: "Fatima N.",
    role: "Physical Therapist",
    image: "FN",
    rating: 5,
    content: "I incorporate Darwaish into my therapy sessions. The nerve-muscle connection improvement I've seen in stroke patients is beyond conventional treatment.",
    duration: "Using for 9 months"
  }
]

export default function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0)

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  }

  const paginate = (newDirection: number) => {
    setDirection(newDirection)
    setCurrentIndex((prevIndex) => {
      let nextIndex = prevIndex + newDirection
      if (nextIndex >= testimonials.length) nextIndex = 0
      if (nextIndex < 0) nextIndex = testimonials.length - 1
      return nextIndex
    })
  }

  const testimonialGroups = []
  for (let i = 0; i < testimonials.length; i += 3) {
    testimonialGroups.push(testimonials.slice(i, i + 3))
  }

  return (
    <section id="testimonials" className="py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 mb-6">
            <Quote className="w-8 h-8 text-amber-700" />
          </div>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Stories of <span className="text-gradient">Revival & Relief</span>
          </h2>
          <p className="text-xl text-gray-600">
            Join thousands who have rediscovered movement and comfort with Darwaish.
          </p>
        </div>

        {/* Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-8 mb-12">
          {testimonials.slice(0, 3).map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-200 to-emerald-200 flex items-center justify-center mr-4">
                  <span className="font-bold text-gray-900">{testimonial.image}</span>
                </div>
                <div>
                  <h4 className="font-bold text-lg text-gray-900">{testimonial.name}</h4>
                  <p className="text-gray-600 text-sm">{testimonial.role}</p>
                  <div className="flex items-center mt-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-500 text-amber-500" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-gray-700 italic mb-4">"{testimonial.content}"</p>
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{testimonial.duration}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile Carousel */}
        <div className="md:hidden relative">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl shadow-lg"
            >
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-200 to-emerald-200 flex items-center justify-center mr-4">
                  <span className="font-bold text-gray-900">
                    {testimonials[currentIndex].image}
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-lg text-gray-900">
                    {testimonials[currentIndex].name}
                  </h4>
                  <p className="text-gray-600 text-sm">{testimonials[currentIndex].role}</p>
                  <div className="flex items-center mt-1">
                    {[...Array(testimonials[currentIndex].rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-500 text-amber-500" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-gray-700 italic mb-4">
                "{testimonials[currentIndex].content}"
              </p>
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{testimonials[currentIndex].duration}</p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Controls */}
          <div className="flex justify-center items-center mt-8 space-x-4">
            <button
              onClick={() => paginate(-1)}
              className="w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-amber-50 transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-700" />
            </button>
            <div className="flex space-x-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > currentIndex ? 1 : -1)
                    setCurrentIndex(index)
                  }}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentIndex ? 'bg-amber-700' : 'bg-gray-300'
                  }`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => paginate(1)}
              className="w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-amber-50 transition-colors"
            >
              <ChevronRight className="w-6 h-6 text-gray-700" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          {[
            { value: "5,000+", label: "Bottles Sold" },
            { value: "98%", label: "Satisfaction Rate" },
            { value: "45", label: "Days Average Relief" },
            { value: "10+", label: "Countries Reached" }
          ].map((stat, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-amber-50 to-emerald-50 p-6 rounded-2xl text-center"
            >
              <div className="text-4xl font-bold text-gray-900 mb-2">{stat.value}</div>
              <div className="text-gray-600">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Trust Badges */}
        <div className="mt-12 pt-12 border-t border-gray-100">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
            {[
              "100% Herbal",
              "Cruelty Free",
              "Small Batches",
              "Handcrafted",
              "Eco Packaging",
              "No Chemicals"
            ].map((badge, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-gray-700 font-medium">{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}