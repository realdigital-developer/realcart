'use client'

import { Truck, RotateCcw, ShieldCheck, Headphones } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Why Shop With Us Section                                            */
/*  4 benefit cards in a 2x2 grid (mobile) / 4-col row (desktop).      */
/*  Matches the reference design:                                       */
/*  - Light off-white bg (#f7f6f4)                                     */
/*  - Section title: "Why Shop With Us" (17px, bold, #111111)          */
/*  - Each card: icon + title + description on cream bg (#f0eeec)      */
/*  - Multi-device responsive: 2 cols on mobile, 4 cols on desktop     */
/* ------------------------------------------------------------------ */

const BENEFITS = [
  {
    icon: Truck,
    title: 'Free Shipping',
    description: 'Free delivery on orders above ₹499',
  },
  {
    icon: RotateCcw,
    title: 'Easy Returns',
    description: '7-day return policy',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Pay',
    description: '100% safe payments',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    description: 'Always here to help',
  },
]

export function WhyShopWithUs() {
  return (
    <div
      className="w-full"
      style={{
        backgroundColor: '#f7f6f4',
        paddingTop: 20,
        paddingBottom: 32,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* ── Section Header ── */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '16px 0px 4px' }}
        >
          <span
            style={{
              fontSize: 'clamp(15px, 4vw, 17px)',
              fontWeight: 700,
              color: '#111111',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Why Shop With Us
          </span>
        </div>

        {/* ── Benefit Cards Grid ── */}
        <div
          className="grid gap-3 mt-3"
          style={{
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          }}
        >
          {/* On larger screens, show 4 in a row */}
          <style>{`
            @media (min-width: 640px) {
              .wsu-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
            }
          `}</style>
          <div
            className="wsu-grid grid gap-3 mt-3"
            style={{
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              width: '100%',
            }}
          >
            {BENEFITS.map((benefit, idx) => {
              const Icon = benefit.icon
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center text-center"
                  style={{
                    backgroundColor: '#f0eeec',
                    borderRadius: 20,
                    padding: '20px 12px',
                    gap: 8,
                  }}
                >
                  {/* Icon in a white circle */}
                  <div
                    className="flex items-center justify-center"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      style={{
                        width: 24,
                        height: 24,
                        color: '#2e8b57',
                      }}
                    />
                  </div>
                  {/* Title */}
                  <span
                    style={{
                      fontSize: 'clamp(12px, 3vw, 14px)',
                      fontWeight: 600,
                      color: '#111111',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {benefit.title}
                  </span>
                  {/* Description */}
                  <span
                    style={{
                      fontSize: 'clamp(10px, 2.5vw, 12px)',
                      fontWeight: 400,
                      color: '#949494',
                      fontFamily: 'Inter, sans-serif',
                      lineHeight: 1.4,
                    }}
                  >
                    {benefit.description}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
