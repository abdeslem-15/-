/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShoppingBag, 
  Search, 
  Plus, 
  X, 
  ShoppingCart, 
  ChevronRight, 
  Star,
  ArrowRight,
  Check,
  User as UserIcon,
  LogOut,
  Camera,
  MapPin,
  Car,
  Smartphone,
  LayoutGrid,
  Laptop,
  Watch,
  Briefcase,
  Home,
  Mountain,
  ChevronDown,
  ArrowUpDown,
  AlertCircle,
  ShieldCheck,
  Lock,
  Cpu,
  MessageSquare,
  Send
} from "lucide-react";
import { WindowVirtualizer } from "virtua";
import { Product, CartItem, Review, OperationType, Chat, Message } from "./types";
import { auth, signInWithGoogle, logout, db, messaging, requestNotificationPermission } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, updateDoc, doc as firestoreDoc, where, limit, getDocs } from "firebase/firestore";
import { onMessage } from "firebase/messaging";

const MOCK_PRODUCTS: Product[] = [
  // keeping these as fallback or starting data if needed, or we can just empty it
];

const CATEGORIES = ["الكل", "أراضي", "سيارات", "هواتف", "إلكترونيات", "إكسسوارات", "تصوير", "حقائب", "ديكور"];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "الكل": <LayoutGrid size={18} />,
  "أراضي": <Mountain size={18} />,
  "سيارات": <Car size={18} />,
  "هواتف": <Smartphone size={18} />,
  "إلكترونيات": <Laptop size={18} />,
  "إكسسوارات": <Watch size={18} />,
  "تصوير": <Camera size={18} />,
  "حقائب": <Briefcase size={18} />,
  "ديكور": <Home size={18} />,
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("الكل");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Advanced Filtering State
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<"newest" | "price-asc" | "price-desc">("newest");
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [followedCategories, setFollowedCategories] = useState<string[]>([]);
  const [securityStatus, setSecurityStatus] = useState<"clean" | "warning" | "monitored">("clean");
  const activityLog = useRef<number[]>([]);

  // System Protection Logic (Kernel Simulation)
  const logActivity = () => {
    const now = Date.now();
    activityLog.current = [...activityLog.current.filter(t => now - t < 5000), now];
    if (activityLog.current.length > 15) {
      setSecurityStatus("warning");
      console.warn("[PROTECTION ENGINE] High-frequency activity detected. Monitoring restricted.");
      setTimeout(() => setSecurityStatus("clean"), 10000);
      return false;
    }
    return true;
  };

  const toggleFollowCategory = (category: string) => {
    if (category === "الكل") return;
    setFollowedCategories(prev => {
      const isFollowing = prev.includes(category);
      let next;
      if (isFollowing) {
        next = prev.filter(c => c !== category);
      } else {
        next = [...prev, category];
      }
      
      // Persist to user profile if needed
      if (user) {
        updateDoc(firestoreDoc(db, "users", user.uid), {
          followedCategories: next
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "users"));
      }
      return next;
    });
  };

  const [isNotificationTrayOpen, setIsNotificationTrayOpen] = useState(false);
  
  // Chat State
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Review State
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Grid responsiveness
  const [columns, setColumns] = useState(1);
  
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) setColumns(4);      // xl
      else if (width >= 1024) setColumns(3); // lg
      else if (width >= 640) setColumns(2);  // sm
      else setColumns(1);
    };
    
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Sell Form State
  const [sellForm, setSellForm] = useState<{
    name: string;
    price: string;
    description: string;
    category: string;
    phone: string;
    location: string;
    images: File[];
  }>({
    name: "",
    price: "",
    description: "",
    category: "إلكترونيات",
    phone: "",
    location: "",
    images: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSellForm(prev => ({
        ...prev,
        images: [...prev.images, ...filesArray].slice(0, 5) // Limit to 5 images
      }));
    }
  };

  const removeImage = (index: number) => {
    setSellForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        requestNotificationPermission(u).then(token => {
          if (token) setFcmToken(token);
        });
      }
    });

    // Listen for foreground messages
    let unsubscribeMessaging = () => {};
    if (messaging) {
      unsubscribeMessaging = onMessage(messaging, (payload) => {
        const newNotification = {
          id: Date.now(),
          title: payload.notification?.title || "تنبيه جديد",
          body: payload.notification?.body || "",
          timestamp: new Date(),
        };
        setNotifications(prev => [newNotification, ...prev]);
        
        // Auto remove notification after 5 seconds
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
        }, 5000);
      });
    }

    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      const productList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productList);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "products");
      setIsLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProducts();
      unsubscribeMessaging();
    };
  }, []);

  // Sync Chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribeChats = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      setChats(chatList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "chats");
    });

    return () => unsubscribeChats();
  }, [user]);

  // Sync Messages
  useEffect(() => {
    if (!activeChat) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, "chats", activeChat.id, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const messageList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setChatMessages(messageList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${activeChat.id}/messages`);
    });

    return () => unsubscribeMessages();
  }, [activeChat]);

  const startChat = async (product: Product) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!logActivity()) return;

    if (user.uid === product.sellerId) {
      alert("لا يمكنك الدردشة مع منتجك الخاص.");
      return;
    }

    // Check if chat already exists
    const q = query(
      collection(db, "chats"),
      where("productId", "==", product.id),
      where("buyerId", "==", user.uid)
    );

    try {
      const existingChats = await getDocs(q);
      if (!existingChats.empty) {
        const chatData = { id: existingChats.docs[0].id, ...existingChats.docs[0].data() } as Chat;
        setActiveChat(chatData);
        setIsChatListOpen(false);
        return;
      }

      // Create new chat
      const chatData: Omit<Chat, 'id'> = {
        participants: [user.uid, product.sellerId as string],
        productId: product.id,
        productName: product.name,
        buyerId: user.uid,
        sellerId: product.sellerId as string,
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "chats"), chatData);
      setActiveChat({ id: docRef.id, ...chatData });
      setIsChatListOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "chats");
    }
  };

  const sendMessage = async () => {
    if (!user || !activeChat || !newMessage.trim() || !logActivity()) return;

    setIsSendingMessage(true);
    try {
      const messageData = {
        text: newMessage,
        senderId: user.uid,
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, "chats", activeChat.id, "messages"), messageData);
      await updateDoc(firestoreDoc(db, "chats", activeChat.id), {
        lastMessage: newMessage,
        updatedAt: serverTimestamp()
      });
      setNewMessage("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
    } finally {
      setIsSendingMessage(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!selectedProduct) {
      setReviews([]);
      return;
    }

    const q = query(
      collection(db, "products", selectedProduct.id, "reviews"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeReviews = onSnapshot(q, (snapshot) => {
      const reviewList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      setReviews(reviewList);
    });

    return () => unsubscribeReviews();
  }, [selectedProduct]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProduct || !logActivity()) return;
    if (!reviewForm.comment.trim()) return;

    setIsSubmittingReview(true);
    try {
      await addDoc(collection(db, "products", selectedProduct.id, "reviews"), {
        productId: selectedProduct.id,
        userId: user.uid,
        userName: user.displayName || "مستخدم",
        userPhoto: user.photoURL || "",
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        createdAt: serverTimestamp()
      });
      setReviewForm({ rating: 5, comment: "" });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${selectedProduct.id}/reviews`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === "الكل" || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) || 
                           (p.description || "").toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      
      const price = p.price;
      const matchesMinPrice = minPrice === "" || price >= parseFloat(minPrice);
      const matchesMaxPrice = maxPrice === "" || price <= parseFloat(maxPrice);
      const matchesInStock = !onlyInStock || (p.inStock !== false);
      const matchesRating = (p.rating || 5) >= minRating;

      return matchesCategory && matchesSearch && matchesMinPrice && matchesMaxPrice && matchesInStock && matchesRating;
    }).sort((a, b) => {
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      // newest is handled by default since data comes from firestore ordered
      return 0;
    });
  }, [selectedCategory, debouncedSearchQuery, products, minPrice, maxPrice, onlyInStock, minRating, sortBy]);

  const productRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < filteredProducts.length; i += columns) {
      rows.push(filteredProducts.slice(i, i + columns));
    }
    return rows;
  }, [filteredProducts, columns]);

  const addToCart = (product: Product) => {
    if (!logActivity()) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    if (!logActivity()) return;
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleSellProduct = () => {
    if (!user) {
      setIsAuthModalOpen(true);
    } else {
      setIsSellModalOpen(true);
    }
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !logActivity()) return;
    
    setIsSubmitting(true);
    try {
      // For demo purposes, we'll generate seeds for each "uploaded" image 
      // as we don't have real file storage set up.
      const imageSeeds = sellForm.images.length > 0 
        ? sellForm.images.map(() => `https://picsum.photos/seed/${Math.random()}/600/400`)
        : [`https://picsum.photos/seed/${Math.random()}/600/400`];

      await addDoc(collection(db, "products"), {
        name: sellForm.name,
        price: parseFloat(sellForm.price),
        description: sellForm.description,
        category: sellForm.category,
        phone: sellForm.phone,
        location: sellForm.location,
        image: imageSeeds[0],
        images: imageSeeds,
        sellerId: user.uid,
        sellerName: user.displayName,
        createdAt: serverTimestamp(),
        rating: 5,
        inStock: true
      });
      
      // Simulate notification for followed categories
      if (followedCategories.includes(sellForm.category)) {
        const newNoti = {
          id: Date.now(),
          title: "منتج جديد!",
          body: `تمت إضافة منتج جديد في فئة ${sellForm.category}: ${sellForm.name}`,
          timestamp: new Date()
        };
        setNotifications(prev => [newNoti, ...prev]);
        setIsNotificationTrayOpen(true);
      }

      setIsSellModalOpen(false);
      setSellForm({ name: "", price: "", description: "", category: "إلكترونيات", phone: "", location: "", images: [] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "products");
      alert("حدث خطأ أثناء نشر المنتج. يرجى المحاولة لاحقاً.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const productImages = (selectedProduct && selectedProduct.images && selectedProduct.images.length > 0) 
    ? selectedProduct.images 
    : (selectedProduct ? [selectedProduct.image] : []);

  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    return products.filter(p => p.category === selectedProduct.category && p.id !== selectedProduct.id);
  }, [selectedProduct, products]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedProduct]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#0a0a0a] font-sans selection:bg-zinc-900 selection:text-white" dir="rtl">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-zinc-100 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-12">
          <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => {
              setSelectedCategory("الكل");
              setSearchQuery("");
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-white shadow-xl shadow-zinc-200 group-hover:rotate-[-8deg] transition-all duration-500">
              <ShoppingBag className="text-amber-400" size={24} strokeWidth={2.5} />
            </div>
            <span className="text-3xl font-display font-black tracking-tighter">سوقنا<span className="text-amber-500">.</span></span>
          </div>

          <div className="hidden lg:flex flex-1 max-w-2xl relative group">
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="ابحث عن سيارات، عقارات، إلكترونيات..."
              className="w-full h-14 pr-14 pl-6 rounded-[20px] bg-zinc-100 border-none focus:bg-white focus:ring-2 focus:ring-zinc-900 transition-all placeholder:text-zinc-400 text-base font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-4">
              <div className="relative group/noti">
                <button 
                  onClick={() => setIsNotificationTrayOpen(!isNotificationTrayOpen)}
                  className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-600 hover:bg-zinc-200 transition-all relative"
                >
                  <AlertCircle size={24} />
                  {notifications.length > 0 && (
                    <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                  )}
                </button>
                
                <AnimatePresence>
                  {isNotificationTrayOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-14 left-0 w-80 bg-white rounded-3xl shadow-2xl border border-zinc-100 py-6 px-6 z-50 overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg">التنبيهات</h3>
                        <button onClick={() => setNotifications([])} className="text-xs font-bold text-zinc-400 hover:text-zinc-900 transition-colors">مسح الكل</button>
                      </div>
                      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                        {notifications.length === 0 ? (
                          <div className="py-10 text-center">
                            <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-4 text-zinc-200">
                              <AlertCircle size={24} />
                            </div>
                            <p className="text-zinc-400 text-sm font-medium">لا توجد تنبيهات حالياً</p>
                          </div>
                        ) : (
                          notifications.map(n => (
                            <div key={n.id} className="p-4 rounded-2xl bg-zinc-50 border border-transparent hover:border-zinc-200 transition-all cursor-pointer">
                              <h4 className="font-bold text-sm text-zinc-900 mb-1">{n.title}</h4>
                              <p className="text-xs text-zinc-500 leading-relaxed">{n.body}</p>
                              <span className="text-[10px] text-zinc-400 mt-2 block capitalize">الآن</span>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <button 
                onClick={() => setIsChatListOpen(!isChatListOpen)}
                className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-600 hover:bg-zinc-200 transition-all relative"
              >
                <MessageSquare size={24} />
                {chats.length > 0 && (
                  <span className="absolute top-2 right-2 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
                )}
              </button>

              <div className="w-px h-8 bg-zinc-200" />
            </div>
            <button 
              onClick={handleSellProduct}
              className="hidden sm:flex items-center gap-2.5 px-6 py-2.5 bg-zinc-900 text-white rounded-full text-sm font-bold hover:bg-zinc-800 hover:shadow-lg hover:shadow-zinc-200 transition-all active:scale-95"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>ابدأ البيع</span>
            </button>
            
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden lg:flex flex-col items-end">
                  <span className="text-xs font-bold">{user.displayName}</span>
                  <button onClick={logout} className="text-[10px] text-zinc-400 hover:text-red-500 flex items-center gap-1">
                    تسجيل الخروج
                    <LogOut size={10} />
                  </button>
                </div>
                <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-zinc-200" />
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="p-2 text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <UserIcon size={22} />
              </button>
            )}

            <button 
              className="relative p-2 text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart size={22} />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-zinc-900 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-bold">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Sell Product Modal */}
      <AnimatePresence>
        {isSellModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 text-right" dir="rtl">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsSellModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">عرض منتج للبيع</h2>
                <button onClick={() => setIsSellModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors mr-auto ml-0">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSellSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">اسم المنتج</label>
                  <input 
                    required
                    type="text" 
                    placeholder="مثال: سماعات لاسلكية"
                    className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none"
                    value={sellForm.name}
                    onChange={(e) => setSellForm({...sellForm, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">السعر (د.ج)</label>
                    <input 
                      required
                      type="number" 
                      placeholder="0.00"
                      className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none"
                      value={sellForm.price}
                      onChange={(e) => setSellForm({...sellForm, price: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">رقم الهاتف</label>
                    <input 
                      required
                      type="tel" 
                      placeholder="05xxxxxxxx"
                      className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none"
                      value={sellForm.phone}
                      onChange={(e) => setSellForm({...sellForm, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">الموقع (المدينة)</label>
                  <div className="relative">
                    <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      required
                      type="text" 
                      placeholder="مثال: الرياض"
                      className="w-full h-12 pr-11 pl-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none"
                      value={sellForm.location}
                      onChange={(e) => setSellForm({...sellForm, location: e.target.value})}
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-sm font-bold text-zinc-700 mb-2">الفئة</label>
                  <select 
                    className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none appearance-none bg-white font-medium"
                    value={sellForm.category}
                    onChange={(e) => setSellForm({...sellForm, category: e.target.value})}
                  >
                    {CATEGORIES.filter(c => c !== "الكل").map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute left-4 top-[42px] -rotate-90 text-zinc-400 pointer-events-none" size={16} />
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">تفاصيل المنتج</label>
                  <textarea 
                    required
                    rows={4}
                    placeholder="اكتب وصفاً دقيقاً لمنتجك ليشاهده المشترون..."
                    className="w-full p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none resize-none"
                    value={sellForm.description}
                    onChange={(e) => setSellForm({...sellForm, description: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">صور المنتج (حتى 5 صور)</label>
                  <div className="grid grid-cols-5 gap-2">
                    {sellForm.images.map((file, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-100 group">
                        <img 
                          src={URL.createObjectURL(file)} 
                          className="w-full h-full object-cover" 
                          alt="preview" 
                        />
                        <button 
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {sellForm.images.length < 5 && (
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-400 hover:border-zinc-900 hover:text-zinc-900 transition-all"
                      >
                        <Camera size={20} />
                        <span className="text-[8px] mt-1 font-bold">إضافة</span>
                      </button>
                    )}
                  </div>
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleImageChange}
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-14 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 mt-2 disabled:opacity-50"
                >
                  {isSubmitting ? "جاري النشر..." : "نشر المنتج للبيع"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAuthModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-6">
                <ShoppingBag size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">مرحباً بك في سوقنا</h2>
              <p className="text-zinc-500 mb-8">سجل دخولك لتبدأ في بيع وشراء المنتجات بكل سهولة.</p>
              
              <button 
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                    setIsAuthModalOpen(false);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="w-full h-14 border border-zinc-200 rounded-2xl flex items-center justify-center gap-3 font-semibold hover:bg-zinc-50 transition-all mb-4"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                <span>تسجيل الدخول بواسطة جوجل</span>
              </button>
              
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                ربما لاحقاً
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Rest of the main content (Hero, Categories, Products) placeholder to avoid truncation */}
        {/* Hero Section */}
        <section className="relative h-[600px] mb-20 rounded-[48px] overflow-hidden bg-zinc-900 shadow-2xl shadow-zinc-200">
          <img 
            src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2070&auto=format&fit=crop" 
            alt="Hero Banner"
            className="absolute inset-0 w-full h-full object-cover opacity-40 scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-zinc-900 via-zinc-900/60 to-transparent" />
          
          <div className="absolute inset-0 flex flex-col justify-center px-16 text-white max-w-4xl text-right ml-auto">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-[0.2em] mb-10">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
                اكتشف أفضل العروض في الجزائر الآن
              </div>
              <h1 className="text-7xl md:text-8xl font-display font-black mb-8 leading-[0.9] tracking-tighter">
                تسوق بذكاء <br />
                <span className="text-transparent border-t-zinc-100 bg-clip-text bg-gradient-to-l from-amber-400 to-amber-200 italic">بع وأهلاً بك</span>
              </h1>
              <p className="text-zinc-300 text-xl md:text-2xl mb-12 leading-relaxed font-medium max-w-2xl ml-auto">
                المنصة الجزائرية الأولى للمنتجات الفاخرة والعقارات والإلكترونيات. 
                تجربة تسوق آمنة وسلسة تبدأ من هنا.
              </p>
              <div className="flex items-center gap-6 justify-end">
                <button 
                  onClick={handleSellProduct}
                  className="h-16 px-12 bg-white text-zinc-900 rounded-2xl flex items-center gap-3 font-bold hover:scale-105 transition-all shadow-2xl shadow-white/10 group text-lg"
                >
                  <span>ابدأ البيع الآن</span>
                  <Plus size={20} strokeWidth={3} />
                </button>
                <button className="h-16 px-10 border border-white/30 text-white rounded-2xl font-bold hover:bg-white/10 transition-all text-lg">
                  تصفح الفئات
                </button>
              </div>
            </motion.div>
          </div>

          <div className="absolute bottom-12 left-16 hidden lg:flex items-center gap-14">
            <div className="flex flex-col items-end">
              <span className="text-4xl font-display font-black tracking-tight tracking-[-0.05em]">50K+</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] font-bold">منتج متاح</span>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="flex flex-col items-end">
              <span className="text-4xl font-display font-black tracking-tight tracking-[-0.05em]">12K+</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] font-bold">بائع نشط</span>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="flex flex-col items-end">
              <span className="text-4xl font-display font-black tracking-tight tracking-[-0.05em]">4.9/5</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-[0.2em] font-bold">تقييم العملاء</span>
            </div>
          </div>
        </section>

        {/* Categories Section */}
        <div className="mb-16">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-2 w-full md:w-auto flex-1">
              {CATEGORIES.map(cat => (
                <div key={cat} className="relative group">
                  <button
                    onClick={() => setSelectedCategory(cat)}
                    className={`h-12 px-8 rounded-2xl text-sm font-bold whitespace-nowrap transition-all flex items-center gap-3 ${
                      selectedCategory === cat 
                      ? "bg-zinc-900 text-white shadow-xl shadow-zinc-200" 
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    <span className={selectedCategory === cat ? "text-amber-400" : "text-zinc-400"}>
                      {CATEGORY_ICONS[cat]}
                    </span>
                    <span>{cat}</span>
                  </button>
                  {cat !== "الكل" && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleFollowCategory(cat); }}
                      className={`absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        followedCategories.includes(cat)
                        ? "bg-amber-400 text-white scale-100 opacity-100"
                        : "bg-zinc-200 text-zinc-400 scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                      }`}
                    >
                      <Star size={12} fill={followedCategories.includes(cat) ? "currentColor" : "none"} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative group/sort">
                <button className="h-12 px-6 rounded-2xl flex items-center gap-3 bg-white border border-zinc-200 text-zinc-600 font-bold text-sm hover:border-zinc-900 transition-all">
                  <ArrowUpDown size={18} />
                  <span>
                    {sortBy === "newest" ? "الأحدث" : sortBy === "price-asc" ? "الأقل سعراً" : "الأعلى سعراً"}
                  </span>
                </button>
                <div className="absolute top-14 left-0 w-48 bg-white rounded-2xl shadow-2xl border border-zinc-100 py-3 opacity-0 translate-y-2 pointer-events-none group-hover/sort:opacity-100 group-hover/sort:translate-y-0 group-hover/sort:pointer-events-auto transition-all z-50">
                  {[
                    { id: "newest", label: "الأحدث" },
                    { id: "price-asc", label: "الأقل سعراً" },
                    { id: "price-desc", label: "الأعلى سعراً" }
                  ].map(option => (
                    <button
                      key={option.id}
                      onClick={() => setSortBy(option.id as any)}
                      className={`w-full px-6 py-2.5 text-right text-sm font-bold hover:bg-zinc-50 transition-colors ${
                        sortBy === option.id ? "text-zinc-900" : "text-zinc-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`h-12 px-6 rounded-2xl flex items-center gap-2 font-bold text-sm transition-all border ${
                  showFilters ? "bg-zinc-900 text-white border-transparent" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-900"
                }`}
              >
                <LayoutGrid size={18} />
                <span>فلاتر متقدمة</span>
                <ChevronRight size={16} className={`transition-transform rotate-90 ${showFilters ? "rotate-[270deg]" : ""}`} />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-8"
              >
                <div className="p-8 bg-zinc-50 rounded-[32px] border border-zinc-100 grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">نطاق السعر (د.ج)</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="number" 
                        placeholder="من"
                        className="w-full h-12 px-4 rounded-xl bg-white border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none text-sm"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                      />
                      <span className="text-zinc-300">-</span>
                      <input 
                        type="number" 
                        placeholder="إلى"
                        className="w-full h-12 px-4 rounded-xl bg-white border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all outline-none text-sm"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">تقييم البائع</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button 
                          key={star}
                          onClick={() => setMinRating(minRating === star ? 0 : star)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            minRating >= star ? "bg-amber-400 text-white shadow-lg shadow-amber-200" : "bg-white text-zinc-300 border border-zinc-200 hover:border-zinc-400"
                          }`}
                        >
                          <Star size={16} fill={minRating >= star ? "currentColor" : "none"} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">التوفر</label>
                    <button 
                      onClick={() => setOnlyInStock(!onlyInStock)}
                      className={`h-12 w-full px-6 rounded-xl flex items-center justify-center gap-3 font-bold text-sm transition-all border ${
                        onlyInStock ? "bg-zinc-900 text-white border-transparent" : "bg-white border-zinc-200 text-zinc-600"
                      }`}
                    >
                      <Check size={18} className={onlyInStock ? "opacity-100" : "opacity-20"} />
                      <span>المتوفر فقط</span>
                    </button>
                  </div>

                  <div className="flex items-end">
                    <button 
                      onClick={() => {
                        setMinPrice("");
                        setMaxPrice("");
                        setOnlyInStock(false);
                        setMinRating(0);
                      }}
                      className="h-12 w-full px-6 rounded-xl flex items-center justify-center gap-3 font-bold text-sm text-red-500 hover:bg-red-50 transition-all border border-transparent"
                    >
                      <span>إعادة ضبط</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Product Grid */}
        <div className="w-full">
          {isLoading ? (
            <div className={`grid gap-8 ${
              columns === 4 ? "grid-cols-4" :
              columns === 3 ? "grid-cols-3" :
              columns === 2 ? "grid-cols-2" :
              "grid-cols-1"
            }`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="animate-pulse bg-white rounded-[32px] p-4 border border-zinc-100">
                  <div className="relative aspect-[1.1/1] rounded-2xl bg-zinc-50 mb-4" />
                  <div className="h-6 bg-zinc-50 rounded-lg w-3/4 mb-3" />
                  <div className="h-4 bg-zinc-50 rounded-lg w-1/2 mb-6" />
                  <div className="flex justify-between items-center pt-6 border-t border-zinc-50">
                    <div className="h-4 bg-zinc-50 rounded-lg w-1/4" />
                    <div className="h-6 bg-zinc-50 rounded-lg w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <WindowVirtualizer
              data={productRows}
            >
              {(row, rowIndex) => (
                <div key={rowIndex} className={`grid gap-8 mb-8 ${
                  columns === 4 ? "grid-cols-4" :
                  columns === 3 ? "grid-cols-3" :
                  columns === 2 ? "grid-cols-2" :
                  "grid-cols-1"
                }`}>
                  {row.map((product) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      key={product.id}
                      className="group cursor-pointer bg-white rounded-[32px] overflow-hidden border border-zinc-100 hover:border-zinc-900 transition-all duration-500 hover:shadow-2xl hover:shadow-zinc-200/50"
                      onClick={() => setSelectedProduct(product)}
                    >
                      <div className="relative aspect-[1.1/1] overflow-hidden bg-zinc-50">
                        <img 
                          src={product.image} 
                          alt={product.name}
                          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out ${product.inStock === false ? "grayscale opacity-50" : ""}`}
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
                          <span className="px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest text-zinc-900 border border-zinc-200 shadow-sm">
                            {product.category}
                          </span>
                          {product.inStock === false && (
                            <span className="px-3 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-red-200">
                              نفذت الكمية
                            </span>
                          )}
                        </div>
                        {product.inStock !== false && (
                          <button 
                            className="absolute bottom-5 left-5 w-14 h-14 bg-zinc-900 text-white rounded-2xl shadow-xl flex items-center justify-center translate-y-20 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 hover:bg-zinc-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product);
                            }}
                          >
                            <ShoppingBag size={24} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                      <div className="p-7">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-display font-bold text-xl text-zinc-900 line-clamp-1 group-hover:text-amber-600 transition-colors">{product.name}</h3>
                          <div className="flex items-center gap-1.5 text-sm text-zinc-900 font-bold bg-zinc-50 px-2 py-1 rounded-lg">
                            <Star size={14} className="text-amber-500" fill="currentColor" />
                            <span>{product.rating || "5.0"}</span>
                          </div>
                        </div>
                        {product.location && (
                          <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] mb-4 font-bold uppercase tracking-widest">
                            <MapPin size={12} className="text-zinc-300" />
                            <span>{product.location}</span>
                          </div>
                        )}
                        <p className="text-zinc-500 text-sm line-clamp-2 mb-6 font-medium leading-relaxed">{product.description}</p>
                        <div className="flex items-center justify-between pt-6 border-t border-zinc-50">
                          <span className="text-sm text-zinc-400 font-bold uppercase tracking-widest">السعر</span>
                          <span className="text-2xl font-display font-bold text-zinc-900">{product.price.toLocaleString()} <span className="text-xs">د.ج</span></span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </WindowVirtualizer>
          )}
        </div>

        {filteredProducts.length === 0 && !isLoading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-zinc-50 flex items-center justify-center mb-8 text-zinc-200">
              <Search size={48} />
            </div>
            <h3 className="text-3xl font-display font-bold text-zinc-900 mb-4">لا توجد نتائج مطابقة</h3>
            <p className="text-zinc-500 max-w-sm font-medium leading-relaxed mb-10">
              لم نجد أي منتجات تطابق اختياراتك حالياً. يمكنك تجربة تغيير الفلاتر أو البحث عن شيء آخر.
            </p>
            <button 
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("الكل");
                setMinPrice("");
                setMaxPrice("");
                setOnlyInStock(false);
                setMinRating(0);
              }}
              className="h-14 px-10 bg-zinc-900 text-white rounded-2xl font-bold hover:scale-105 transition-all shadow-xl shadow-zinc-200"
            >
              إعادة ضبط البحث
            </button>
          </motion.div>
        )}
      </main>

      {/* Cart Sidebar */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setIsCartOpen(false)}
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShoppingCart size={24} />
                  <h2 className="text-xl font-bold">سلة التسوق</h2>
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded-full">{cartItemsCount} قطع</span>
                </div>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                    <ShoppingBag size={64} className="mb-4 text-zinc-300" />
                    <p className="text-lg font-medium text-zinc-900">سلة التسوق فارغة</p>
                    <p className="text-sm">ابدأ بإضافة منتجات تحبها</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cart.map((item) => (
                      <div key={item.id} className="flex gap-4 group">
                        <div className="w-20 h-20 rounded-xl bg-zinc-100 overflow-hidden shrink-0">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 flex flex-col justify-between py-1">
                          <div className="flex justify-between gap-2">
                            <h4 className="font-semibold text-sm">{item.name}</h4>
                            <button onClick={() => removeFromCart(item.id)} className="text-zinc-400 hover:text-red-500 transition-colors">
                              <X size={16} />
                            </button>
                          </div>
                          <div className="flex justify-between items-end">
                            <div className="text-xs text-zinc-400">الكمية: {item.quantity}</div>
                            <div className="font-bold text-sm">{(item.price * item.quantity).toLocaleString()} د.ج</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommended Based on Search Section */}
                <div className="mt-12 pt-12 border-t border-zinc-100">
                  <h3 className="text-sm font-bold text-zinc-900 mb-4 flex items-center gap-2">
                    <Search size={14} />
                    منتجات مبحوث عنها قد تهمك
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {filteredProducts.slice(0, 4).map(product => (
                      <div 
                        key={product.id} 
                        className="group cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-50 mb-2">
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                          <button 
                            className="absolute bottom-2 left-2 p-2 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product);
                            }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <p className="text-[10px] font-bold truncate">{product.name}</p>
                        <p className="text-[10px] text-zinc-500">{product.price} د.ج</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50">
                <div className="flex justify-between mb-4">
                  <span className="text-zinc-500 font-medium">الإجمالي</span>
                  <span className="text-2xl font-bold">{cartTotal.toLocaleString()} د.ج</span>
                </div>
                <button 
                  className="w-full h-14 bg-zinc-900 text-white rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  disabled={cart.length === 0}
                >
                  <span>إتمام الشراء</span>
                  <ArrowRight className="rotate-180" size={18} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Product Details Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-[48px] overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh] overflow-y-auto md:overflow-hidden scrollbar-hide"
            >
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-8 left-8 z-20 p-3 bg-white/90 backdrop-blur-lg shadow-xl rounded-2xl hover:bg-white hover:scale-110 transition-all border border-zinc-100"
              >
                <X size={24} />
              </button>

              <div className="w-full md:w-[55%] bg-zinc-50 shrink-0 h-[400px] md:h-auto relative group overflow-hidden cursor-zoom-in" onClick={() => setFullScreenImage(productImages[activeImageIndex])}>
                <motion.img 
                  key={activeImageIndex}
                  src={productImages[activeImageIndex]} 
                  alt={selectedProduct.name} 
                  className="w-full h-full object-cover" 
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  referrerPolicy="no-referrer" 
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

                {productImages.length > 1 && (
                  <>
                    <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-3 px-4 py-2 z-10">
                      {productImages.map((_, idx) => (
                        <button 
                          key={idx}
                          onClick={() => setActiveImageIndex(idx)}
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            activeImageIndex === idx ? "bg-white w-8" : "bg-white/40 w-3 hover:bg-white/60"
                          }`}
                        />
                      ))}
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); setActiveImageIndex(prev => (prev - 1 + productImages.length) % productImages.length); }}
                      className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white/20 backdrop-blur-md text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-white/40"
                    >
                      <ChevronRight className="rotate-180" size={24} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setActiveImageIndex(prev => (prev + 1) % productImages.length); }}
                      className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white/20 backdrop-blur-md text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-white/40"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}
              </div>

              <div id="details-container" className="w-full md:w-[45%] p-10 md:p-14 flex flex-col justify-between overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <div className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 text-[10px] font-bold uppercase tracking-widest">
                      {selectedProduct.category}
                    </div>
                    <div className="flex items-center gap-2 text-amber-500 font-bold bg-amber-50 px-3 py-1.5 rounded-xl">
                      <Star size={18} fill="currentColor" />
                      <span>{selectedProduct.rating || "5.0"}</span>
                    </div>
                  </div>

                  {selectedProduct.location && (
                    <div className="flex items-center gap-2 text-zinc-400 mb-4 text-xs font-bold uppercase tracking-widest">
                      <MapPin size={14} className="text-zinc-300" />
                      <span>{selectedProduct.location}</span>
                    </div>
                  )}
                  
                  <h2 className="text-4xl md:text-5xl font-display font-bold mb-6 leading-tight tracking-tight">{selectedProduct.name}</h2>
                  
                  <p className="text-zinc-500 text-lg leading-relaxed mb-10 font-medium">
                    {selectedProduct.description}
                  </p>
                  
                  {selectedProduct.phone && (
                    <div className="mb-10 p-6 rounded-[32px] bg-zinc-50 border border-zinc-100 flex items-center justify-between group">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">تواصل مباشر مع البائع</div>
                        <div className="text-xl font-display font-bold text-zinc-900">{selectedProduct.phone}</div>
                      </div>
                      <a 
                        href={`tel:${selectedProduct.phone}`}
                        className="w-14 h-14 bg-zinc-900 text-white rounded-2xl flex items-center justify-center hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 group-hover:scale-110 active:scale-95"
                      >
                        <Camera size={24} />
                      </a>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 mb-12">
                    <div className="p-5 rounded-3xl border border-zinc-50 bg-zinc-50/50">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">التوصيل</div>
                      <div className="text-sm font-bold flex items-center gap-2">
                        <Check size={16} className="text-emerald-500" strokeWidth={3} />
                        <span>متاح ومجاني</span>
                      </div>
                    </div>
                    <div className="p-5 rounded-3xl border border-zinc-50 bg-zinc-50/50">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">الأمان</div>
                      <div className="text-sm font-bold flex items-center gap-2">
                        <Check size={16} className="text-emerald-500" strokeWidth={3} />
                        <span>دفع عند الاستلام</span>
                      </div>
                    </div>
                  </div>

                  {/* Reviews Section */}
                  <div className="mt-12">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-2xl font-display font-bold">المراجعات</h3>
                      <span className="text-sm font-bold text-zinc-400 underline">{reviews.length} مراجعة</span>
                    </div>

                    {/* Review Form */}
                    {user ? (
                      <form onSubmit={handleReviewSubmit} className="mb-12 p-6 rounded-3xl bg-zinc-50 border border-zinc-100">
                        <div className="flex items-center gap-4 mb-4">
                          <img src={user.photoURL || ""} alt={user.displayName || ""} className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                          <div>
                            <div className="text-sm font-bold">{user.displayName}</div>
                            <div className="flex gap-1 mt-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                                  className="text-amber-500"
                                >
                                  <Star size={16} fill={reviewForm.rating >= star ? "currentColor" : "none"} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <textarea
                          placeholder="اكتب رأيك في هذا المنتج..."
                          value={reviewForm.comment}
                          onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                          className="w-full h-24 p-4 bg-white border border-zinc-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all mb-4 resize-none"
                          required
                        />
                        <button
                          type="submit"
                          disabled={isSubmittingReview}
                          className="w-full h-12 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
                        >
                          {isSubmittingReview ? "جاري الإرسال..." : "إضافة مراجعة"}
                        </button>
                      </form>
                    ) : (
                      <div className="mb-12 p-6 rounded-3xl bg-zinc-50 border border-dotted border-zinc-200 text-center">
                        <p className="text-sm text-zinc-500 font-bold mb-4">يجب تسجيل الدخول لإضافة مراجعة</p>
                        <button
                          onClick={signInWithGoogle}
                          className="px-6 py-2 bg-white border border-zinc-100 rounded-full text-xs font-bold hover:bg-zinc-100 transition-all"
                        >
                          تسجيل الدخول
                        </button>
                      </div>
                    )}

                    {/* Reviews List */}
                    <div className="space-y-8">
                      {reviews.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-8">لا توجد مراجعات بعد. كن أول من يقيّم هذا المنتج!</p>
                      ) : (
                        reviews.map((review) => (
                          <div key={review.id} className="group">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-100 overflow-hidden">
                                  <img src={review.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${review.userId}`} alt={review.userName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                                <div>
                                  <div className="text-sm font-bold">{review.userName}</div>
                                  <div className="flex gap-1 mt-0.5">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <Star key={s} size={10} fill={review.rating >= s ? "#f59e0b" : "none"} className={review.rating >= s ? "text-amber-500" : "text-zinc-200"} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                {review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString('ar-SA') : "الآن"}
                              </div>
                            </div>
                            <p className="text-sm text-zinc-500 leading-relaxed font-medium pl-4">{review.comment}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Related Products Section */}
                  {relatedProducts.length > 0 && (
                    <div className="mt-12 pt-12 border-t border-zinc-100">
                      <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
                        <ShoppingBag size={14} className="text-amber-500" />
                        منتجات مشابهة قد تهمك
                      </h3>
                      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
                        {relatedProducts.slice(0, 4).map(rp => (
                          <div 
                            key={rp.id}
                            className="group cursor-pointer bg-zinc-50 rounded-2xl p-3 border border-transparent hover:border-zinc-200 transition-all hover:shadow-xl hover:shadow-zinc-200/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProduct(rp);
                              // Smooth scroll to top of details if needed, but the details div itself is overflow-y-auto
                              const detailsContainer = document.getElementById('details-container');
                              if (detailsContainer) detailsContainer.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            <div className="aspect-square rounded-xl overflow-hidden mb-3">
                              <img 
                                src={rp.image} 
                                alt={rp.name} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <h4 className="text-xs font-bold text-zinc-900 truncate mb-1">{rp.name}</h4>
                            <p className="text-[10px] text-amber-600 font-bold">{rp.price.toLocaleString()} د.ج</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6 pt-10 border-t border-zinc-100 mt-12">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-zinc-400 font-bold uppercase tracking-widest text-xs">قيمة العرض</span>
                    <span className="text-4xl font-display font-bold text-zinc-900 leading-none">{selectedProduct.price.toLocaleString()} <span className="text-lg">د.ج</span></span>
                  </div>
                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={() => startChat(selectedProduct)}
                      className="w-full h-14 bg-amber-50 text-amber-600 rounded-3xl font-bold text-base flex items-center justify-center gap-3 hover:bg-amber-100 transition-all border border-amber-100 active:scale-95"
                    >
                      <MessageSquare size={20} />
                      <span>دردشة مع البائع</span>
                    </button>
                    <button 
                      onClick={() => {
                        addToCart(selectedProduct);
                        setSelectedProduct(null);
                      }}
                      className="w-full h-18 bg-zinc-900 text-white rounded-3xl font-bold text-lg flex items-center justify-center gap-4 hover:bg-zinc-800 transition-all shadow-2xl shadow-zinc-200 hover:scale-[1.02] active:scale-95 group"
                    >
                      <Plus size={24} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform" />
                      <span>إضافة إلى السلة</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fullScreenImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl transition-all">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 cursor-zoom-out"
              onClick={() => setFullScreenImage(null)}
            />
            
            <button 
              onClick={() => setFullScreenImage(null)}
              className="absolute top-8 left-8 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all border border-white/10"
            >
              <X size={32} />
            </button>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative max-w-[90vw] max-h-[90vh] z-10 pointer-events-none"
            >
              <img 
                src={fullScreenImage} 
                alt="Enlarged product" 
                className="w-full h-full object-contain rounded-2xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Security Engine Status Indicator */}
      <div className="fixed bottom-8 left-8 z-[60] group cursor-default">
        <div className={`flex items-center gap-3 px-3 py-2 backdrop-blur-xl border rounded-2xl text-white shadow-2xl transition-all duration-700 ${
          securityStatus === "clean" 
          ? "bg-zinc-950/80 border-white/5 shadow-black/50 hover:bg-zinc-900/90 hover:scale-105" 
          : "bg-red-950/80 border-red-500/50 shadow-red-900/50 scale-110"
        }`}>
          <div className="relative">
            {securityStatus === "clean" ? (
              <ShieldCheck className="text-emerald-400" size={18} />
            ) : (
              <AlertCircle className="text-red-400 animate-bounce" size={18} />
            )}
            <div className={`absolute inset-0 blur-md opacity-20 animate-pulse ${
              securityStatus === "clean" ? "bg-emerald-400" : "bg-red-400"
            }`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] leading-none mb-1">
              Kernel Guard
            </span>
            <span className="text-[11px] font-bold text-white leading-none">
              {securityStatus === "clean" ? "C++ Core Active" : "Threat Blocked"}
            </span>
          </div>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ml-1 ${
            securityStatus === "clean" ? "bg-emerald-500" : "bg-red-500"
          }`} />
        </div>
        
        {/* Security Info Tooltip */}
        <div className="absolute bottom-full left-0 mb-4 w-72 p-5 bg-zinc-950 border border-white/10 rounded-3xl opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 pointer-events-none transition-all duration-500 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Cpu size={14} className="text-amber-400" />
              Souqna System Shield
            </h4>
            <span className="text-[10px] font-bold text-zinc-600">v2.1.0-STABLE</span>
          </div>
          <ul className="space-y-3">
            {[
              { name: "C++ Flow Encryption", status: "Active", color: "text-emerald-400" },
              { name: "Advanced CSP v3", status: "Enabled", color: "text-emerald-400" },
              { name: "Rate Limit Protocol", status: "Monitoring", color: "text-blue-400" },
              { name: "Zero-Trust Firebase", status: "Verified", color: "text-emerald-400" }
            ].map((item, idx) => (
              <li key={idx} className="text-[10px] text-zinc-400 flex items-center justify-between font-medium">
                <span>{item.name}</span>
                <span className={`${item.color} font-bold opacity-80 uppercase tracking-wider`}>{item.status}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-[9px] text-zinc-500 leading-relaxed italic">يتم مراقبة كافة العمليات في الوقت الفعلي لضمان تجربة تداول آمنة.</p>
          </div>
        </div>
      </div>

      {/* Chat List Modal */}
      <AnimatePresence>
        {isChatListOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsChatListOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[600px]"
            >
              <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <h2 className="text-2xl font-display font-bold">المحادثات</h2>
                <button onClick={() => setIsChatListOpen(false)} className="p-2 hover:bg-zinc-100 rounded-2xl transition-all"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {chats.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 text-zinc-400">
                    <MessageSquare size={48} className="mb-4 opacity-20" />
                    <p className="font-bold">لا توجد محادثات نشطة حالياً</p>
                    <p className="text-xs mt-2 leading-relaxed">ابدأ الدردشة مع البائعين من صفحة المنتجات</p>
                  </div>
                ) : (
                  chats.map(chat => (
                    <button
                      key={chat.id}
                      onClick={() => {
                        setActiveChat(chat);
                        setIsChatListOpen(false);
                      }}
                      className={`w-full p-6 rounded-3xl flex items-center gap-5 transition-all text-right ${
                        activeChat?.id === chat.id ? "bg-zinc-900 text-white shadow-xl shadow-zinc-200" : "hover:bg-zinc-50"
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                        activeChat?.id === chat.id ? "bg-white/10" : "bg-zinc-100"
                      }`}>
                        <MessageSquare size={24} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold truncate text-lg">{chat.productName}</h4>
                        </div>
                        {chat.lastMessage && (
                          <p className={`text-sm truncate font-medium ${activeChat?.id === chat.id ? "text-zinc-400" : "text-zinc-500"}`}>
                            {chat.lastMessage}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent Chat Window */}
      <AnimatePresence>
        {activeChat && (
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.9 }}
            className="fixed bottom-8 right-8 z-[90] w-full max-w-[400px] bg-white rounded-[40px] shadow-2xl border border-zinc-100 overflow-hidden flex flex-col h-[550px] md:h-[650px]"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <MessageSquare size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm truncate max-w-[180px]">{activeChat.productName}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">متصل الآن</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setIsChatListOpen(true); setActiveChat(null); }} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <ArrowUpDown size={18} className="rotate-90" />
                </button>
                <button onClick={() => setActiveChat(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-4 bg-zinc-50">
              {chatMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${msg.senderId === user?.uid ? "items-end" : "items-start"}`}
                >
                  <div className={`max-w-[85%] p-4 rounded-3xl text-sm font-medium leading-relaxed ${
                    msg.senderId === user?.uid 
                    ? "bg-zinc-900 text-white rounded-tr-none" 
                    : "bg-white text-zinc-900 shadow-sm border border-zinc-100 rounded-tl-none"
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] font-bold text-zinc-400 mt-2 px-2 uppercase">
                    {msg.timestamp?.toDate ? new Intl.DateTimeFormat('ar-DZ', { hour: 'numeric', minute: 'numeric' }).format(msg.timestamp.toDate()) : "الآن"}
                  </span>
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grainy">
                  <MessageSquare size={48} className="mb-4" />
                  <p className="text-xs font-black uppercase tracking-tighter italic">بداية المحادثة</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-zinc-100">
              <form 
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="relative flex items-center gap-3"
              >
                <input 
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="اكتب رسالتك..."
                  className="flex-1 h-14 pr-6 pl-14 bg-zinc-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zinc-900 transition-all outline-none"
                />
                <button 
                  type="submit"
                  disabled={isSendingMessage || !newMessage.trim()}
                  className="absolute left-2 w-10 h-10 bg-zinc-900 text-white rounded-xl flex items-center justify-center hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                  <Send size={18} className="rotate-180" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bg-zinc-900 text-white pt-32 pb-16 px-10 mt-32 rounded-t-[80px] md:rounded-t-[120px] overflow-hidden relative">
        <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500 blur-[150px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500 blur-[150px]" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row justify-between gap-16">
          <div className="max-w-md">
            <div className="flex items-center gap-4 mb-8 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-zinc-900 shadow-2xl transition-transform group-hover:scale-110">
                <ShoppingBag size={28} strokeWidth={2.5} />
              </div>
              <span className="text-4xl font-display font-bold tracking-tight">سوقنا</span>
            </div>
            <p className="text-zinc-400 leading-[1.8] text-lg font-medium mb-10">منصتكم المفضلة لبيع وشراء كل شيء. تم تصميمها لتوفر لكم تجربة تسوق فريدة وآمنة في العالم العربي، بمستوى عالمي وتفاصيل عربية.</p>
          </div>
          
          <div className="flex flex-wrap gap-x-24 gap-y-16">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8">التسوق</h4>
              <ul className="space-y-4 font-bold text-zinc-300">
                <li className="hover:text-amber-400 cursor-pointer transition-colors">إلكترونيات</li>
                <li className="hover:text-amber-400 cursor-pointer transition-colors">إكسسوارات</li>
                <li className="hover:text-amber-400 cursor-pointer transition-colors">تصوير</li>
                <li className="hover:text-amber-400 cursor-pointer transition-colors">العروض الحصرية</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8">الدعم</h4>
              <ul className="space-y-4 font-bold text-zinc-300">
                <li className="hover:text-amber-400 cursor-pointer transition-colors">مركز المساعدة</li>
                <li className="hover:text-amber-400 cursor-pointer transition-colors">الشحن والتوصيل</li>
                <li className="hover:text-amber-400 cursor-pointer transition-colors">
                  <a href="mailto:a1810437@gmail.com">تواصل معنا</a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-8">الأمان والخصوصية</h4>
              <ul className="space-y-4 font-bold text-zinc-300">
                <li className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  <span>حماية C++ Kernel</span>
                </li>
                <li className="flex items-center gap-2">
                  <Lock size={16} className="text-amber-400" />
                  <span>تشفير البيانات</span>
                </li>
                <li className="flex items-center gap-2">
                  <Cpu size={16} className="text-blue-400" />
                  <span>نظام التحقق الذكي</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-32 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 text-xs font-bold uppercase tracking-widest text-zinc-500">
          <div className="flex flex-col gap-2">
            <p className="">© 2026 سوقنا. جميع الحقوق محفوظة.</p>
            <p className="text-zinc-600 normal-case font-medium">تم تطوير و بناء الموقع من طرف عبد السلام عاشور بوعينان</p>
          </div>
          <div className="flex gap-10">
            <span className="hover:text-white cursor-pointer transition-colors">الشروط والأحكام</span>
            <span className="hover:text-white cursor-pointer transition-colors">سياسة الخصوصية</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
