'use client'

import { useState, useEffect } from 'react'
import { Menu, X, ShoppingBag, User, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'The Story', href: '/about' },
    // { label: 'Benefits', href: '#benefits' },
    // { label: 'Ingredients', href: '#ingredients' },
    // { label: 'Testimonials', href: '#testimonials' },
    { label: 'Shop Now', href: '/product' },
  ]

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/90 backdrop-blur-md shadow-lg py-3'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-600 to-amber-800 flex items-center justify-center">
                <span className="text-white font-bold text-xl">D</span>
              </div>
              <div>
                <h1 className="font-playfair text-2xl font-bold text-gray-900">
                  Darwaish<sup className="text-xs align-super">®</sup>
                </h1>
                <p className="text-xs text-gray-600 -mt-1">Sacred Oil for Muscle Revival</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-gray-700 hover:text-amber-700 font-medium transition-colors relative group"
                >
                  {item.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-amber-700 group-hover:w-full transition-all duration-300" />
                </a>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center space-x-4">
              <button className="hidden md:block p-2 hover:bg-amber-50 rounded-full transition-colors">
                <Search className="w-5 h-5 text-gray-700" />
              </button>
              <button className="p-2 hover:bg-amber-50 rounded-full transition-colors">
                <User className="w-5 h-5 text-gray-700" />
              </button>
              <button className="p-2 hover:bg-amber-50 rounded-full transition-colors relative">
                <ShoppingBag className="w-5 h-5 text-gray-700" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-700 text-white text-xs rounded-full flex items-center justify-center">
                  0
                </span>
              </button>
              <button
                className="md:hidden p-2"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6 text-gray-700" />
                ) : (
                  <Menu className="w-6 h-6 text-gray-700" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-20 left-0 right-0 bg-white shadow-lg z-40 md:hidden overflow-hidden"
          >
            <div className="container mx-auto px-4 py-6">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="block py-3 px-4 text-gray-700 hover:bg-amber-50 rounded-lg font-medium transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center space-x-2">
                  <button className="flex-1 bg-amber-700 text-white py-3 rounded-lg font-medium hover:bg-amber-800 transition-colors">
                    Shop Now
                  </button>
                  <button className="flex-1 border border-amber-700 text-amber-700 py-3 rounded-lg font-medium hover:bg-amber-50 transition-colors">
                    Learn More
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}