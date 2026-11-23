import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Database,
  IndianRupee,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-react';
import './App.css';
import api from './services/api';

function getStoredCustomer() {
  try {
    return JSON.parse(localStorage.getItem('anantaora_customer') || 'null');
  } catch {
    return null;
  }
}

function SiteHeader() {
  const navigate = useNavigate();
  const customer = getStoredCustomer();

  const logout = () => {
    localStorage.removeItem('anantaora_customer_token');
    localStorage.removeItem('anantaora_customer');
    navigate('/');
  };

  return (
    <header className="topbar">
      <Link className="brand-wrap" to="/" aria-label="ANANTAORA home">
        <div className="brand-mark">A</div>
        <span>ANANTAORA</span>
      </Link>
      <nav className="main-nav">
        <Link to="/">Home</Link>
        <Link to="/how-it-works">How it works</Link>
        <Link to="/creators">Creators</Link>
        <Link to="/contact">Contact</Link>
      </nav>
      {customer ? (
        <div className="account-nav">
          <Link className="nav-cta" to="/account">My purchases</Link>
          <button className="secondary-btn" type="button" onClick={logout}>Sign out</button>
        </div>
      ) : (
        <div className="account-nav">
          <Link className="secondary-btn" to="/login">Log in</Link>
          <Link className="nav-cta" to="/signup">Create account</Link>
        </div>
      )}
    </header>
  );
}

