import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, kes, COLLECTION_NAMES, STATUS_LABELS } from '../api.js'

// Simple order desk for the STYLE team, protected by the ADMIN_TOKEN set on the server.
// Three tabs: Orders (what was ordered), Payments (money in, problems to resolve), Add product (the listing).

const STATUS_CHOICES = ['processing', 'dispatched', 'delivered', 'cancelled', 'refunded']
const FILTERS = [
  ['all', 'All'],
  ['paid', 'Paid'],
  ['processing', 'Processing'],
  ['dispatched', 'Dispatched'],
  ['delivered', 'Delivered'],
  ['payment_review', 'Under review'],
  ['pending_payment', 'Awaiting payment'],
  ['payment_failed', 'Failed'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
]

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '–')
const Status = ({ value }) => <span className="status" data-status={value}>{STATUS_LABELS[value] || value}</span>

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('style-admin') || '')
  const [signedIn, setSignedIn] = useState(false)
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const headers = { 'X-Admin-Token': token }
    try {
      const [o, s] = await Promise.all([api('/admin/orders', { headers }), api('/admin/summary', { headers })])
      setOrders(o)
      setSummary(s)
      setSignedIn(true)
      setError('')
      sessionStorage.setItem('style-admin', token)
    } catch (e) {
      setSignedIn(false)
      setError(e.status === 401 ? 'That token is not correct.' : e.message)
    }
  }, [token])

  // Runs an admin action, then refreshes everything so the numbers always match the database.
  const act = async (fn) => {
    try {
      await fn({ 'X-Admin-Token': token })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const needAttention = orders.filter((o) => o.status === 'payment_review').length

  return (
    <div className="container section">
      <h1>Order desk</h1>

      {!signedIn && (
        <div className="panel">
          <p className="muted small">Enter the admin token set on the server (ADMIN_TOKEN).</p>
          <form className="code-row" onSubmit={(e) => { e.preventDefault(); load() }}>
            <input type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn">Open</button>
          </form>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      {signedIn && (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'orders'} className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
              Orders ({orders.length})
            </button>
            <button role="tab" aria-selected={tab === 'payments'} className={`tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>
              Payments {needAttention > 0 && <span className="alert-dot">{needAttention}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'products'} className={`tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
              Add product
            </button>
            <button className="link tab-refresh" onClick={load}>Refresh</button>
          </div>

          {tab === 'orders' && (
            <OrdersTab
              orders={orders}
              onUpdate={(ref, body) => act((h) => api(`/admin/orders/${ref}`, { method: 'PATCH', body, headers: h }))}
              onGoPayments={() => setTab('payments')}
            />
          )}
          {tab === 'payments' && (
            <PaymentsTab
              summary={summary}
              orders={orders}
              onResolve={(ref, body) => act((h) => api(`/admin/orders/${ref}/resolve-payment`, { method: 'POST', body, headers: h }))}
            />
          )}
          {tab === 'products' && <ProductsTab token={token} onError={setError} />}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Orders */
function OrdersTab({ orders, onUpdate, onGoPayments }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(
      (o) =>
        (filter === 'all' || o.status === filter) &&
        (!q || [o.reference, o.customer_name, o.phone, o.email].some((v) => (v || '').toLowerCase().includes(q))),
    )
  }, [orders, filter, search])

  const changeStatus = (o, status) => {
    if (!status) return
    if (status === 'refunded') {
      const ref = window.prompt('Refund reference from Paystack (leave blank if you do not have it yet):', '')
      if (ref === null) return
      return onUpdate(o.reference, { status, refund_reference: ref })
    }
    if (status === 'cancelled' && !window.confirm('Cancel this order and return the items to stock?')) return
    onUpdate(o.reference, { status })
  }

  return (
    <>
      <div className="filters">
        <label>Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <label>Search
          <input placeholder="Reference, name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {shown.length === 0 && <p className="muted">{orders.length === 0 ? 'No orders yet.' : 'No orders match.'}</p>}

      <div className="admin-list">
        {shown.map((o) => {
          const closed = ['cancelled', 'refunded'].includes(o.status)
          const supplierItems = o.items.filter((i) => i.fulfilment === 'supplier')
          return (
            <div className="panel" key={o.reference}>
              <div className="order-head">
                <strong>{o.reference}</strong>
                <Status value={o.status} />
                <span className="muted small">{when(o.created_at)}</span>
                <strong className="push-right">{kes(o.total)}</strong>
              </div>

              <ul className="order-items">
                {o.items.map((i) => (
                  <li key={i.sku}>
                    <strong>{i.quantity}×</strong> {i.product_name} <span className="muted">({i.colour}, {i.size})</span>
                    {i.fulfilment === 'supplier' && <span className="tag">supplier</span>}
                  </li>
                ))}
              </ul>

              <p className="small">
                {o.customer_name} · {o.phone} · {o.email}<br />
                {o.address}, {o.town}, {o.county}
              </p>
              {supplierItems.length > 0 && !closed && o.paid_at && (
                <p className="small notice">Supplier check needed: confirm {supplierItems.length === 1 ? 'this item is' : 'these items are'} available before dispatching.</p>
              )}
              {o.status === 'payment_review' && (
                <p className="small notice">The payment did not match this order. <button className="link" onClick={onGoPayments}>Review it in Payments</button>.</p>
              )}
              {o.refund_reference && <p className="small">Refund reference: <strong>{o.refund_reference}</strong></p>}

              {o.paid_at && !closed && (
                <div className="code-row">
                  <select value="" onChange={(e) => changeStatus(o, e.target.value)} aria-label="Change status">
                    <option value="">Change status…</option>
                    {STATUS_CHOICES.filter((s) => s !== o.status).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    placeholder="Courier tracking number"
                    defaultValue={o.tracking_number || ''}
                    onBlur={(e) => e.target.value !== (o.tracking_number || '') && onUpdate(o.reference, { tracking_number: e.target.value })}
                  />
                </div>
              )}

              <details>
                <summary className="small">History</summary>
                {o.events.map((ev, i) => <p className="small muted" key={i}>{when(ev.at)} · {ev.kind} · {ev.detail}</p>)}
              </details>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Payments */
function PaymentsTab({ summary, orders, onResolve }) {
  const rows = useMemo(
    () => [...orders].sort((a, b) => (b.status === 'payment_review') - (a.status === 'payment_review')),
    [orders],
  )

  const resolve = (ref, action) => {
    const note = window.prompt(
      action === 'approve'
        ? 'Only approve after you have checked the payment in your Paystack dashboard. Add a note:'
        : 'Reason for rejecting this payment:',
      '',
    )
    if (note === null) return
    onResolve(ref, { action, note })
  }

  const cards = summary && [
    ['Collected', kes(summary.collected), 'Paid orders, not refunded'],
    ['Refunded', kes(summary.refunded), 'Orders marked refunded'],
    ['Paid orders', summary.paid_orders, ''],
    ['Awaiting payment', summary.pending, ''],
    ['Failed', summary.failed, ''],
    ['Under review', summary.under_review, 'Need a decision'],
  ]

  return (
    <>
      <p className="muted small">
        Orders turn to Paid by themselves once Paystack confirms the right amount. Only payments that do not match need a person.
      </p>
      {cards && (
        <div className="cards">
          {cards.map(([label, value, hint]) => (
            <div className="stat" key={label} data-alert={label === 'Under review' && summary.under_review > 0}>
              <span className="muted small">{label}</span>
              <strong>{value}</strong>
              {hint && <span className="muted small">{hint}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Reference</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Paid</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="6" className="muted">No payments yet.</td></tr>}
            {rows.map((o) => (
              <tr key={o.reference}>
                <td>{o.reference}<br /><span className="muted small">{o.payment_mode === 'mock' ? 'demo payment' : 'Paystack'}</span></td>
                <td>{o.customer_name}</td>
                <td>{kes(o.total)}</td>
                <td>
                  <Status value={o.status} />
                  {o.refund_reference && <><br /><span className="muted small">Refund {o.refund_reference}</span></>}
                </td>
                <td className="small">{when(o.paid_at)}</td>
                <td>
                  {o.status === 'payment_review' && (
                    <span className="row-actions">
                      <button className="btn btn-small" onClick={() => resolve(o.reference, 'approve')}>Approve</button>
                      <button className="btn btn-small btn-outline" onClick={() => resolve(o.reference, 'reject')}>Reject</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ Add product */
const BLANK = { name: '', collection: 'women', price: '', cost: '', description: '', sizes: '', colours: '', fulfilment: 'local', stock: '5' }
const SIZE_HINT = { women: 'S, M, L, XL', mama: 'S, M, L, XL', kids: '0-3M, 3-6M, 1-2Y', sets: 'Mum M + Girl 2-3Y' }

function ProductsTab({ token, onError }) {
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(null)
  const [listing, setListing] = useState([])

  const refresh = useCallback(() => api('/products').then(setListing).catch(() => {}), [])
  useEffect(() => { refresh() }, [refresh])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    onError('')
    setAdded(null)
    try {
      const body = { ...form, price: Number(form.price), cost: form.cost === '' ? null : Number(form.cost), stock: Number(form.stock || 0) }
      const created = await api('/admin/products', { method: 'POST', body, headers: { 'X-Admin-Token': token } })
      setAdded(created)
      setForm({ ...BLANK, collection: form.collection })
      refresh()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-grid">
      <form className="checkout-form" onSubmit={submit}>
        <h3>Add to the listing</h3>
        <label>Name<input required value={form.name} onChange={set('name')} placeholder="e.g. Linen Wrap Skirt" /></label>
        <label>Collection
          <select value={form.collection} onChange={set('collection')}>
            {Object.entries(COLLECTION_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div className="two">
          <label>Price (KES)<input required inputMode="numeric" value={form.price} onChange={set('price')} placeholder="2900" /></label>
          <label>Cost (KES, optional)<input inputMode="numeric" value={form.cost} onChange={set('cost')} placeholder="1600" /></label>
        </div>
        <label>Description<textarea rows="3" value={form.description} onChange={set('description')} /></label>
        <label>Sizes (separate with commas)<input required value={form.sizes} onChange={set('sizes')} placeholder={SIZE_HINT[form.collection]} /></label>
        <label>Colours (separate with commas)<input required value={form.colours} onChange={set('colours')} placeholder="Sand, Black" /></label>
        <div className="two">
          <label>Fulfilment
            <select value={form.fulfilment} onChange={set('fulfilment')}>
              <option value="local">Held in our stock</option>
              <option value="supplier">Supplier-fulfilled</option>
            </select>
          </label>
          <label>Stock per size/colour
            <input inputMode="numeric" disabled={form.fulfilment === 'supplier'} value={form.fulfilment === 'supplier' ? '' : form.stock} onChange={set('stock')} />
          </label>
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add product'}</button>
        {added && (
          <p className="notice">
            Added <strong>{added.name}</strong> with {added.variants.length} size/colour options.{' '}
            <Link to={`/product/${added.slug}`}>View it in the shop</Link>
          </p>
        )}
        <p className="muted small">Each size and colour gets its own SKU and stock count. Product photos can be added later.</p>
      </form>

      <div>
        <h3>Current listing ({listing.length})</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Collection</th><th>Price</th><th>Options</th></tr></thead>
            <tbody>
              {listing.map((p) => (
                <tr key={p.slug}>
                  <td><Link to={`/product/${p.slug}`}>{p.name}</Link>{!p.in_stock && <span className="tag">sold out</span>}</td>
                  <td className="small">{p.collection_label}</td>
                  <td>{kes(p.price)}</td>
                  <td className="small">{p.sizes.length * p.colours.length} · {p.fulfilment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
