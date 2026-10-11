import { Link } from 'react-router-dom'
import { kes } from '../api.js'
import { useCart } from '../cart.jsx'

export default function Cart() {
  const cart = useCart()

  if (cart.items.length === 0) {
    return (
      <div className="container section">
        <h1>Your cart</h1>
        <p className="muted">Your cart is empty.</p>
        <Link className="btn" to="/shop/women">Start shopping</Link>
      </div>
    )
  }

  return (
    <div className="container section">
      <h1>Your cart</h1>
      <div className="cart-list">
        {cart.items.map((i) => (
          <div className="cart-row" key={i.variant_id}>
            <div>
              <Link to={`/product/${i.slug}`}><strong>{i.name}</strong></Link>
              <p className="muted small">{i.colour} · {i.size}</p>
              {i.fulfilment === 'supplier' && <p className="muted small">Supplier-fulfilled: dispatch estimate confirmed after payment</p>}
            </div>
            <div className="cart-controls">
              <button className="step" onClick={() => cart.setQuantity(i.variant_id, i.quantity - 1)} aria-label="Decrease">−</button>
              <span>{i.quantity}</span>
              <button className="step" onClick={() => cart.setQuantity(i.variant_id, i.quantity + 1)} aria-label="Increase">+</button>
            </div>
            <div className="price">{kes(i.price * i.quantity)}</div>
            <button className="link" onClick={() => cart.remove(i.variant_id)}>Remove</button>
          </div>
        ))}
      </div>
      <div className="summary">
        <p>Subtotal <strong>{kes(cart.subtotal)}</strong></p>
        <p className="muted small">Delivery and discounts are calculated at checkout, before you pay.</p>
        <Link className="btn" to="/checkout">Checkout</Link>
      </div>
    </div>
  )
}
