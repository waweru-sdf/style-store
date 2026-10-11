import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useCart } from '../cart.jsx'
import { Logo } from './Brand.jsx'
import { useEffect } from 'react'

const NAV = [
  ['/shop/women', 'Woman'],
  ['/shop/mama', 'Mama'],
  ['/shop/kids', 'Kids'],
  ['/shop/sets', 'Sets & Gifts'],
]

export default function Layout() {
  const { count } = useCart()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <header className="site-header">
        <div className="container header-row">
          <Link to="/" aria-label="STYLE home">
            <Logo />
          </Link>
          <button className="menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
            {open ? '✕' : '☰'}
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to}>
                {label}
              </NavLink>
            ))}
          </nav>
          <Link to="/cart" className="cart-link" aria-label={`Cart, ${count} items`}>
            Cart <span className="badge">{count}</span>
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Logo />
            <p className="muted">Her Style. Their Style. Your Style.</p>
            <p className="muted small">Delivering across Kenya. All prices in KES.</p>
          </div>
          <div>
            <h4>Shop</h4>
            {NAV.map(([to, label]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </div>
          <div>
            <h4>Help</h4>
            <Link to="/info/delivery">Delivery</Link>
            <Link to="/info/returns">Returns & exchanges</Link>
            <Link to="/info/faq">FAQs</Link>
            <Link to="/info/contact">Contact</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link to="/info/about">About</Link>
            <Link to="/info/privacy">Privacy policy</Link>
            <Link to="/info/terms">Terms</Link>
          </div>
        </div>
        <div className="container small muted footer-bottom">© {new Date().getFullYear()} STYLE E-Fashion House. Secure payments by Paystack.</div>
      </footer>
    </>
  )
}
