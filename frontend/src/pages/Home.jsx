import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import ProductCard from '../components/ProductCard.jsx'

// Curated until there is real sales data to rank by.
const BESTSELLER_SLUGS = ['champagne-wrap-dress', 'soft-lounge-set', 'cotton-baby-romper', 'tailored-wide-leg-trousers']

export default function Home() {
  const [fresh, setFresh] = useState([])
  const [best, setBest] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/products?sort=new'), api('/products')])
      .then(([newest, all]) => {
        setFresh(newest.slice(0, 4))
        setBest(BESTSELLER_SLUGS.map((s) => all.find((p) => p.slug === s)).filter(Boolean))
      })
      .catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <section className="hero">
        <img
          src="/hero.jpg"
          alt="A mother, her toddler daughter and a young woman in cream and camel outfits inside the STYLE boutique"
          width="1672"
          height="941"
          fetchpriority="high"
        />
      </section>
      <section className="container intro">
        <p className="eyebrow">Her Style. Their Style. Your Style.</p>
        <h1>Premium everyday fashion for women, mothers and kids.</h1>
        <div className="cta-row">
          <Link className="btn" to="/shop/women">Shop Women</Link>
          <Link className="btn" to="/shop/mama">Shop Mama</Link>
          <Link className="btn" to="/shop/kids">Shop Kids</Link>
        </div>
        <p className="muted small">Delivery across Kenya · Pay securely online with Paystack · Prices in KES</p>
      </section>

      {error && <p className="container error">{error}. Is the API running?</p>}

      <section className="container section">
        <h2>New arrivals</h2>
        <div className="grid">{fresh.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
      </section>
      <section className="container section">
        <h2>Bestsellers</h2>
        <div className="grid">{best.map((p) => <ProductCard key={p.slug} product={p} />)}</div>
      </section>
      <section className="container section">
        <div className="panel">
          <h2>Matching sets & gifts</h2>
          <p>Mother-and-child looks and curated gifts for the little ones in your life.</p>
          <Link className="btn btn-outline" to="/shop/sets">Explore sets</Link>
        </div>
      </section>
    </>
  )
}
