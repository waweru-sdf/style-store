import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, kes } from '../api.js'
import { useCart } from '../cart.jsx'

const EMPTY = { name: '', email: '', phone: '', address: '', town: '', county: '' }

export default function Checkout() {
  const cart = useCart()
  const [zones, setZones] = useState([])
  const [zone, setZone] = useState('nairobi')
  const [form, setForm] = useState(EMPTY)
  const [codeInput, setCodeInput] = useState('')
  const [code, setCode] = useState('')
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [busy, setBusy] = useState(false)

  const items = cart.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }))

  useEffect(() => {
    api('/delivery-zones').then(setZones).catch(() => {})
  }, [])

  // The total shown here is computed by the server, the same way it will be charged.
  useEffect(() => {
    if (items.length === 0) return
    api('/quote', { method: 'POST', body: { items, zone, discount_code: code || null } })
      .then((q) => { setQuote(q); setError(''); setCodeError('') })
      .catch((e) => {
        if (code) { setCodeError(e.message); setCode('') } else { setError(e.message) }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items, zone, code])

  if (cart.items.length === 0) {
    return (
      <div className="container section">
        <h1>Checkout</h1>
        <p className="muted">Your cart is empty.</p>
        <Link className="btn" to="/shop/women">Start shopping</Link>
      </div>
    )
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api('/orders', { method: 'POST', body: { items, zone, discount_code: code || null, customer: form } })
      window.location.assign(res.authorization_url)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="container section checkout">
      <form onSubmit={submit} className="checkout-form">
        <h1>Checkout</h1>
        <h3>Contact</h3>
        <label>Full name<input required value={form.name} onChange={set('name')} autoComplete="name" /></label>
        <label>Email<input required type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Phone<input required inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set('phone')} autoComplete="tel" /></label>
        <h3>Delivery</h3>
        <label>Delivery address<input required value={form.address} onChange={set('address')} autoComplete="street-address" /></label>
        <div className="two">
          <label>Town<input required value={form.town} onChange={set('town')} /></label>
          <label>County<input required value={form.county} onChange={set('county')} /></label>
        </div>
        <label>Delivery area
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.label} · {kes(z.fee)} · {z.eta}</option>)}
          </select>
        </label>
        <button className="btn" disabled={busy || !quote}>{busy ? 'Starting payment…' : `Pay ${quote ? kes(quote.total) : ''} with Paystack`}</button>
        {error && <p className="error">{error}</p>}
        <p className="muted small">You will be taken to Paystack's secure page to pay. Your order is confirmed only after the payment is verified.</p>
      </form>

      <aside className="summary">
        <h3>Order summary</h3>
        {quote && quote.lines.map((l) => (
          <div className="sum-row" key={l.variant_id}>
            <span>{l.product_name} <span className="muted small">({l.colour}, {l.size}) × {l.quantity}</span></span>
            <span>{kes(l.line_total)}</span>
          </div>
        ))}
        <div className="code-row">
          <input placeholder="Discount code" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} />
          <button type="button" className="btn btn-outline" onClick={() => setCode(codeInput.trim())}>Apply</button>
        </div>
        {codeError && <p className="error small">{codeError}</p>}
        {quote && (
          <>
            <div className="sum-row"><span>Subtotal</span><span>{kes(quote.subtotal)}</span></div>
            {quote.discount > 0 && <div className="sum-row"><span>Discount ({quote.discount_code})</span><span>− {kes(quote.discount)}</span></div>}
            <div className="sum-row"><span>Delivery</span><span>{kes(quote.delivery_fee)}</span></div>
            <div className="sum-row total"><span>Total</span><span>{kes(quote.total)}</span></div>
            {quote.lines.some((l) => l.fulfilment === 'supplier') && (
              <p className="muted small">Some items are supplier-fulfilled. Their dispatch time is confirmed after payment and may be longer.</p>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
