import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, kes } from '../api.js'

// Stand-in for Paystack's hosted checkout. Only works when the API runs in mock mode.
export default function MockPay() {
  const { reference } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/orders/${reference}`).then(setOrder).catch((e) => setError(e.message))
  }, [reference])

  const choose = async (outcome) => {
    try {
      await api(`/mock/pay/${reference}`, { method: 'POST', body: { outcome } })
      navigate(`/order/${reference}`)
    } catch (e) {
      setError(e.message)
    }
  }

  if (error) return <div className="container section"><p className="error">{error}</p></div>
  if (!order) return <div className="container section"><p className="muted">Loading…</p></div>

  return (
    <div className="container section narrow">
      <div className="demo-banner">DEMO MODE · No real money is charged. Add a Paystack test key to use the real checkout.</div>
      <h1>Pay {kes(order.total)}</h1>
      <p className="muted">Order {order.reference}</p>
      <div className="cta-row column">
        <button className="btn" onClick={() => choose('success')}>Simulate successful payment</button>
        <button className="btn btn-outline" onClick={() => choose('failed')}>Simulate failed payment</button>
        <button className="btn btn-outline" onClick={() => choose('abandoned')}>Leave without paying</button>
      </div>
    </div>
  )
}
