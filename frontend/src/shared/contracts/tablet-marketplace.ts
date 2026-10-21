export type TabletMarketplaceCategoryId = 'items' | 'vehicles' | 'realEstate' | 'ads' | 'clothes' | 'businesses'

export type TabletMarketplaceListing = {
  id: string
  title: string
  category: TabletMarketplaceCategoryId
  price: number
  placementPrice: number
  phone: string
  seller: string
  description: string
  image: string
  createdAt: number
  expiresAt: number
  likes: number
  views: number
  favorited: boolean
  purchasable?: boolean
  specs: Array<{ label: string; value: string | number }>
}

export type TabletMarketplacePurchase = {
  id: string
  listingTitle: string
  category: TabletMarketplaceCategoryId
  price: number
  purchasedAt: string
  seller: string
}

export type TabletMarketplaceState = {
  listings?: TabletMarketplaceListing[]
  purchases?: TabletMarketplacePurchase[]
}