function Home() {
  return (
    <div className="page-shell">
      <SiteHeader />

      <main>
        <section className="hero-section">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hero-copy"
          >
            <span className="eyebrow">Premium digital product commerce</span>
            <h1>Monetize your expertise with protected digital products.</h1>
            <p>
              ANANTAORA helps creators launch premium PDFs, protect access with secure checkout,
              and manage real sales through a founder-first commerce platform.
            </p>
            <div className="hero-actions">
              <Link className="primary-btn" to="/products/30-day-creator-playbook">
                Buy the playbook <ArrowRight size={18} />
              </Link>
              <Link className="secondary-btn" to="/how-it-works">How it works</Link>
            </div>
            <div className="trust-row">
              <div><ShieldCheck size={16} /> Secure checkout</div>
              <div><BookOpen size={16} /> Real PDF access</div>
              <div><BadgeCheck size={16} /> Verified payments</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="hero-card"
          >
            <div className="cover-art">
              <div className="cover-glow"></div>
              <div className="cover-title">
  <img src="/07_creator_playbook_cover.jpg.jpeg" alt="30 Day Creator Playbook" />
</div>
            </div>
            <div className="card-meta">
              <span>Creator: Aarav Sharma</span>
              <strong>₹99</strong>
            </div>
          </motion.div>
        </section>

        <section className="feature-grid">
          <div className="feature-box">
            <Sparkles size={20} />
            <h3>Creator-first commerce</h3>
            <p>Launch one product or many with unique URLs, protected access, and clean sales tracking.</p>
          </div>
          <div className="feature-box">
            <ShieldCheck size={20} />
            <h3>Protected delivery</h3>
            <p>Only verified payments unlock access; the PDF is stored privately and streamed safely.</p>
          </div>
          <div className="feature-box">
            <BookOpen size={20} />
            <h3>Built for digital products</h3>
            <p>From playbooks to guides and training assets, the platform is designed for digital publishing.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function HowItWorks() {
  return <div className="page-shell content-page"><h1>How it works</h1><p>Creator publishes a product → customer buys securely → Razorpay verifies → access token unlocks PDF delivery.</p></div>;
}

function Creators() {
  return <div className="page-shell content-page"><h1>Creators</h1><p>ANANTAORA helps founders and creators sell premium digital products with transparent revenue sharing and secure delivery.</p></div>;
}

function Contact() {
  return <div className="page-shell content-page"><h1>Contact</h1><p>Email: support@anantaora.com</p></div>;
}

function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [customer] = useState(getStoredCustomer);
  const [productResult, setProductResult] = useState({
    slug: null,
    product: null,
    paymentMode: null,
    checkoutReady: false,
    paymentConfigured: false,
    pdfAvailable: false,
    error: '',
    loading: true,
  });
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingVerification, setPendingVerification] = useState(null);

  useEffect(() => {
    let active = true;
    api.get(`/products/${encodeURIComponent(slug)}`)
      .then(({ data }) => {
        if (active) {
          setProductResult({
            slug,
            product: data.product,
            paymentMode: data.paymentMode,
            checkoutReady: data.checkoutReady,
            paymentConfigured: data.paymentConfigured,
            pdfAvailable: data.pdfAvailable,
            error: '',
            loading: false,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setProductResult({
            slug,
            product: null,
            paymentMode: null,
            checkoutReady: false,
            paymentConfigured: false,
            pdfAvailable: false,
            error: error.response?.data?.message || (
              error.code === 'ERR_NETWORK'
                ? 'The product service is unavailable. Start the backend and try again.'
                : 'This product could not be loaded.'
            ),
            loading: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const loadingProduct = productResult.slug !== slug || productResult.loading;
  const product = productResult.slug === slug ? productResult.product : null;

  const verifyPayment = async (internalOrderId, paymentResponse) => {
    try {
      const verification = await api.post('/payments/verify', {
        internalOrderId,
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
      });
      sessionStorage.setItem('anantaora_download_token', verification.data.downloadToken);
      setPendingVerification(null);
      navigate('/success');
    } catch (error) {
      setPendingVerification({ internalOrderId, paymentResponse });
      setErrorMessage(error.response?.data?.message || 'Payment may have completed, but verification could not finish. Retry verification before paying again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const buyNow = async (event) => {
    event.preventDefault();
    if (!product) return;
    if (!localStorage.getItem('anantaora_customer_token')) {
      navigate(`/login?redirect=${encodeURIComponent(`/products/${slug}`)}`);
      return;
    }
    setCheckoutLoading(true);
    setErrorMessage('');

    try {
      const response = await api.post('/payments/create-order', {
        productId: product.id,
      });

      const { key, amount, currency, order } = response.data;
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
          document.body.appendChild(script);
        });
      }

      const razorpayCheckout = new window.Razorpay({
        key,
        amount,
        currency,
        name: 'ANANTAORA',
        description: product.title,
        order_id: order.id,
        handler: (paymentResponse) => verifyPayment(response.data.internalOrderId, paymentResponse),
        prefill: { name: customer?.name, email: customer?.email },
        theme: { color: '#3b82f6' },
        modal: {
          ondismiss: () => setCheckoutLoading(false),
        },
      });
      razorpayCheckout.on('payment.failed', (paymentFailure) => {
        setCheckoutLoading(false);
        setErrorMessage(paymentFailure.error?.description || 'Payment failed. You have not been charged for an unverified order.');
      });
      razorpayCheckout.open();
    } catch (error) {
      console.error('Checkout failed:', error);
      setErrorMessage(error.response?.data?.message || error.message || 'Checkout could not be started.');
      setCheckoutLoading(false);
    }
  };

  if (loadingProduct) {
    return <div className="page-shell content-page"><p>Loading product…</p></div>;
  }
  if (!product) {
    return <div className="page-shell content-page"><h1>Product unavailable</h1><p>{productResult.error}</p></div>;
  }

  return (
    <div className="page-shell">
      <SiteHeader />
      <main className="product-page">
        <div className="product-visual">
          <img src={product.coverImage} alt={product.title} />
        </div>
        <div className="product-info">
          <span className="eyebrow">By {product.creatorName}</span>
          <h1>{product.title}</h1>
          <p>{product.description}</p>
          <div className="price-row">
            <strong>₹{(product.pricePaise / 100).toLocaleString('en-IN')}</strong>
            <span>
              {productResult.paymentMode
                ? `Razorpay ${productResult.paymentMode === 'live' ? 'Live' : 'Test'} Mode`
                : 'Payment mode unavailable'}
            </span>
          </div>
          {!productResult.paymentConfigured && (
            <p className="form-message" role="status">Checkout is unavailable until valid Razorpay {productResult.paymentMode === 'live' ? 'Live' : 'Test'} Mode keys are configured on the backend.</p>
          )}
          {!productResult.pdfAvailable && (
            <p className="form-message" role="status">Checkout is unavailable until the product PDF is uploaded in the founder dashboard.</p>
          )}
          <form className="checkout-form" onSubmit={buyNow}>
            {customer ? (
              <p className="account-note">Buying as <strong>{customer.name}</strong> ({customer.email}). Your verified purchases will be saved to your account.</p>
            ) : (
              <p className="account-note">
                <Link to={`/login?redirect=${encodeURIComponent(`/products/${slug}`)}`}>Log in</Link> or <Link to={`/signup?redirect=${encodeURIComponent(`/products/${slug}`)}`}>create an account</Link> before checkout. Purchases are saved to your account for future downloads.
              </p>
            )}
            {errorMessage && <p className="form-message" role="alert">{errorMessage}</p>}
            <button className="primary-btn" type="submit" disabled={checkoutLoading || !productResult.checkoutReady}>
              {checkoutLoading ? 'Opening secure checkout…' : 'Buy Now'}
            </button>
            {pendingVerification && (
              <button
                className="secondary-btn"
                type="button"
                disabled={checkoutLoading}
                onClick={() => {
                  setCheckoutLoading(true);
                  verifyPayment(pendingVerification.internalOrderId, pendingVerification.paymentResponse);
                }}
              >
                Retry payment verification
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}

function SuccessPage() {
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const token = sessionStorage.getItem('anantaora_download_token');

  const downloadPdf = async () => {
    if (!token) return;
    setDownloadLoading(true);
    setErrorMessage('');
    try {
      const response = await api.get(`/download/${encodeURIComponent(token)}`, { responseType: 'blob' });
      if (response.data.type?.includes('application/json')) {
        const error = JSON.parse(await response.data.text());
        throw new Error(error.message || 'The PDF could not be downloaded.');
      }
      const objectUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      const disposition = response.headers['content-disposition'] || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'your-purchase.pdf';
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      let message = error.message || 'The PDF could not be downloaded.';
      if (error.response?.data instanceof Blob) {
        try {
          const errorData = JSON.parse(await error.response.data.text());
          message = errorData.message || message;
        } catch {
          message = 'The PDF could not be downloaded. Please try again.';
        }
      } else {
        message = error.response?.data?.message || message;
      }
      setErrorMessage(message);
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div className="page-shell content-page">
      <h1>{token ? 'Payment verified' : 'Purchase access unavailable'}</h1>
      <p>{token ? 'Your payment was verified by the server. Download your book below.' : 'No verified purchase session was found. Complete checkout first or contact support.'}</p>
      {token && <button className="primary-btn" onClick={downloadPdf} disabled={downloadLoading}>{downloadLoading ? 'Preparing download…' : 'Download Your Book'}</button>}
      {localStorage.getItem('anantaora_customer_token') && <Link className="secondary-btn" to="/account">View all my purchases</Link>}
      {errorMessage && <p className="form-message" role="alert">{errorMessage}</p>}
    </div>
  );
}

function CustomerAuth({ signup = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const redirect = new URLSearchParams(location.search).get('redirect');
  const destination = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/account';

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setErrorMessage('');
    try {
      const { data } = await api.post(`/auth/${signup ? 'signup' : 'login'}`, {
        ...(signup ? { name: form.get('name') } : {}),
        email: form.get('email'),
        password: form.get('password'),
      });
      localStorage.setItem('anantaora_customer_token', data.token);
      localStorage.setItem('anantaora_customer', JSON.stringify(data.user));
      navigate(destination, { replace: true });
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Your account request could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <SiteHeader />
      <main className="auth-page">
        <form className="auth-card" onSubmit={submit}>
          <h1>{signup ? 'Create your account' : 'Log in to your account'}</h1>
          <p>Save your purchases and download your books again whenever you need them.</p>
          {signup && (
            <label>
              Name
              <input name="name" autoComplete="name" maxLength={100} required />
            </label>
          )}
          <label>
            Email
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input type="password" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} maxLength={72} required />
          </label>
          {signup && <p className="account-note">Use at least 8 characters. Your password is stored securely as a hash.</p>}
          {errorMessage && <p className="form-message" role="alert">{errorMessage}</p>}
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
          </button>
          <p className="account-note">
            {signup ? 'Already have an account? ' : 'New here? '}
            <Link to={`${signup ? '/login' : '/signup'}${location.search}`}>{signup ? 'Log in' : 'Create an account'}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}

function CustomerAccount() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('anantaora_customer_token')) {
      navigate('/login?redirect=%2Faccount', { replace: true });
      return;
    }
    api.get('/auth/purchases')
      .then(({ data }) => setPurchases(data.purchases))
      .catch((error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('anantaora_customer_token');
          localStorage.removeItem('anantaora_customer');
          navigate('/login?redirect=%2Faccount', { replace: true });
          return;
        }
        setErrorMessage(error.response?.data?.message || 'Your purchases could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const downloadPurchase = async (purchase) => {
    setDownloadingId(purchase.orderId);
    setErrorMessage('');
    try {
      const { data } = await api.post(`/auth/purchases/${encodeURIComponent(purchase.orderId)}/download`);
      const response = await api.get(`/download/${encodeURIComponent(data.downloadToken)}`, { responseType: 'blob' });
      if (response.data.type?.includes('application/json')) {
        const error = JSON.parse(await response.data.text());
        throw new Error(error.message || 'The PDF could not be downloaded.');
      }
      const objectUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      const disposition = response.headers['content-disposition'] || '';
      anchor.href = objectUrl;
      anchor.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'your-purchase.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('anantaora_customer_token');
        localStorage.removeItem('anantaora_customer');
        navigate('/login?redirect=%2Faccount', { replace: true });
        return;
      }
      if (error.response?.data instanceof Blob) {
        try {
          const errorData = JSON.parse(await error.response.data.text());
          setErrorMessage(errorData.message || 'The PDF could not be downloaded.');
          return;
        } catch {
          setErrorMessage('The PDF could not be downloaded. Please try again.');
          return;
        }
      }
      setErrorMessage(error.response?.data?.message || error.message || 'The PDF could not be downloaded.');
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <div className="page-shell">
      <SiteHeader />
      <main className="account-page">
        <h1>My purchases</h1>
        <p>Download any verified purchase again from here. Each download request gets a fresh secure link.</p>
        {errorMessage && <p className="form-message" role="alert">{errorMessage}</p>}
        {loading ? <p>Loading your purchases…</p> : purchases.length === 0 ? (
          <section className="purchase-card">
            <p>No purchases are linked to this account yet.</p>
            <Link className="primary-btn" to="/products/30-day-creator-playbook">Browse the book</Link>
          </section>
        ) : (
          <div className="purchase-list">
            {purchases.map((purchase) => (
              <article className="purchase-card" key={purchase.orderId}>
                <div>
                  <h2>{purchase.title}</h2>
                  <p>
                    Purchased {purchase.paidAt ? new Date(purchase.paidAt).toLocaleDateString() : ''}
                    {' · '}₹{(purchase.amountPaise / 100).toLocaleString('en-IN')}
                  </p>
                </div>
                <button className="primary-btn" type="button" disabled={Boolean(downloadingId)} onClick={() => downloadPurchase(purchase)}>
                  {downloadingId === purchase.orderId ? 'Preparing download…' : 'Download again'}
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      email: form.get('email'),
      password: form.get('password'),
    };

    setLoading(true);
    setErrorMessage('');
    try {
      const response = await api.post('/admin/login', payload);
      localStorage.setItem('anantaora_token', response.data.token);
      window.location.href = '/admin';
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Founder login failed. Check the API connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell auth-page">
      <form className="auth-card" onSubmit={handleLogin}>
        <h1>Founder login</h1>
        <label>
          Founder email
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {errorMessage && <p className="form-message" role="alert">{errorMessage}</p>}
        <button type="submit" className="primary-btn" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
      </form>
    </div>
  );
}

function AdminDashboard() {
  const [products, setProducts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [period, setPeriod] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem('anantaora_token')) {
      navigate('/admin/login', { replace: true });
      return;
    }

    let active = true;
    Promise.all([
      api.get(`/admin/dashboard?period=${period}`),
      api.get('/products'),
    ])
      .then(([dashboardResponse, productResponse]) => {
        if (active) {
          setDashboard(dashboardResponse.data.dashboard);
          setProducts(productResponse.data.products);
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem('anantaora_token');
          navigate('/admin/login', { replace: true });
          return;
        }
        setErrorMessage(error.response?.data?.message || 'Admin data could not be loaded. Check the backend and database connection.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, period]);

  const uploadPdf = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const productId = form.get('productId');
    setUploading(true);
    setUploadMessage('');
    try {
      const response = await api.put(`/admin/products/${encodeURIComponent(productId)}/pdf`, form);
      setUploadMessage(response.data.message);
      formElement.reset();
    } catch (error) {
      setUploadMessage(error.response?.data?.message || 'PDF upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('anantaora_token');
    navigate('/admin/login', { replace: true });
  };
  const selectedSales = dashboard?.sales.period;
  const allTimeSales = dashboard?.sales.allTime;
  const maxRevenue = Math.max(1, ...(dashboard?.sales.buckets || []).map((bucket) => bucket.netRevenuePaise));
  const formatRupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="page-shell admin-page">
      <header className="admin-header">
        <div>
          <span className="eyebrow">ANANTAORA · ADMIN</span>
          <h1>Sales dashboard</h1>
          <p>Live sales and database summaries from your connected MongoDB database.</p>
        </div>
        <button className="secondary-btn" type="button" onClick={signOut}><LogOut size={16} /> Sign out</button>
      </header>

      <main>
        <div className="admin-toolbar">
          <label>
            Revenue period
            <select value={period} onChange={(event) => {
              setLoading(true);
              setErrorMessage('');
              setPeriod(event.target.value);
            }}>
              <option value="weekly">This week</option>
              <option value="monthly">This month</option>
              <option value="yearly">This year</option>
            </select>
          </label>
          {dashboard && <span>Updated {new Date(dashboard.endDate).toLocaleString('en-IN')}</span>}
        </div>

        {errorMessage && <p className="admin-error" role="alert">{errorMessage}</p>}
        {loading ? <p className="admin-loading">Loading sales and database information…</p> : selectedSales && allTimeSales && (
          <>
            <section className="admin-metrics" aria-label="Sales summary">
              <article className="admin-metric">
                <span><IndianRupee size={18} /> {dashboard.periodTitle} net revenue</span>
                <strong>{formatRupees(selectedSales.netRevenuePaise)}</strong>
                <small>Gross {formatRupees(selectedSales.grossRevenuePaise)} · refunds {formatRupees(selectedSales.refundsPaise)}</small>
              </article>
              <article className="admin-metric">
                <span><ShoppingBag size={18} /> {dashboard.periodTitle} purchases</span>
                <strong>{selectedSales.purchases.toLocaleString('en-IN')}</strong>
                <small>All-time purchases: {allTimeSales.purchases.toLocaleString('en-IN')}</small>
              </article>
              <article className="admin-metric">
                <span><Users size={18} /> Customers who purchased</span>
                <strong>{selectedSales.customers.toLocaleString('en-IN')}</strong>
                <small>All-time buyers: {allTimeSales.customers.toLocaleString('en-IN')}</small>
              </article>
              <article className="admin-metric">
                <span><Database size={18} /> Catalog & customers</span>
                <strong>{dashboard.sales.totalProducts.toLocaleString('en-IN')} products</strong>
                <small>{dashboard.sales.totalCustomers.toLocaleString('en-IN')} registered customers</small>
              </article>
            </section>

            <section className="admin-panel">
              <div className="admin-section-heading">
                <div><h2>Revenue</h2><p>{dashboard.periodTitle} · Indian rupees</p></div>
                <strong>{formatRupees(selectedSales.netRevenuePaise)}</strong>
              </div>
              <div className={`revenue-chart revenue-chart-${period}`} role="img" aria-label={`${dashboard.periodTitle} revenue by ${period === 'yearly' ? 'month' : 'day'}`}>
                {dashboard.sales.buckets.map((bucket) => (
                  <div className="revenue-column" key={bucket.key} title={`${bucket.label}: ${formatRupees(bucket.netRevenuePaise)}`}>
                    <div className="revenue-bar-wrap">
                      <div className="revenue-bar" style={{ height: `${Math.max(3, (bucket.netRevenuePaise / maxRevenue) * 100)}%` }} />
                    </div>
                    <span>{bucket.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-section-heading">
                <div><h2>Recent purchases</h2><p>Most recent verified orders</p></div>
                <span>{dashboard.sales.totalOrders.toLocaleString('en-IN')} total orders</span>
              </div>
              {dashboard.recentOrders.length === 0 ? <p className="admin-empty">No verified purchases yet.</p> : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Book</th><th>Customer</th><th>Amount</th><th>Status</th><th>Purchased</th></tr></thead>
                    <tbody>
                      {dashboard.recentOrders.map((order) => (
                        <tr key={order.orderReference}>
                          <td>{order.productTitle}</td>
                          <td>{order.customerName}<small>{order.customerEmail}</small></td>
                          <td>{formatRupees(order.amountPaise)}</td>
                          <td><span className={`order-status order-status-${order.status}`}>{order.status}</span></td>
                          <td>{order.paidAt ? new Date(order.paidAt).toLocaleDateString('en-IN') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="admin-panel">
              <div className="admin-section-heading">
                <div><h2>Database overview</h2><p>Collection names and estimated document counts. Record contents and credentials are not exposed.</p></div>
                <span className="database-status"><span /> MongoDB connected</span>
              </div>
              <div className={`mirror-notice mirror-notice-${dashboard.database.mirror.state}`} role="status">
                {dashboard.database.mirror.state === 'healthy'
                  ? `Local mirror healthy · ${dashboard.database.mirror.databaseName} · last synced ${new Date(dashboard.database.mirror.lastSyncedAt).toLocaleString('en-IN')}`
                  : dashboard.database.mirror.state === 'syncing'
                    ? 'Local MongoDB mirror is taking its initial Atlas snapshot.'
                    : dashboard.database.mirror.state === 'degraded'
                      ? 'Local mirror is unavailable or stopped. Atlas remains primary; restart the backend to attempt mirroring again.'
                      : 'Local mirror is not configured. Configure LOCAL_MONGODB_URI to enable Atlas-to-local mirroring.'}
              </div>
              <div className="database-summary">
                <span>Database <strong>{dashboard.database.name}</strong></span>
                <span>Collections <strong>{dashboard.database.collectionCount.toLocaleString('en-IN')}</strong></span>
                <span>Data size <strong>{(dashboard.database.dataSizeBytes / (1024 * 1024)).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MB</strong></span>
                <span>Storage <strong>{(dashboard.database.storageSizeBytes / (1024 * 1024)).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MB</strong></span>
              </div>
              <div className="collection-grid">
                {dashboard.database.collections.map((collection) => (
                  <article className="collection-card" key={collection.name}>
                    <strong>{collection.name}</strong>
                    <span>{collection.documents.toLocaleString('en-IN')} documents</span>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="admin-panel upload-panel">
          <div className="admin-section-heading">
            <div><h2>Product PDF storage</h2><p>Upload a PDF to private MongoDB GridFS storage before enabling checkout.</p></div>
            <RefreshCw size={18} />
          </div>
          <form className="admin-upload-form" onSubmit={uploadPdf}>
            <label>
              Product
              <select name="productId" required>
                {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
              </select>
            </label>
            <label>
              PDF file (max 50 MB)
              <input type="file" name="pdf" accept="application/pdf,.pdf" required />
            </label>
            <button className="primary-btn" type="submit" disabled={uploading || products.length === 0}>{uploading ? 'Uploading…' : 'Upload PDF'}</button>
            {uploadMessage && <p className="form-message" role="status">{uploadMessage}</p>}
          </form>
        </section>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/products/:slug" element={<ProductPage />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/login" element={<CustomerAuth />} />
        <Route path="/signup" element={<CustomerAuth signup />} />
        <Route path="/account" element={<CustomerAccount />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;