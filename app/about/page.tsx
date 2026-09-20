import { Leaf, Heart, Target, Users, Clock, MapPin } from 'lucide-react'
import Image from 'next/image'

export default function AboutPage() {
  return (
    <div className="pt-24 pb-32">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-emerald-50 py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 mb-8">
              <span className="text-3xl">🧭</span>
            </div>
            <h1 className="font-playfair text-5xl md:text-7xl font-bold text-gray-900 mb-6">
              Our Sacred <span className="text-amber-700">Journey</span>
            </h1>
            <p className="text-2xl text-gray-600 max-w-3xl mx-auto">
              The story of Darwaish is one of ancestral wisdom, spiritual healing, 
              and a commitment to reviving motion as a divine gift.
            </p>
          </div>
        </div>
      </section>

      {/* Origin Story */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-100 text-amber-800 mb-6">
                <span className="mr-2">🧬</span>
                <span className="font-medium">The Origin</span>
              </div>
              <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-8">
                A Gift From Master to Disciple
              </h2>
              <div className="space-y-6 text-lg text-gray-700">
                <p>
                  Passed down through generations, Darwaish is not just an oil — it's a 
                  sacred formula gifted to my father by his teacher, a wise healer who 
                  believed that <span className="font-semibold text-amber-700">motion is divine, and stagnation is suffering</span>.
                </p>
                <p>
                  This master, a Sufi mystic and herbalist, spent decades refining 
                  this blend of traditional herbs and essential oils, imbuing it with 
                  deep spiritual intention to not only treat the body but also nourish 
                  the soul.
                </p>
                <blockquote className="border-l-4 border-amber-600 pl-6 py-2 italic text-2xl font-playfair text-gray-800">
                  "Healing begins when we honor the body as a temple and movement as prayer."
                </blockquote>
              </div>
            </div>
            <div className="order-1 lg:order-2 relative">
              <div className="relative h-[500px] rounded-3xl overflow-hidden shadow-2xl">
                {/* Placeholder for image */}
                <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-emerald-100 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-48 h-48 mx-auto mb-6 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 shadow-2xl flex items-center justify-center">
                      <span className="text-white text-6xl">🫙</span>
                    </div>
                    <p className="text-amber-900 font-medium text-lg">The Original Formula</p>
                  </div>
                </div>
              </div>
              <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full bg-emerald-200/30 blur-2xl" />
              <div className="absolute -bottom-6 -right-6 w-40 h-40 rounded-full bg-amber-200/30 blur-2xl" />
            </div>
          </div>

          {/* Mission & Values */}
          <div className="grid md:grid-cols-3 gap-8 mb-24">
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-amber-700" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h3>
              <p className="text-gray-600">
                To bring ancestral healing wisdom to modern lives, reviving not just 
                muscles but the spirit of movement and freedom in every body.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 flex items-center justify-center mb-6">
                <Heart className="w-7 h-7 text-amber-700" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Our Promise</h3>
              <p className="text-gray-600">
                100% herbal purity, small-batch craftsmanship, and the same spiritual 
                intention that guided the original formula.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-amber-100 to-emerald-100 flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-amber-700" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Our Community</h3>
              <p className="text-gray-600">
                Building a global family of individuals committed to natural healing 
                and rediscovering their body's potential.
              </p>
            </div>
          </div>

          {/* Craftsmanship Process */}
          <div className="bg-gradient-to-r from-amber-50 to-emerald-50 rounded-3xl p-12">
            <div className="text-center mb-16">
              <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                The <span className="text-amber-700">Art</span> of Creation
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Each bottle of Darwaish is created through a meticulous process that 
                honors both tradition and quality.
              </p>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                {
                  step: "01",
                  title: "Herb Selection",
                  description: "Each herb is hand-selected at peak potency from trusted sources.",
                  icon: "🌿"
                },
                {
                  step: "02",
                  title: "Solar Infusion",
                  description: "Herbs are solar-infused in organic oils for 40 days.",
                  icon: "☀️"
                },
                {
                  step: "03",
                  title: "Sacred Blending",
                  description: "The master formula is blended with intention and prayer.",
                  icon: "🙏"
                },
                {
                  step: "04",
                  title: "Quality Blessing",
                  description: "Each batch is blessed and tested before shipping.",
                  icon: "✨"
                }
              ].map((process, index) => (
                <div key={index} className="text-center">
                  <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl mx-auto mb-6">
                    {process.icon}
                  </div>
                  <div className="text-sm text-amber-700 font-bold mb-2">STEP {process.step}</div>
                  <h4 className="text-xl font-bold text-gray-900 mb-3">{process.title}</h4>
                  <p className="text-gray-600">{process.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Founder's Message */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                A Message From <span className="text-amber-700">The Keeper</span>
              </h2>
              <div className="h-1 w-24 bg-gradient-to-r from-amber-600 to-emerald-600 mx-auto" />
            </div>
            
            <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-3xl p-12">
              <div className="flex items-start space-x-6 mb-8">
                <div className="w-24 h-24 rounded-full bg-gradient-to-r from-amber-200 to-emerald-200 flex items-center justify-center">
                  <span className="text-4xl">🧔</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Ahmed Al-Darwaish</h3>
                  <p className="text-amber-700 font-medium">Keeper of the Formula</p>
                  <p className="text-gray-600 mt-2">Son of the original disciple, continuing the legacy</p>
                </div>
              </div>
              
              <div className="space-y-6 text-lg text-gray-700">
                <p>
                  When my father first shared this formula with me, he didn't just 
                  give me a recipe—he entrusted me with a legacy. He spoke of his 
                  teacher's hands, weathered from years of healing, yet gentle as 
                  they prepared each batch.
                </p>
                <p>
                  <span className="font-semibold text-amber-700">"This oil," he told me, "is not medicine. It's a conversation 
                  between the earth's gifts and the body's wisdom."</span>
                </p>
                <p>
                  For years, we shared Darwaish only with our immediate community. 
                  But as I witnessed more people suffering from stiffness, pain, and 
                  loss of mobility—often from modern lifestyles disconnected from 
                  natural healing—I knew this wisdom needed to travel further.
                </p>
                <p>
                  Today, I prepare each batch with the same reverence my father 
                  taught me. I speak the same prayers, follow the same lunar cycles 
                  for harvesting, and maintain the strict purity standards that 
                  have defined Darwaish for generations.
                </p>
                <p className="text-2xl font-playfair italic text-gray-800 pt-6 border-t border-amber-200">
                  "Your healing journey begins with the first drop. May it restore 
                  not just movement, but joy in motion."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Commitment Section */}
      <section className="py-24 bg-gradient-to-b from-amber-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Our <span className="text-amber-700">Commitments</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                The principles that guide every aspect of Darwaish
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: <Leaf className="w-8 h-8" />,
                  title: "Herbal Purity",
                  description: "No synthetic ingredients, ever. Only what grows from the earth.",
                  color: "text-emerald-600"
                },
                {
                  icon: <Clock className="w-8 h-8" />,
                  title: "Traditional Timing",
                  description: "Harvesting and preparation aligned with natural cycles.",
                  color: "text-amber-600"
                },
                {
                  icon: <Heart className="w-8 h-8" />,
                  title: "Spiritual Intention",
                  description: "Every batch prepared with prayer and healing intention.",
                  color: "text-red-500"
                },
                {
                  icon: <MapPin className="w-8 h-8" />,
                  title: "Ethical Sourcing",
                  description: "Supporting small-scale herb growers worldwide.",
                  color: "text-blue-600"
                }
              ].map((commitment, index) => (
                <div key={index} className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                  <div className={`${commitment.color} mb-6`}>{commitment.icon}</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{commitment.title}</h3>
                  <p className="text-gray-600">{commitment.description}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-20 text-center">
              <div className="bg-gradient-to-r from-amber-100 to-emerald-100 rounded-2xl p-8 max-w-3xl mx-auto">
                <h3 className="font-playfair text-3xl font-bold text-gray-900 mb-6">
                  Join Our Healing Journey
                </h3>
                <p className="text-xl text-gray-700 mb-8">
                  When you choose Darwaish, you're not just purchasing an oil. 
                  You're becoming part of a centuries-old tradition of natural healing.
                </p>
                <button className="bg-gradient-to-r from-amber-700 to-amber-800 text-white px-10 py-4 rounded-xl font-bold text-lg hover:shadow-2xl transition-all">
                  Experience the Legacy
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}