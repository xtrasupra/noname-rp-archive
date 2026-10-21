import type { Component } from 'vue'

import type {
  TabletMarketplaceCategoryId,
  TabletMarketplaceListing,
  TabletMarketplacePurchase,
} from '@/shared/contracts/tablet-marketplace'

export type MarketplaceCategoryId = TabletMarketplaceCategoryId
export type MarketplaceView = 'home' | 'favorites' | 'history' | 'create' | 'detail'
export type MarketplaceSortKey = 'popular' | 'priceAsc' | 'priceDesc' | 'newest' | 'expiresSoon'

export type MarketplaceCategory = {
  id: MarketplaceCategoryId
  label: string
  icon: Component
}

export type MarketplaceListing = TabletMarketplaceListing

export type MarketplacePurchase = TabletMarketplacePurchase

export type MarketplaceDraft = {
  category: MarketplaceCategoryId
  title: string
  price: string
  placementPrice: string
  description: string
}
