import { Link } from 'react-router-dom'
import { kes } from '../api.js'
import { ProductImage } from './Brand.jsx'

export default function ProductCard({ product }) {
  return (
    <Link to={`/product/${product.slug}`} className="card">
      <ProductImage colour={product.colours[0]} collection={product.collection} name={product.name} />
      <div className="card-body">
        <p className="eyebrow">{product.collection_label}</p>
        <h3>{product.name}</h3>
        <p className="price">{kes(product.price)}</p>
        {!product.in_stock && <p className="muted small">Sold out</p>}
      </div>
    </Link>
  )
}
