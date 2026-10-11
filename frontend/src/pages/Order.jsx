import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, kes, STATUS_LABELS } from '../api.js'
import { useCart } from '../cart.jsx'

// This page never decides an order is paid. It asks the server, which asks Paystack.
export default function Order() {
  const { reference } = useParams()
  const cart = useCart()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const tries = useRef(0)

  const verify = useCallback(async () => {
    setChecking(true)
    try {
      const o = await api(`/orders/${reference}/verify`, { method: 'POST' })
      setOrder(o)
      setError('')
      return o
    } catch (e) {
      setError(e.message)
    } finally {
      setChecking(false)
    }
  }, [reference])

  useEffect(() => {
    verify()
  }, [verify])

  useEffect(() => {
    if (order?.status === 'paid') cart.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status])

  // Payment can take a few seconds to settle: re-check a handful of times.
  useEffect(() => {
    if (order?.status !== 'pending_payment' || tries.current >= 5) return
    const t = setTimeout(() => { tries.current += 1; verify() }, 4000)
    return () => clearTimeout(t)
  }, [order, verify])

  if (error && !order) return <div className="container section"><p className="error">{error}</p></div>
  if (!order) return <div className="container section"><p className="muted">Checking your order…</p></div>

  const paid = ['paid', 'processing', 'dispatched', 'delivered'].includes(order.status)

  return (
    <div className="container section narrow">
      {paid && (<><p className="eyebrow">Thank you</p><h1>Order confirmed</h1></>)}
      {order.status === 'pending_payment' && (<><p className="eyebrow">Almost there</p><h1>Waiting for your payment</h1></>)}
      {order.status === 'payment_failed' && (<><p className="eyebrow">Payment problem</p><h1>Payment didn't go through</h1></>)}
      {order.status === 'payment_review' && (<><p className="eyebrow">Under review</p><h1>We're checking your payment</h1></>)}
      {['cancelled', 'refunded'].includes(order.status) && <h1>Order {order.status}</h1>}

      <div className="panel">
        <p>Order reference <strong>{order.reference}</strong></p>
        <p>Status: <strong>{STATUS_LABELS[order.status] || order.status}</strong></p>
        {order.tracking_number && <p>Courier tracking: <strong>{order.tracking_number}</strong></p>}
        {paid && <p>A confirmation will be sent to {order.email}. Supplier-fulfilled items are confirmed with the supplier before dispatch, and we'll update you.</p>}
        {order.status === 'pending_payment' && (
          <p>If you've already paid, this can take a moment to confirm. If you left the payment page, you can place the order again.</p>
        )}
        {order.status === 'payment_review' && <p>The amount we received didn't match your order, so our team will review it. You will not be charged twice.</p>}
      </div>

      <h3>Items</h3>
      {order.items.map((i) => (
        <div className="sum-row" key={i.sku}>
          <span>{i.product_name} <span className="muted small">({i.colour}, {i.size}) × {i.quantity}</span></span>
          <span>{kes(i.unit_price * i.quantity)}</span>
        </div>
      ))}
      <div className="sum-row"><span>Delivery</span><span>{kes(order.delivery_fee)}</span></div>
      {order.discount > 0 && <div className="sum-row"><span>Discount</span><span>− {kes(order.discount)}</span></div>}
      <div className="sum-row total"><span>Total</span><span>{kes(order.total)}</span></div>
      <p className="muted small">Delivering to {order.address}, {order.town}, {order.county}</p>

      <div className="cta-row">
        {order.status === 'pending_payment' && <button className="btn" onClick={verify} disabled={checking}>{checking ? 'Checking…' : 'Check payment again'}</button>}
        {order.status === 'payment_failed' && <Link className="btn" to="/checkout">Try again</Link>}
        <Link className="btn btn-outline" to="/">Continue shopping</Link>
      </div>
    </div>
  )
}
