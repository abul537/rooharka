import { Heart, Mail, Phone, MapPin } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-gray-900 to-gray-950 text-white pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          {/* Brand Column */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-amber-600 to-amber-800 flex items-center justify-center">
                <span className="text-white font-bold text-2xl">D</span>
              </div>
              <div>
                <h2 className="font-playfair text-3xl font-bold">
                  Darwaish<sup className="text-sm align-super">®</sup>
                </h2>
                <p className="text-amber-200">Sacred Oil for Muscle Revival</p>
              </div>
            </div>
            <p className="text-gray-300 mb-6 max-w-md">
              Rooted in Sufi humility, made with herbal purity, and guided by ancestral 
              wisdom — healing for the body and peace for the soul.
            </p>
            <div className="flex space-x-4">
              {['Instagram', 'Facebook', 'YouTube'].map((social) => (
                <a
                  key={social}
                  href="#"
                  className="w-10 h-10 rounded-full bg-gray-800 hover:bg-amber-700 flex items-center justify-center transition-colors"
                  aria-label={social}
                >
                  {social.charAt(0)}
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold mb-6 text-amber-200">Quick Links</h3>
            <ul className="space-y-3">
              {['Our Story', 'Ingredients', 'Benefits', 'How to Use', 'FAQs', 'Contact'].map(
                (item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-gray-300 hover:text-amber-300 transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-bold mb-6 text-amber-200">Contact</h3>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3">
                <Mail className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                <span className="text-gray-300">support@darwaish.com</span>
              </li>
              <li className="flex items-start space-x-3">
                <Phone className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                <span className="text-gray-300">+1 (555) 123-4567</span>
              </li>
              <li className="flex items-start space-x-3">
                <MapPin className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                <span className="text-gray-300">
                  Handcrafted in Small Batches<br />
                  Worldwide Shipping
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm mb-4 md:mb-0">
              © {new Date().getFullYear()} Darwaish®. All rights reserved.
              <span className="mx-2">•</span>
              Sacred Oil for Muscle Revival
            </p>
            <div className="flex items-center space-x-6 text-sm text-gray-400">
              <a href="#" className="hover:text-amber-300 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-amber-300 transition-colors">
                Terms of Service
              </a>
              <a href="#" className="hover:text-amber-300 transition-colors">
                Disclaimer
              </a>
            </div>
          </div>
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm flex items-center justify-center">
              Made with <Heart className="w-4 h-4 text-red-500 mx-1" /> and ancestral wisdom
              <span className="mx-2">•</span>
              Not FDA evaluated. Consult your physician.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}