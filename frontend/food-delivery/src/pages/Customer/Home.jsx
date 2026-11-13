import React, { useEffect, useState, useContext, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Utensils,
  Star,
  Search,
  XCircle,
  MapPin,
  Clock,
  ClipboardList,
  X,
  Filter,
  Navigation,
  RotateCcw,
} from 'lucide-react';
import API from '../../api/axios';
import { CartContext } from '../../context/CartContext';
import { AuthContext } from '../../context/AuthContext';

// Haversine helper to calculate distance (km) between customer GPS and restaurant
const getDistanceKm = (lat1, lng1, lat2, lng2) => {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0.5, Number((R * c).toFixed(1)));
};

const Home = ({ showOrdersModal = false, setShowOrdersModal }) => {
  const [shops, setShops] = useState([]);
  const [allMenuItems, setAllMenuItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [ratingModalOrder, setRatingModalOrder] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingReview, setRatingReview] = useState('');

  // Restaurant Filter States (Location, Rating, Veg/Non-Veg & GPS Distance)
  const [locationFilter, setLocationFilter] = useState('');
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [dietFilter, setDietFilter] = useState('all'); // 'all' | 'veg' | 'non-veg'
  const [maxDistanceFilter, setMaxDistanceFilter] = useState(0);
  const [sortBy, setSortBy] = useState('default');
  const [userCoords, setUserCoords] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);

  const { addToCart } = useContext(CartContext);
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const closeOrdersModal = () => {
    if (setShowOrdersModal) setShowOrdersModal(false);
  };

  // Step 1: Load approved shops, available menu items, and customer's orders
  const fetchHomeData = async () => {
    try {
      const [shopsRes, menuRes] = await Promise.all([
        API.get('/menu/shops'),
        API.get('/menu'),
      ]);
      const fetchedShops = shopsRes.data || [];
      const fetchedMenu = menuRes.data || [];

      setShops(fetchedShops);
      setAllMenuItems(fetchedMenu);
      setMenuItems(fetchedMenu);

      if (user) {
        const ordersRes = await API.get('/orders/my-orders');
        setMyOrders(ordersRes.data || []);
      }
    } catch (err) {
      console.error('Error loading home data:', err);
    }
  };

  useEffect(() => {
    fetchHomeData();
  }, [user]);

  useEffect(() => {
    if (showOrdersModal && user) {
      API.get('/orders/my-orders')
        .then((res) => setMyOrders(res.data || []))
        .catch(() => {});
    }
  }, [showOrdersModal, user]);

  // Detect customer GPS location for distance filtering & live ₹10/km fee preview
  const handleDetectMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocatingUser(false);
      },
      () => {
        alert('Please allow location access in your browser to filter by distance.');
        setLocatingUser(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Map each restaurant's Veg / Non-Veg offerings from available menu items
  const shopDietMap = useMemo(() => {
    const map = {};
    allMenuItems.forEach((item) => {
      const sId = String(item.shop?._id || item.shop || '');
      if (!sId) return;
      if (!map[sId]) {
        map[sId] = { hasVeg: false, hasNonVeg: false };
      }
      if (item.isVeg === false) {
        map[sId].hasNonVeg = true;
      } else {
        map[sId].hasVeg = true;
      }
    });
    return map;
  }, [allMenuItems]);

  // Extract unique location areas from approved shops for quick dropdown selection
  const availableLocations = useMemo(() => {
    const locSet = new Set();
    shops.forEach((shop) => {
      if (shop.address) {
        const parts = shop.address
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        parts.forEach((part) => {
          if (part.length > 2 && !/^\d+$/.test(part)) {
            locSet.add(part);
          }
        });
      }
    });
    return Array.from(locSet).slice(0, 15);
  }, [shops]);

  // Filter & sort restaurants based on location, rating, Veg/Non-Veg toggle, and GPS distance
  const filteredShops = useMemo(() => {
    return shops
      .map((shop) => {
        const distanceKm = userCoords
          ? getDistanceKm(
              userCoords.lat,
              userCoords.lng,
              Number(shop.location?.lat) || 28.6139,
              Number(shop.location?.lng) || 77.209
            )
          : null;
        const dietInfo = shopDietMap[String(shop._id)] || null;
        return { ...shop, distanceKm, dietInfo };
      })
      .filter((shop) => {
        // 1. Location filter
        if (locationFilter.trim()) {
          const query = locationFilter.toLowerCase().trim();
          const addrMatch = (shop.address || '').toLowerCase().includes(query);
          const nameMatch = (shop.name || '').toLowerCase().includes(query);
          if (!addrMatch && !nameMatch) return false;
        }

        // 2. Minimum Rating filter
        if (minRatingFilter > 0) {
          const rating = Number(shop.rating || 0);
          if (rating < minRatingFilter) return false;
        }

        // 3. Veg / Non-Veg filter
        if (dietFilter === 'veg') {
          if (shop.dietInfo) {
            if (!shop.dietInfo.hasVeg) return false;
          } else {
            const cuisineLower = (shop.cuisine || '').toLowerCase();
            if (cuisineLower.includes('non-veg only') || cuisineLower.includes('non veg only')) {
              return false;
            }
          }
        } else if (dietFilter === 'non-veg') {
          if (shop.dietInfo) {
            if (!shop.dietInfo.hasNonVeg) return false;
          } else {
            const cuisineLower = (shop.cuisine || '').toLowerCase();
            const servesNonVeg =
              cuisineLower.includes('non-veg') ||
              cuisineLower.includes('non veg') ||
              cuisineLower.includes('chicken') ||
              cuisineLower.includes('mutton') ||
              cuisineLower.includes('meat') ||
              cuisineLower.includes('seafood');
            if (!servesNonVeg) return false;
          }
        }

        // 4. Max GPS Distance filter
        if (maxDistanceFilter > 0 && shop.distanceKm !== null) {
          if (shop.distanceKm > maxDistanceFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating_desc') {
          return Number(b.rating || 0) - Number(a.rating || 0);
        }
        if (sortBy === 'distance_asc' && a.distanceKm !== null && b.distanceKm !== null) {
          return a.distanceKm - b.distanceKm;
        }
        return 0;
      });
  }, [
    shops,
    shopDietMap,
    locationFilter,
    minRatingFilter,
    dietFilter,
    maxDistanceFilter,
    sortBy,
    userCoords,
  ]);

  const resetShopFilters = () => {
    setLocationFilter('');
    setMinRatingFilter(0);
    setDietFilter('all');
    setMaxDistanceFilter(0);
    setSortBy('default');
  };

  // Step 2: Select a restaurant to view its menu
  const handleSelectShop = async (shop) => {
    if (shop.isOpen === false) {
      alert(`"${shop.name}" is currently closed.`);
      return;
    }
    setSelectedShop(shop);
    try {
      const { data } = await API.get(`/menu/shops/${shop._id}/menu`);
      setMenuItems(data || []);
    } catch (err) {
      console.error('Error fetching shop menu:', err);
    }
  };

  // Step 3: Cancel order (auto-bans customer after 5 continuous cancellations in 1 day)
  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    try {
      const { data } = await API.put(`/orders/${orderId}/cancel`, {
        reason: 'Cancelled by customer',
      });

      if (data?.autoBanned) {
        alert(
          data.message ||
            'Your account has been automatically banned due to 5 continuous order cancellations in one day. Only the Admin can unban your account.'
        );
        closeOrdersModal();
        await logout();
        navigate('/login');
        return;
      }

      if (data?.message && data.dailyConsecutiveCancels >= 3) {
        alert(data.message);
      }

      fetchHomeData();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not cancel order');
    }
  };

  // Step 4: Submit food quality rating (allowed after order is delivered)
  const handleQuickRateSubmit = async (e) => {
    e.preventDefault();
    if (!ratingModalOrder) return;
    try {
      await API.post(`/orders/${ratingModalOrder._id}/rate`, {
        rating: ratingValue,
        review: ratingReview,
      });
      setRatingModalOrder(null);
      setRatingReview('');
      fetchHomeData();
      alert('Thank you for rating the food quality!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit rating');
    }
  };

  const filteredShopIdSet = useMemo(
    () => new Set(filteredShops.map((s) => String(s._id))),
    [filteredShops]
  );

  const filteredMenu = menuItems.filter((item) => {
    const matchesSearch =
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.category?.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    // Apply Veg / Non-Veg toggle to dishes
    if (dietFilter === 'veg' && item.isVeg === false) return false;
    if (dietFilter === 'non-veg' && item.isVeg !== false) return false;

    if (
      !selectedShop &&
      (locationFilter.trim() ||
        minRatingFilter > 0 ||
        maxDistanceFilter > 0 ||
        dietFilter !== 'all')
    ) {
      const itemShopId = String(item.shop?._id || item.shop || '');
      return filteredShopIdSet.has(itemShopId);
    }

    return true;
  });

  const hasActiveShopFilters =
    Boolean(locationFilter.trim()) ||
    minRatingFilter > 0 ||
    dietFilter !== 'all' ||
    maxDistanceFilter > 0 ||
    sortBy !== 'default';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-8">
      {/* Hero & Search */}
      <div className="bg-linear-to-r from-orange-600 to-amber-500 rounded-3xl p-6 sm:p-10 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <h1 className="text-3xl sm:text-4xl font-black leading-tight">
            Delicious Food, Delivered Fresh to Your Door
          </h1>
          <p className="text-white/90 text-sm">
            Filter restaurants by location, rating, and Veg/Non-Veg preference, track your rider live on the map, and rate your meal quality.
          </p>
        </div>

        <div className="w-full md:w-80 bg-white rounded-2xl p-2 flex items-center shadow-md">
          <Search size={18} className="text-gray-400 ml-2" />
          <input
            type="text"
            placeholder="Search dishes or categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm text-gray-800 focus:outline-none"
          />
        </div>
      </div>

      {/* Restaurants Section */}
      {!selectedShop ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-extrabold text-gray-900">
              Approved Restaurants ({filteredShops.length})
            </h2>

            {hasActiveShopFilters && (
              <button
                type="button"
                onClick={resetShopFilters}
                className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3.5 py-2 rounded-xl cursor-pointer transition"
              >
                <RotateCcw size={14} /> Clear Filters
              </button>
            )}
          </div>

          {/* Restaurant Filter Bar: Location, Rating, Veg/Non-Veg Toggle, Near Me GPS & Sort */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-gray-500">
                <Filter size={14} className="text-orange-600" />
                Filter Restaurants by Location &amp; Rating
              </div>

              {/* Veg & Non-Veg Toggle */}
              <div
                role="group"
                aria-label="Veg and Non-Veg Filter"
                className="inline-flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200"
              >
                <button
                  type="button"
                  onClick={() => setDietFilter('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                    dietFilter === 'all'
                      ? 'bg-gray-900 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDietFilter((prev) => (prev === 'veg' ? 'all' : 'veg'))
                  }
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                    dietFilter === 'veg'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                      dietFilter === 'veg'
                        ? 'border-white bg-white'
                        : 'border-emerald-600 bg-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  </span>
                  Veg
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDietFilter((prev) =>
                      prev === 'non-veg' ? 'all' : 'non-veg'
                    )
                  }
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                    dietFilter === 'non-veg'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-red-700 hover:bg-red-50'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                      dietFilter === 'non-veg'
                        ? 'border-white bg-white'
                        : 'border-red-600 bg-white'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  </span>
                  Non-Veg
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Location Search Input + Datalist */}
              <div className="relative">
                <MapPin
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-600"
                />
                <input
                  type="text"
                  list="restaurant-locations-list"
                  placeholder="Filter by location or area..."
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <datalist id="restaurant-locations-list">
                  {availableLocations.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>

              {/* 2. Minimum Rating Filter */}
              <div>
                <select
                  value={minRatingFilter}
                  onChange={(e) => setMinRatingFilter(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value={0}>All Ratings</option>
                  <option value={4.5}>★ 4.5 &amp; Above</option>
                  <option value={4.0}>★ 4.0 &amp; Above</option>
                  <option value={3.5}>★ 3.5 &amp; Above</option>
                  <option value={3.0}>★ 3.0 &amp; Above</option>
                </select>
              </div>

              {/* 3. GPS Distance Filter */}
              <div className="flex items-center gap-2">
                {!userCoords ? (
                  <button
                    type="button"
                    onClick={handleDetectMyLocation}
                    disabled={locatingUser}
                    className="w-full flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold py-2.5 px-3 rounded-xl text-xs sm:text-sm cursor-pointer transition disabled:opacity-50"
                  >
                    <Navigation size={15} />
                    {locatingUser ? 'Detecting GPS...' : 'Use My GPS for Distance'}
                  </button>
                ) : (
                  <select
                    value={maxDistanceFilter}
                    onChange={(e) => setMaxDistanceFilter(Number(e.target.value))}
                    className="w-full border border-blue-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-blue-900 bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={0}>All Distances (GPS Active)</option>
                    <option value={5}>Within 5 km</option>
                    <option value={10}>Within 10 km</option>
                    <option value={20}>Within 20 km</option>
                  </select>
                )}
              </div>

              {/* 4. Sort Order */}
              <div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="default">Sort By: Default</option>
                  <option value="rating_desc">Rating: High to Low</option>
                  {userCoords && (
                    <option value="distance_asc">Distance: Nearest First</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {filteredShops.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
              <p className="text-gray-600 font-semibold">
                No restaurants match your selected location, rating, or Veg/Non-Veg filters.
              </p>
              <button
                type="button"
                onClick={resetShopFilters}
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredShops.map((shop) => {
                const isShopOpen = shop.isOpen !== false;
                const estDeliveryFee =
                  shop.distanceKm !== null
                    ? Math.max(10, Math.round(shop.distanceKm * 10))
                    : null;

                return (
                  <div
                    key={shop._id}
                    onClick={() => handleSelectShop(shop)}
                    className={`bg-white rounded-2xl border p-5 shadow-sm transition flex flex-col justify-between ${
                      isShopOpen
                        ? 'border-gray-200 hover:shadow-md cursor-pointer'
                        : 'border-gray-200 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-extrabold text-gray-900">
                          {shop.name || shop.shopName}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                              isShopOpen
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {isShopOpen ? 'Open' : 'Closed'}
                          </span>
                          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                            <Star size={12} className="fill-amber-500 text-amber-500" />
                            {shop.rating > 0
                              ? `${shop.rating} (${shop.numReviews})`
                              : 'New'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <MapPin size={13} className="text-orange-600 shrink-0" />{' '}
                        {shop.address}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-orange-600 font-semibold">
                            {shop.cuisine || 'Multi-Cuisine'}
                          </p>
                          {shop.dietInfo && (
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                shop.dietInfo.hasVeg && !shop.dietInfo.hasNonVeg
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : !shop.dietInfo.hasVeg && shop.dietInfo.hasNonVeg
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {shop.dietInfo.hasVeg && !shop.dietInfo.hasNonVeg
                                ? 'Pure Veg'
                                : !shop.dietInfo.hasVeg && shop.dietInfo.hasNonVeg
                                ? 'Non-Veg'
                                : 'Veg & Non-Veg'}
                            </span>
                          )}
                        </div>
                        {shop.distanceKm !== null && (
                          <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full">
                            {shop.distanceKm} km • ₹{estDeliveryFee} Delivery
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span className="text-orange-600 font-bold">
                        {isShopOpen ? 'View Menu →' : 'Currently Closed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={() => {
                setSelectedShop(null);
                setMenuItems(allMenuItems);
                fetchHomeData();
              }}
              className="text-orange-600 font-bold text-sm mb-3 hover:underline cursor-pointer"
            >
              ← Back to All Restaurants
            </button>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
              {selectedShop.name || selectedShop.shopName} — Menu
            </h2>
            <p className="text-xs text-gray-500">{selectedShop.address}</p>
          </div>

          {/* Veg & Non-Veg Toggle inside Restaurant Menu */}
          <div className="inline-flex items-center bg-white p-1 rounded-xl border border-gray-200 shadow-xs">
            <button
              type="button"
              onClick={() => setDietFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                dietFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() =>
                setDietFilter((prev) => (prev === 'veg' ? 'all' : 'veg'))
              }
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                dietFilter === 'veg'
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Veg
            </button>
            <button
              type="button"
              onClick={() =>
                setDietFilter((prev) =>
                  prev === 'non-veg' ? 'all' : 'non-veg'
                )
              }
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                dietFilter === 'non-veg'
                  ? 'bg-red-600 text-white'
                  : 'text-red-700 hover:bg-red-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Non-Veg
            </button>
          </div>
        </div>
      )}

      {/* Food Items Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-gray-900">
            {selectedShop ? 'Available Dishes' : 'Popular Dishes'} ({filteredMenu.length})
          </h2>
          {dietFilter !== 'all' && (
            <span
              className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase ${
                dietFilter === 'veg'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              Showing {dietFilter === 'veg' ? 'Veg Only' : 'Non-Veg Only'}
            </span>
          )}
        </div>

        {filteredMenu.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            No dishes match the selected filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredMenu.map((item) => {
              const itemShopId =
                item.shop?._id || item.shop || selectedShop?._id;
              const itemShopName =
                item.shop?.name || selectedShop?.name || 'Restaurant';
              const itemShopLocation =
                item.shop?.location || selectedShop?.location || null;

              return (
                <div
                  key={item._id}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center gap-4 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {item.image || item.imageUrl ? (
                      <img
                        src={item.image || item.imageUrl}
                        alt={item.name}
                        className="w-20 h-20 object-cover rounded-xl border border-gray-200 shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-orange-50 rounded-xl border border-orange-100 flex items-center justify-center text-orange-400 shrink-0">
                        <Utensils size={24} />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          title={item.isVeg === false ? 'Non-Veg' : 'Veg'}
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            item.isVeg === false ? 'bg-red-500' : 'bg-emerald-600'
                          }`}
                        />
                        <h4 className="font-bold text-gray-900 truncate">
                          {item.name}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {itemShopName}
                      </p>
                      {item.rating > 0 && (
                        <p className="text-xs text-amber-600 font-bold mt-0.5">
                          ★ {item.rating} ({item.numReviews})
                        </p>
                      )}
                      <p className="font-extrabold text-gray-900 mt-1">
                        ₹{item.price}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      addToCart({
                        ...item,
                        shopId: itemShopId,
                        shopName: itemShopName,
                        shopLocation: itemShopLocation,
                      })
                    }
                    className="bg-orange-50 text-orange-600 font-extrabold px-4 py-2 rounded-xl border border-orange-200 hover:bg-orange-600 hover:text-white transition cursor-pointer shrink-0"
                  >
                    ADD
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Orders Modal */}
      {showOrdersModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                <ClipboardList size={22} className="text-orange-600" /> My Orders
              </h2>
              <button
                onClick={closeOrdersModal}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {myOrders.length === 0 ? (
                <p className="text-center text-gray-500 py-12">
                  You haven&apos;t placed any orders yet.
                </p>
              ) : (
                myOrders.map((ord) => {
                  const canCustomerCancel =
                    ord.status === 'pending' || ord.status === 'preparing';
                  const canCustomerRate =
                    ord.status === 'delivered' && !ord.rating;

                  return (
                    <div
                      key={ord._id}
                      className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-xs font-mono text-gray-400">
                            #{ord._id.slice(-6).toUpperCase()}
                          </span>
                          <h4 className="font-bold text-gray-900">
                            {ord.shop?.name || 'Restaurant'}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                            ord.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                        <span className="font-extrabold text-gray-900">
                          ₹{ord.totalAmount}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/track-order/${ord._id}`}
                            onClick={closeOrdersModal}
                            className="bg-orange-50 text-orange-700 hover:bg-orange-100 text-xs font-bold px-3 py-1.5 rounded-lg"
                          >
                            Track / Details
                          </Link>

                          {canCustomerCancel && (
                            <button
                              onClick={() => handleCancelOrder(ord._id)}
                              className="bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={13} /> Cancel
                            </button>
                          )}

                          {canCustomerRate && (
                            <button
                              onClick={() => {
                                setRatingModalOrder(ord);
                                setRatingValue(5);
                                setRatingReview('');
                              }}
                              className="bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <Star size={13} /> Rate Food
                            </button>
                          )}

                          {ord.rating && (
                            <span className="text-xs font-bold text-amber-600">
                              ★ {ord.rating}/5 Rated
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Rating Modal */}
      {ratingModalOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-extrabold text-gray-900">
              Rate Food Quality — {ratingModalOrder.shop?.name}
            </h3>
            <form onSubmit={handleQuickRateSubmit} className="space-y-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingValue(star)}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      size={28}
                      className={
                        star <= ratingValue
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-gray-300'
                      }
                    />
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="Share your experience with the food quality..."
                value={ratingReview}
                onChange={(e) => setRatingReview(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setRatingModalOrder(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-700 cursor-pointer"
                >
                  Submit Rating
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;