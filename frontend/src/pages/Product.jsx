import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, kes } from '../api.js'
import { ProductImage, hexFor } from '../components/Brand.jsx'
import { useCart } from '../cart.jsx'

const SIZE_GUIDE = {
  adult: [['S', 'UK 8-10', 'Bust 84-89 cm'], ['M', 'UK 12', 'Bust 92 cm'], ['L', 'UK 14', 'Bust 97 cm'], ['XL', 'UK 16', 'Bust 102 cm']],
  kids: [['0-3M', 'up to 6 kg'], ['3-6M', '6-8 kg'], ['6-12M', '8-10 kg'], ['1-2Y', '80-92 cm'], ['2-3Y', '92-98 cm'], ['4-5Y', '104-110 cm'], ['6-7Y', '116-122 cm']],
}

export default function Product() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const cart = useCart()
  const [product, setProduct] = useState(null)
  const [error, setError] = useState('')
  const [colour, setColour] = useState('')
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    api(`/products/${slug}`)
      .then((p) => {
        setProduct(p)
        setColour(p.colours[0])
      })
      .catch((e) => setError(e.message))
  }, [slug])

  const variant = useMemo(
    () => product?.variants.find((v) => v.size === size && v.colour === colour),
    [product, size, colour],
  )

  if (error) return <div className="container section"><p className="error">{error}</p></div>
  if (!product) return <div className="container section"><p className="muted">Loading…</p></div>

  const sizeAvailable = (s) => product.variants.some((v) => v.size === s && v.colour === colour && v.in_stock)
  const guide = product.collection === 'kids' ? 'kids' : 'adult'

  const addToCart = () => {
    cart.add({
      variant_id: variant.id, slug: product.slug, name: product.name, size: variant.size,
      colour: variant.colour, price: product.price, quantity: qty, fulfilment: variant.fulfilment,
    })
    setAdded(true)
  }

  return (
    <div className="container section product-layout">
      <div className="gallery">
        <ProductImage colour={colour} collection={product.collection} name={product.name} />
        <div className="thumbs">
          {product.colours.map((c) => (
            <button key={c} className={`thumb ${c === colour ? 'active' : ''}`} onClick={() => setColour(c)}
              style={{ background: hexFor(c) }} aria-label={`View ${c}`} title={c} />
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow"><Link to={`/shop/${product.collection}`}>{product.collection_label}</Link></p>
        <h1>{product.name}</h1>
        <p className="price big">{kes(product.price)}</p>
        <p>{product.description}</p>

        <h4>Colour: {colour}</h4>
        <div className="chips">
          {product.colours.map((c) => (
            <button key={c} className={`chip ${c === colour ? 'active' : ''}`} onClick={() => { setColour(c); setSize('') }}>{c}</button>
          ))}
        </div>

        <h4>
          Size {size && `: ${size}`}{' '}
          <button className="link" onClick={() => setShowGuide(!showGuide)}>Size guide</button>
        </h4>
        <div className="chips">
          {product.sizes.map((s) => (
            <button key={s} disabled={!sizeAvailable(s)} className={`chip ${s === size ? 'active' : ''}`} onClick={() => { setSize(s); setAdded(false) }}>{s}</button>
          ))}
        </div>

        {showGuide && (
          <table className="guide">
            <tbody>{SIZE_GUIDE[guide].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
        )}

        <p className="stock">
          {!size && 'Select a size to see availability.'}
          {variant && variant.fulfilment === 'local' && variant.stock > 0 && (variant.stock <= 3 ? `Only ${variant.stock} left. ` : 'In stock. ')}
          {variant && variant.fulfilment === 'local' && variant.stock === 0 && 'Sold out in this size.'}
          {variant && variant.dispatch_estimate && variant.in_stock && variant.dispatch_estimate + '.'}
        </p>

        <div className="qty-row">
          <label>Qty
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
              {Array.from({ length: Math.min(variant?.stock ?? 10, 10) || 1 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn" disabled={!variant || !variant.in_stock} onClick={addToCart}>Add to cart</button>
        </div>
        {added && (
          <p className="notice">
            Added to cart. <Link to="/cart">View cart</Link> or <button className="link" onClick={() => navigate('/checkout')}>checkout now</button>.
          </p>
        )}

        <div className="info-box">
          <p><strong>Delivery:</strong> across Kenya, from KES 250 depending on your area. Shown in full before you pay.</p>
          <p><strong>Returns:</strong> unworn items with tags can be exchanged within 7 days. <Link to="/info/returns">See policy</Link>.</p>
        </div>
      </div>
    </div>
  )
}
