import { computed, ref } from 'vue'

import type {
  MarketplaceCategoryId,
  MarketplaceDraft,
  MarketplaceListing,
  MarketplacePurchase,
  MarketplaceSortKey,
  MarketplaceView,
} from './types'

type UseMarketplaceOptions = {
  createListing: (draft: MarketplaceDraft) => MarketplaceListing | null
  initialListings: MarketplaceListing[]
  initialPurchases: MarketplacePurchase[]
  onCreateListing: (listing: MarketplaceListing) => void
  onFavoriteOpen: () => void
  onHistoryOpen: () => void
  onListingFavorite: (listing: MarketplaceListing, favorited: boolean) => void
  onListingOpen: (listing: MarketplaceListing) => void
}

function createDefaultDraft(): MarketplaceDraft {
  return {
    category: 'items',
    title: '',
    price: '',
    placementPrice: '500',
    description: '',
  }
}

export function useMarketplace(options: UseMarketplaceOptions) {
  const marketplacePurchases = ref<MarketplacePurchase[]>(options.initialPurchases)
  const marketplaceListings = ref<MarketplaceListing[]>(options.initialListings)
  const marketplaceView = ref<MarketplaceView>('home')
  const marketplaceCategory = ref<MarketplaceCategoryId | 'all'>('all')
  const marketplaceSort = ref<MarketplaceSortKey>('popular')
  const marketplaceSearch = ref('')
  const selectedMarketplaceListingId = ref<string | null>(null)
  const marketplaceDraft = ref<MarketplaceDraft>(createDefaultDraft())

  const selectedMarketplaceListing = computed(() =>
    marketplaceListings.value.find((listing) => listing.id === selectedMarketplaceListingId.value) ?? null,
  )
  const favoriteMarketplaceListings = computed(() => marketplaceListings.value.filter((listing) => listing.favorited))
  const marketplaceListingsSource = computed(() =>
    marketplaceView.value === 'favorites' ? favoriteMarketplaceListings.value : marketplaceListings.value,
  )
  const filteredMarketplaceListings = computed(() => {
    const normalizedSearch = marketplaceSearch.value.trim().toLowerCase()

    return marketplaceListingsSource.value.filter((listing) => {
      const categoryMatches = marketplaceCategory.value === 'all' || listing.category === marketplaceCategory.value
      const searchMatches = !normalizedSearch
        || listing.title.toLowerCase().includes(normalizedSearch)
        || listing.description.toLowerCase().includes(normalizedSearch)
        || listing.seller.toLowerCase().includes(normalizedSearch)

      return categoryMatches && searchMatches
    })
  })
  const sortedMarketplaceListings = computed(() => {
    const listings = [...filteredMarketplaceListings.value]

    return listings.sort((left, right) => {
      switch (marketplaceSort.value) {
        case 'priceAsc':
          return left.price - right.price
        case 'priceDesc':
          return right.price - left.price
        case 'newest':
          return right.createdAt - left.createdAt
        case 'expiresSoon':
          return left.expiresAt - right.expiresAt
        case 'popular':
        default:
          return (right.likes + right.views) - (left.likes + left.views)
      }
    })
  })
  const marketplaceStats = computed(() => ({
    active: marketplaceListings.value.length,
    favorites: favoriteMarketplaceListings.value.length,
    purchases: marketplacePurchases.value.length,
  }))

  function setMarketplaceView(view: MarketplaceView) {
    marketplaceView.value = view

    if (view !== 'detail') {
      selectedMarketplaceListingId.value = null
    }

    if (view === 'favorites') {
      options.onFavoriteOpen()
    }

    if (view === 'history') {
      options.onHistoryOpen()
    }
  }

  function openMarketplaceListing(listing: MarketplaceListing) {
    selectedMarketplaceListingId.value = listing.id
    marketplaceView.value = 'detail'
    marketplaceListings.value = marketplaceListings.value.map((item) =>
      item.id === listing.id
        ? { ...item, views: item.views + 1 }
        : item,
    )
    options.onListingOpen(listing)
  }

  function toggleMarketplaceFavorite(listing: MarketplaceListing, event?: Event) {
    event?.stopPropagation()
    const nextFavorited = !listing.favorited

    marketplaceListings.value = marketplaceListings.value.map((item) => {
      if (item.id !== listing.id) {
        return item
      }

      return {
        ...item,
        favorited: nextFavorited,
        likes: Math.max(0, item.likes + (nextFavorited ? 1 : -1)),
      }
    })
    options.onListingFavorite(listing, nextFavorited)
  }

  function resetMarketplaceDraft() {
    marketplaceDraft.value = createDefaultDraft()
  }

  function resetMarketplaceView() {
    marketplaceView.value = 'home'
    marketplaceCategory.value = 'all'
    marketplaceSort.value = 'popular'
    marketplaceSearch.value = ''
    selectedMarketplaceListingId.value = null
  }

  function setMarketplaceListings(listings: MarketplaceListing[]) {
    marketplaceListings.value = listings

    if (selectedMarketplaceListingId.value && !listings.some((listing) => listing.id === selectedMarketplaceListingId.value)) {
      selectedMarketplaceListingId.value = null
      marketplaceView.value = 'home'
    }
  }

  function setMarketplacePurchases(purchases: MarketplacePurchase[]) {
    marketplacePurchases.value = purchases
  }

  function submitMarketplaceListing() {
    const listing = options.createListing(marketplaceDraft.value)

    if (!listing) {
      return
    }

    marketplaceListings.value = [listing, ...marketplaceListings.value]
    options.onCreateListing(listing)
    resetMarketplaceDraft()
    openMarketplaceListing(listing)
  }

  return {
    marketplaceCategory,
    marketplaceDraft,
    marketplaceListings,
    marketplacePurchases,
    marketplaceSearch,
    marketplaceSort,
    marketplaceStats,
    marketplaceView,
    openMarketplaceListing,
    resetMarketplaceDraft,
    resetMarketplaceView,
    selectedMarketplaceListing,
    selectedMarketplaceListingId,
    setMarketplaceListings,
    setMarketplacePurchases,
    setMarketplaceView,
    sortedMarketplaceListings,
    submitMarketplaceListing,
    toggleMarketplaceFavorite,
  }
}
