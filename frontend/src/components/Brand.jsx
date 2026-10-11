import { COLLECTION_NAMES } from '../api.js'

export function Hanger({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6a5 5 0 0 1 5 5c0 3.2-3.4 4.2-5 6.5" fill="none" stroke="#c9a227" strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M24 17.5 5 35.5c-1.2 1.2-.4 3.2 1.3 3.2h35.4c1.7 0 2.5-2 1.3-3.2z"
        fill="none"
        stroke="#c9a227"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="logo">
      <Hanger />
      <span className="wordmark">Style</span>
    </span>
  )
}

const COLOUR_HEX = {
  Champagne: '#ead9bd', Black: '#2b2b2b', Cream: '#f3ead8', Camel: '#c19a6b', Sand: '#d9c3a0',
  Ivory: '#f6f1e4', Sage: '#a9b79a', Oat: '#d8c9b0', Charcoal: '#4a4a4a', 'Soft Grey': '#c7c5c1',
  White: '#fafafa', Blush: '#efcfc8', Stone: '#bdb5a6', Navy: '#26324d',
}
export const hexFor = (colour) => COLOUR_HEX[colour] || '#e8dcc6'

// Stand-in for product photography until real photos are uploaded.
export function ProductImage({ colour, collection, name }) {
  const base = hexFor(colour)
  const dark = ['Black', 'Charcoal', 'Navy'].includes(colour)
  return (
    <div
      className="product-image"
      role="img"
      aria-label={`${name} in ${colour || 'neutral tones'} (photo coming soon)`}
      style={{ background: `linear-gradient(160deg, ${base}, #f7f1e6 140%)` }}
    >
      <Hanger size={44} />
      <span style={{ color: dark ? '#f7f1e6' : '#6b5a2a' }}>{COLLECTION_NAMES[collection]}</span>
    </div>
  )
}
