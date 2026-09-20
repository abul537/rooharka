'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ShoppingCart, Truck, Shield, Leaf, Clock, Heart, ChevronDown } from 'lucide-react'

export default function ProductPage() {
  const [quantity, setQuantity] = useState(1)
  const [selectedSize, setSelectedSize] = useState('100ml')
  const [activeTab, setActiveTab] = useState('description')

  const product = {
    name: 'Darwaish® Sacred Oil',
    subtitle: 'Muscle Revival Formula',
    price: 89,
    salePrice: 69,
    sizes: [
      { value: '30ml', price: 39, label: 'Trial Size' },
      { value: '100ml', price: 89, label: 'Most Popular', salePrice: 69 },
      { value: '200ml', price: 149, label: 'Best Value', salePrice: 119 }
    ],
    benefits: [
      'Revives dead or weak muscles',
      'Stimulates blood flow',
      'Restores flexibility',
      'Deep-penetrating relief',
      'Non-greasy, fast absorption',
      'Uplifting aromatic therapy'
    ],
    ingredients: [
      { name: 'Mahanarayan Oil', benefit: 'Anti-inflammatory base oil' },
      { name: 'Eucalyptus', benefit: 'Pain relief and circulation' },
      { name: 'Camphor', benefit: 'Cooling muscle relaxant' },
      { name: 'Olive Oil Carrier', benefit: 'Deep tissue penetration' },
      { name: 'Turmeric Extract', benefit: 'Powerful antioxidant' },
      { name: 'Clove Oil', benefit: 'Natural analgesic' },
      { name: 'Cinnamon Leaf', benefit: 'Warming circulation booster' },
      { name: 'Wintergreen', benefit: 'Methyl salicylate for pain relief' },
      { name: 'Menthol', benefit: 'Cooling sensation' },
      { name: 'Sacred Herbs Blend', benefit: 'Proprietary traditional herbs' }
    ],
    usage: [
      'Apply 3-5 drops to affected area',
      'Massage gently for 2-3 minutes',
      'Use circular motions for absorption',
      'Apply 2-3 times daily as needed',
      'Best used after warm shower',
      'Can be used with warm compress'
    ]
  }

  const handleAddToCart = () => {
    console.log('Added to cart:', {
      product: product.name,
      size: selectedSize,
      quantity,
      price: product.sizes.find(s => s.value === selectedSize)?.salePrice || 
             product.sizes.find(s => s.value === selectedSize)?.price
    })
    // Add your cart logic here
  }

  const selectedSizeObj = product.sizes.find(s => s.value === selectedSize)

  return (
    <div className="pt-24 pb-32">
      {/* Product Hero */}
      <section className="py-16 bg-gradient-to-b from-amber-50 to-white">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Product Images */}
            <div className="sticky top-32">
              <div className="relative">
                <div className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-amber-100 to-emerald-100 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-64 h-64 mx-auto mb-6 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 shadow-2xl flex items-center justify-center">
                      <span className="text-white text-7xl">🫙</span>
                    </div>
                    <p className="text-amber-900 font-medium text-lg">Handcrafted Sacred Oil</p>
                  </div>
                </div>
                <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-emerald-200/30 blur-xl" />
                <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-full bg-amber-200/30 blur-xl" />
              </div>
              
              {/* Image Thumbnails */}
              <div className="flex space-x-4 mt-8">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-50 to-emerald-50 border-2 border-amber-200 cursor-pointer hover:border-amber-500 transition-colors flex items-center justify-center"
                  >
                    <span className="text-2xl">🫙</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Product Info */}
            <div>
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-100 text-amber-800 mb-6">
                <span className="mr-2">✨</span>
                <span className="font-medium">Sacred Formula • Handcrafted</span>
              </div>
              
              <h1 className="font-playfair text-5xl md:text-6xl font-bold text-gray-900 mb-4">
                Darwaish<sup className="text-2xl align-super">®</sup>
              </h1>
              <h2 className="text-2xl text-gray-600 mb-8">Sacred Oil for Muscle Revival</h2>
              
              <div className="flex items-center space-x-4 mb-8">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-amber-500 text-2xl">★</span>
                  ))}
                </div>
                <span className="text-gray-600">4.9 • 1,247 reviews</span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">
                  30-Day Guarantee
                </span>
              </div>
              
              <p className="text-xl text-gray-700 mb-10 leading-relaxed">
                A deeply therapeutic oil blend crafted using an ancient formula passed down 
                from master to disciple. Darwaish stimulates blood flow, revives stiff or 
                inactive muscle tissue, and restores fluid motion to the body.
              </p>

              {/* Size Selection */}
              <div className="mb-10">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Select Size:</h3>
                <div className="grid grid-cols-3 gap-4">
                  {product.sizes.map((size) => (
                    <button
                      key={size.value}
                      onClick={() => setSelectedSize(size.value)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        selectedSize === size.value
                          ? 'border-amber-600 bg-amber-50'
                          : 'border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="text-left">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-gray-900">{size.value}</span>
                          {size.label && (
                            <span className="text-xs bg-amber-600 text-white px-2 py-1 rounded">
                              {size.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center">
                          {size.salePrice ? (
                            <>
                              <span className="text-2xl font-bold text-gray-900">${size.salePrice}</span>
                              <span className="text-gray-500 line-through ml-2">${size.price}</span>
                            </>
                          ) : (
                            <span className="text-2xl font-bold text-gray-900">${size.price}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity & Add to Cart */}
              <div className="mb-10">
                <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
                  <div className="flex items-center">
                    <span className="mr-4 font-medium">Quantity:</span>
                    <div className="flex items-center border rounded-lg">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50"
                      >
                        -
                      </button>
                      <span className="w-12 h-12 flex items-center justify-center font-bold">
                        {quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <button
                      onClick={handleAddToCart}
                      className="w-full group bg-gradient-to-r from-amber-700 to-amber-800 text-white py-4 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center"
                    >
                      <ShoppingCart className="mr-3" />
                      Add to Cart • ${((selectedSizeObj?.salePrice || selectedSizeObj?.price || 0) * quantity).toFixed(2)}
                    </button>
                  </div>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-3 gap-4 mb-10">
                <div className="flex items-center space-x-3">
                  <Truck className="w-5 h-5 text-amber-600" />
                  <span className="text-sm">Free Shipping</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <span className="text-sm">30-Day Returns</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Leaf className="w-5 h-5 text-amber-600" />
                  <span className="text-sm">100% Herbal</span>
                </div>
              </div>

              {/* Benefits List */}
              <div className="bg-gradient-to-r from-amber-50 to-emerald-50 rounded-2xl p-6">
                <h3 className="font-bold text-xl text-gray-900 mb-4">Key Benefits:</h3>
                <div className="grid grid-cols-2 gap-3">
                  {product.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center">
                      <Check className="w-5 h-5 text-emerald-600 mr-2 flex-shrink-0" />
                      <span className="text-gray-700 text-sm">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Tabs */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {/* Tab Navigation */}
          <div className="flex flex-wrap border-b border-gray-200 mb-12">
            {[
              { id: 'description', label: 'Description' },
              { id: 'ingredients', label: 'Ingredients' },
              { id: 'usage', label: 'How to Use' },
              { id: 'benefits', label: 'Benefits' },
              { id: 'reviews', label: 'Reviews' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 font-medium text-lg border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="max-w-4xl mx-auto">
            {activeTab === 'description' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="prose prose-lg max-w-none"
              >
                <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-6">
                  The Sacred Formula
                </h2>
                <p className="text-gray-700 mb-6">
                  Darwaish® is a deeply therapeutic oil blend crafted using an ancient formula 
                  passed down from master to disciple through generations of healing tradition. 
                  This sacred formula represents centuries of accumulated wisdom about 
                  natural healing and muscle revival.
                </p>
                <p className="text-gray-700 mb-6">
                  Rooted in Sufi healing traditions, Darwaish combines precise ratios of 
                  traditional herbs and essential oils with deep spiritual intention. 
                  Each ingredient is selected not only for its physical healing properties 
                  but also for its energetic qualities that work in harmony with the body's 
                  natural rhythms.
                </p>
                <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-8 rounded-2xl my-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Perfect For:</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      'Dead or weak muscles needing activation',
                      'Sports recovery and athletic performance',
                      'Elderly joint stiffness and mobility issues',
                      'Post-injury therapy and rehabilitation',
                      'Chronic muscle tension and discomfort',
                      'Daily maintenance and preventative care',
                      'Massage therapy and bodywork',
                      'Improving nerve-muscle communication'
                    ].map((use, index) => (
                      <div key={index} className="flex items-center">
                        <Check className="w-5 h-5 text-emerald-600 mr-3 flex-shrink-0" />
                        <span className="text-gray-700">{use}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'ingredients' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-8">
                  Sacred Ingredients
                </h2>
                <div className="grid md:grid-cols-2 gap-6 mb-12">
                  {product.ingredients.map((ingredient, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
                    >
                      <h3 className="font-bold text-lg text-gray-900 mb-2">
                        {ingredient.name}
                      </h3>
                      <p className="text-gray-600">{ingredient.benefit}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 rounded-2xl p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">
                    Our Ingredient Promise
                  </h3>
                  <p className="text-gray-700 mb-4">
                    Every ingredient in Darwaish is:
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <Leaf className="w-5 h-5 text-emerald-600 mr-3" />
                      <span>100% natural and plant-based</span>
                    </div>
                    <div className="flex items-center">
                      <Heart className="w-5 h-5 text-red-500 mr-3" />
                      <span>Sourced from ethical suppliers</span>
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-5 h-5 text-amber-600 mr-3" />
                      <span>Harvested at optimal potency</span>
                    </div>
                    <div className="flex items-center">
                      <Shield className="w-5 h-5 text-blue-600 mr-3" />
                      <span>Third-party tested for purity</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'usage' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-8">
                  How to Use Darwaish®
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">
                      Application Steps
                    </h3>
                    <ol className="space-y-6">
                      {product.usage.map((step, index) => (
                        <li key={index} className="flex items-start">
                          <span className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold mr-4 flex-shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-gray-700 pt-1">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-2xl p-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">
                      Pro Tips
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start">
                        <span className="text-amber-600 mr-3">•</span>
                        <span>Warm oil between palms before application for better absorption</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-amber-600 mr-3">•</span>
                        <span>Use after warm shower when pores are open for maximum effect</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-amber-600 mr-3">•</span>
                        <span>Combine with gentle stretching for enhanced flexibility</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-amber-600 mr-3">•</span>
                        <span>Store in cool, dark place away from direct sunlight</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-amber-600 mr-3">•</span>
                        <span>Patch test on small area before first full application</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'benefits' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-8">
                  Comprehensive Benefits
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold text-gray-900">Physical Benefits</h3>
                    <ul className="space-y-4">
                      {[
                        'Revives dormant muscle tissue',
                        'Stimulates localized blood circulation',
                        'Reduces inflammation and swelling',
                        'Improves joint flexibility and range of motion',
                        'Alleviates muscle stiffness and tension',
                        'Accelerates recovery from physical activity',
                        'Enhances nerve-muscle communication',
                        'Provides deep tissue penetration'
                      ].map((benefit, index) => (
                        <li key={index} className="flex items-center">
                          <Check className="w-5 h-5 text-emerald-600 mr-3 flex-shrink-0" />
                          <span className="text-gray-700">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold text-gray-900">Holistic Benefits</h3>
                    <ul className="space-y-4">
                      {[
                        'Promotes mental relaxation and stress relief',
                        'Uplifting aromatic therapy for mood enhancement',
                        'Enhances mind-body connection',
                        'Supports overall well-being and vitality',
                        'Encourages regular self-care routine',
                        'Non-greasy formula for comfortable daily use',
                        'Natural alternative to synthetic products',
                        'Suitable for all skin types'
                      ].map((benefit, index) => (
                        <li key={index} className="flex items-center">
                          <Check className="w-5 h-5 text-emerald-600 mr-3 flex-shrink-0" />
                          <span className="text-gray-700">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'reviews' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-8">
                  Customer Experiences
                </h2>
                <div className="space-y-8">
                  {[
                    {
                      name: 'Michael R.',
                      rating: 5,
                      date: '2 weeks ago',
                      comment: 'After knee surgery, my quad was completely dormant. 3 weeks of Darwaish and I can feel the muscle waking up. Incredible.',
                      verified: true
                    },
                    {
                      name: 'Sarah L.',
                      rating: 5,
                      date: '1 month ago',
                      comment: 'The spiritual quality is palpable. It\'s not just physical relief - there\'s a calming effect that\'s hard to describe.',
                      verified: true
                    },
                    {
                      name: 'David K.',
                      rating: 5,
                      date: '2 months ago',
                      comment: '20 years of construction destroyed my shoulders. This is the only thing that lets me sleep through the night.',
                      verified: true
                    }
                  ].map((review, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-2xl p-8">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center mb-2">
                            <div className="flex mr-3">
                              {[...Array(review.rating)].map((_, i) => (
                                <span key={i} className="text-amber-500">★</span>
                              ))}
                            </div>
                            {review.verified && (
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs">
                                Verified Purchase
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-lg">{review.name}</h4>
                          <p className="text-gray-500 text-sm">{review.date}</p>
                        </div>
                      </div>
                      <p className="text-gray-700">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-gradient-to-b from-white to-amber-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-playfair text-4xl font-bold text-gray-900 mb-12 text-center">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {[
                {
                  question: 'How soon will I see results?',
                  answer: 'Most users report feeling immediate relief, with significant improvement within 1-2 weeks of consistent use. For dormant muscles, it may take 3-4 weeks to notice revival.'
                },
                {
                  question: 'Is Darwaish safe for sensitive skin?',
                  answer: 'Yes, but we recommend a patch test first. Apply a small amount on your inner arm and wait 24 hours. Our formula is 100% natural but everyone\'s skin reacts differently.'
                },
                {
                  question: 'Can I use it with other medications?',
                  answer: 'Darwaish is for external use only and generally safe. However, if you\'re on blood thinners or have sensitive medical conditions, consult your physician before use.'
                },
                {
                  question: 'How often should I apply?',
                  answer: '2-3 times daily for best results. Apply after showering for better absorption. For maintenance, once daily is sufficient.'
                },
                {
                  question: 'What makes Darwaish different from other oils?',
                  answer: 'Our sacred formula combines traditional herbs with spiritual intention, focusing on reviving dormant muscles rather than just masking pain. We maintain ancestral preparation methods.'
                }
              ].map((faq, index) => (
                <div key={index} className="border border-gray-200 rounded-2xl overflow-hidden">
                  <button
                    className="w-full p-6 text-left flex justify-between items-center hover:bg-gray-50"
                    onClick={() => {
                      // Add toggle logic here
                      console.log('Toggle FAQ', index)
                    }}
                  >
                    <span className="font-bold text-lg text-gray-900">{faq.question}</span>
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  </button>
                  <div className="p-6 pt-0">
                    <p className="text-gray-700">{faq.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}